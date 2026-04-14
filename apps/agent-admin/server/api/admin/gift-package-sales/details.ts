import { defineEventHandler, readBody, createError, getHeader } from 'h3';
import * as AdminModel from '../../../model/admin';
import { sql } from '../../../db';

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
      message: '只有超级管理员可以查看礼包销售详情',
    });
  }
  
  try {
    return await handleGetSalesDetails(event);
  } catch (error: any) {
    console.error('礼包销售详情API错误:', error);
    throw createError({
      status: error.status || 500,
      message: error.message || '服务器内部错误',
    });
  }
});

// 获取销售详情
async function handleGetSalesDetails(event: any) {
  const body = await readBody(event);
  const packageId = body.package_id as string;
  const startDate = body.start_date as string;
  const endDate = body.end_date as string;
  
  if (!packageId || !startDate || !endDate) {
    throw createError({
      status: 400,
      message: '缺少必填参数：package_id, start_date, end_date'
    });
  }
  
  // 获取礼包基本信息
  const packageQuery = `
    SELECT 
      id as package_id,
      package_code,
      package_name,
      category,
      price_platform_coins + price_real_money as price
    FROM ExternalGiftPackages
    WHERE id = ?
  `;
  
  const packageResult = await sql({
    query: packageQuery,
    values: [packageId]
  }) as any[];
  
  if (!packageResult.length) {
    throw createError({
      status: 404,
      message: '礼包不存在'
    });
  }
  
  const packageInfo = packageResult[0];
  
  // 获取销售统计
  const statsQuery = `
    SELECT 
      COUNT(*) as total_sales,
      SUM(CASE 
        WHEN payment_type = 'platform_coins' THEN platform_coins_paid 
        ELSE real_money_paid 
      END) as total_amount,
      COUNT(DISTINCT user_id) as unique_buyers
    FROM giftpackagepurchaserecords
    WHERE package_id = ? 
      AND created_at >= ? 
      AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
  `;
  
  const statsResult = await sql({
    query: statsQuery,
    values: [packageId, startDate, endDate]
  }) as any[];
  
  // 获取每日销售趋势
  const dailyQuery = `
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as sales,
      SUM(CASE 
        WHEN payment_type = 'platform_coins' THEN platform_coins_paid 
        ELSE real_money_paid 
      END) as amount
    FROM giftpackagepurchaserecords
    WHERE package_id = ? 
      AND created_at >= ? 
      AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;
  
  const dailyResult = await sql({
    query: dailyQuery,
    values: [packageId, startDate, endDate]
  }) as any[];
  
  return {
    success: true,
    data: {
      ...packageInfo,
      total_sales: statsResult[0]?.total_sales || 0,
      total_amount: Number(statsResult[0]?.total_amount || 0),
      unique_buyers: statsResult[0]?.unique_buyers || 0,
      dailyTrend: dailyResult.map(day => ({
        date: day.date,
        sales: day.sales,
        amount: Number(day.amount || 0)
      }))
    }
  };
}

