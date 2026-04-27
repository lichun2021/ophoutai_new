import { defineEventHandler, readBody, createError, getHeader } from 'h3';
import * as AdminModel from '../../model/admin';
import { sql } from '../../db';

export default defineEventHandler(async (event) => {
  // 权限验证 - 只允许超级管理员访问
  const authorizationHeader = getHeader(event, 'authorization');
  const token = authorizationHeader ? parseInt(authorizationHeader) : null;
  
  if (!token) {
    throw createError({
      status: 401,
      message: '未提供认证token',
    });
  }
  
  const adminInfo = await AdminModel.getAdminWithPermissions(token);
  if (!adminInfo || adminInfo.level !== 0) {
    throw createError({
      status: 403,
      message: '只有超级管理员可以查看礼包销售统计',
    });
  }
  
  try {
    return await handleGetSalesData(event);
  } catch (error: any) {
    console.error('礼包销售统计API错误:', error);
    throw createError({
      status: error.status || 500,
      message: error.message || '服务器内部错误',
    });
  }
});

// 获取销售数据
async function handleGetSalesData(event: any) {
  const body = await readBody(event);
  const startDate = body.start_date as string;
  const endDate = body.end_date as string;
  const category = body.category as string;
  const packageName = body.package_name as string;
  const page = Number(body.page) || 1;
  const pageSize = Number(body.page_size) || 20;
  
  // 验证必填参数
  if (!startDate || !endDate) {
    throw createError({
      status: 400,
      message: '缺少必填参数：start_date, end_date'
    });
  }
  
  // 验证日期范围
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // 移除7天限制 - 允许查询任意时间范围
  // const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  // if (daysDiff > 7) {
  //   throw createError({
  //     status: 400,
  //     message: '查询天数不能超过7天'
  //   });
  // }
  
  if (start > end) {
    throw createError({
      status: 400,
      message: '开始日期不能大于结束日期'
    });
  }
  
  // 构建查询条件
  let whereClause = 'WHERE r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
  const values: any[] = [startDate, endDate];
  
  if (category && category.trim() !== '') {
    whereClause += ' AND p.category = ?';
    values.push(category);
  }
  
  if (packageName && packageName.trim() !== '') {
    whereClause += ' AND p.package_name LIKE ?';
    values.push(`%${packageName}%`);
  }
  
  // 获取销售统计数据
  const salesQuery = `
    SELECT 
      p.id as package_id,
      p.package_code,
      p.package_name,
      p.category,
      p.price_real_money as price,
      COUNT(r.id) as total_sales,
      SUM(p.price_real_money * r.quantity) as total_amount,
      COUNT(DISTINCT r.user_id) as unique_buyers,
      AVG(p.price_real_money * r.quantity) as avg_price
    FROM giftpackagepurchaserecords r
    INNER JOIN externalgiftpackages p ON r.package_id = p.id
    ${whereClause}
    GROUP BY p.id, p.package_code, p.package_name, p.category
    ORDER BY total_sales DESC
    LIMIT ?, ?
  `;
  
  const offset = (page - 1) * pageSize;
  const salesData = await sql({
    query: salesQuery,
    values: [...values, offset, pageSize]
  }) as any[];
  
  // 获取总数
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM giftpackagepurchaserecords r
    INNER JOIN externalgiftpackages p ON r.package_id = p.id
    ${whereClause}
  `;
  
  const countResult = await sql({
    query: countQuery,
    values
  }) as any[];
  
  const total = countResult[0]?.total || 0;
  
  // 获取统计数据
  // 1. 今天的总销量（使用本地时间）
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayQuery = `
    SELECT COUNT(*) as today_total
    FROM giftpackagepurchaserecords
    WHERE DATE(created_at) = ?
  `;
  const todayResult = await sql({
    query: todayQuery,
    values: [todayStr]
  }) as any[];
  
  // 2. 查询期间的总量和总金额
  const statsQuery = `
    SELECT 
      COUNT(*) as query_total,
      SUM(p.price_real_money * r.quantity) as query_amount,
      COUNT(DISTINCT r.user_id) as unique_users
    FROM giftpackagepurchaserecords r
    INNER JOIN externalgiftpackages p ON r.package_id = p.id
    ${whereClause}
  `;
  
  const statsResult = await sql({
    query: statsQuery,
    values
  }) as any[];
  
  // 3. 当前类型的历史总数（不受日期限制）
  let categoryTotalQuery = '';
  let categoryTotalValues: any[] = [];
  
  if (category && category.trim() !== '') {
    // 如果选择了类型，查询该类型的历史总数
    categoryTotalQuery = `
      SELECT COUNT(*) as category_total
      FROM giftpackagepurchaserecords r
      INNER JOIN externalgiftpackages p ON r.package_id = p.id
      WHERE p.category = ?
    `;
    categoryTotalValues = [category];
  } else {
    // 如果没有选择类型，查询所有类型的历史总数
    categoryTotalQuery = `
      SELECT COUNT(*) as category_total
      FROM giftpackagepurchaserecords
    `;
  }
  
  const categoryTotalResult = await sql({
    query: categoryTotalQuery,
    values: categoryTotalValues
  }) as any[];
  
  return {
    success: true,
    data: {
      list: salesData.map(item => ({
        ...item,
        total_amount: Number(item.total_amount || 0),
        avg_price: Number(item.avg_price || 0)
      })),
      total,
      stats: {
        today_total: todayResult[0]?.today_total || 0,
        query_total: statsResult[0]?.query_total || 0,
        category_total: categoryTotalResult[0]?.category_total || 0,
        query_amount: Number(statsResult[0]?.query_amount || 0),
        unique_users: statsResult[0]?.unique_users || 0
      }
    }
  };
}

