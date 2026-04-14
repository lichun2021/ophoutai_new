import { defineEventHandler, readBody, getQuery, createError, getHeader } from 'h3';
import * as ExternalGiftPackageModel from '../../model/externalGiftPackage';
import * as AdminModel from '../../model/admin';
import { sql } from '../../db';
import { validateGiftItems, formatGiftItemsDisplay } from '../../utils/itemConfig';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  
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
      message: '只有超级管理员可以管理商城礼包',
    });
  }
  
  try {
    switch (method) {
      case 'GET':
        return await handleGetGiftPackages(event);
      case 'POST':
        return await handleCreateGiftPackage(event);
      case 'PUT':
        return await handleUpdateGiftPackage(event);
      case 'DELETE':
        return await handleDeleteGiftPackage(event);
      default:
        throw createError({
          status: 405,
          message: '不支持的请求方法',
        });
    }
  } catch (error: any) {
    console.error('礼包管理API错误:', error);
    throw createError({
      status: error.status || 500,
      message: error.message || '服务器内部错误',
    });
  }
});

// 获取礼包列表
async function handleGetGiftPackages(event: any) {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const category = query.category as string;
  const isActive = query.is_active;
  const gameCode = query.game_code as string || 'hzwqh';
  
  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const values: any[] = [];
  
  if (gameCode) {
    whereClause += ' AND game_code = ?';
    values.push(gameCode);
  }
  
  if (category && category.trim() !== '') {
    whereClause += ' AND category = ?';
    values.push(category);
  }
  
  if (isActive !== undefined && isActive !== '' && isActive !== null) {
    whereClause += ' AND is_active = ?';
    values.push(isActive === 'true' ? 1 : 0);
  }
  
  // 获取总数
  const countQuery = `SELECT COUNT(*) as total FROM ExternalGiftPackages ${whereClause}`;
  const countResult = await sql({
    query: countQuery,
    values
  }) as any[];
  
  const total = countResult[0]?.total || 0;
  
  // 获取分页数据
  const offset = (page - 1) * pageSize;
  const dataQuery = `
    SELECT * FROM ExternalGiftPackages 
    ${whereClause} 
    ORDER BY sort_order DESC, created_at DESC 
    LIMIT ?, ?
  `;
  
  const giftPackages = await sql({
    query: dataQuery,
    values: [...values, offset, pageSize]
  }) as ExternalGiftPackageModel.ExternalGiftPackage[];
  
  // 格式化礼包物品显示
  const formattedPackages = giftPackages.map(pkg => {
    // 安全解析gift_items，可能已经是对象了
    let giftItems;
    try {
      if (typeof pkg.gift_items === 'string') {
        giftItems = JSON.parse(pkg.gift_items || '[]');
      } else {
        giftItems = pkg.gift_items || [];
      }
    } catch (error) {
      console.error('解析礼包物品失败:', pkg.package_code, error);
      giftItems = [];
    }
    
    return {
      ...pkg,
      gift_items_display: formatGiftItemsDisplay(giftItems),
      gift_items: giftItems
    };
  });
  
  return {
    success: true,
    data: {
      list: formattedPackages,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

// 创建礼包
async function handleCreateGiftPackage(event: any) {
  const body = await readBody(event);
  
  // 验证必填字段
  const { 
    package_code, 
    package_name, 
    description,
    price_platform_coins,
    gift_items,
    category = 'general',
    game_code = 'hzwqh'
  } = body;
  
  if (!package_code || !package_name || !price_platform_coins || !gift_items) {
    throw createError({
      status: 400,
      message: '缺少必填字段：package_code, package_name, price_platform_coins, gift_items'
    });
  }
  
  // 验证礼包物品格式
  const validation = validateGiftItems(gift_items);
  if (!validation.valid) {
    throw createError({
      status: 400,
      message: '礼包物品格式错误：' + validation.errors.join('，')
    });
  }
  
  // 检查礼包代码是否已存在
  const existingPackage = await ExternalGiftPackageModel.getGiftPackageByCode(package_code);
  if (existingPackage) {
    throw createError({
      status: 400,
      message: '礼包代码已存在'
    });
  }
  
  // 创建礼包数据
  const packageData = {
    package_code,
    package_name,
    description: description || '',
    price_platform_coins: Number(price_platform_coins),
    price_real_money: Number(body.price_real_money) || 0,
    gift_items: JSON.stringify(gift_items),
    category,
    icon_url: body.icon_url || '',
    is_active: body.is_active !== false,
    is_limited: body.is_limited === true,
    total_quantity: Number(body.total_quantity) || 0,
    sold_quantity: 0,
    max_per_user: Number(body.max_per_user) || 0,
    start_time: body.start_time || null,
    end_time: body.end_time || null,
    available_weekdays: body.available_weekdays || null,
    sort_order: Number(body.sort_order) || 0,
    game_code
  };
  
  // 保存到数据库
  const result: any = await sql({
    query: `INSERT INTO ExternalGiftPackages 
            (package_code, package_name, description, price_platform_coins, price_real_money,
             gift_items, category, icon_url, is_active, is_limited, total_quantity, sold_quantity,
             max_per_user, start_time, end_time, available_weekdays, sort_order, game_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      packageData.package_code,
      packageData.package_name,
      packageData.description,
      packageData.price_platform_coins,
      packageData.price_real_money,
      packageData.gift_items,
      packageData.category,
      packageData.icon_url,
      packageData.is_active ? 1 : 0,
      packageData.is_limited ? 1 : 0,
      packageData.total_quantity,
      packageData.sold_quantity,
      packageData.max_per_user,
      packageData.start_time,
      packageData.end_time,
      packageData.available_weekdays,
      packageData.sort_order,
      packageData.game_code
    ]
  });
  
  return {
    success: true,
    message: '礼包创建成功',
    data: { id: result.insertId }
  };
}

// 更新礼包
async function handleUpdateGiftPackage(event: any) {
  const body = await readBody(event);
  const { id } = body;
  
  if (!id) {
    throw createError({
      status: 400,
      message: '缺少礼包ID'
    });
  }
  
  // 验证礼包是否存在
  const existingPackage = await ExternalGiftPackageModel.getGiftPackageById(id);
  if (!existingPackage) {
    throw createError({
      status: 404,
      message: '礼包不存在'
    });
  }
  
  // 验证礼包物品格式（如果有更新）
  if (body.gift_items) {
    const validation = validateGiftItems(body.gift_items);
    if (!validation.valid) {
      throw createError({
        status: 400,
        message: '礼包物品格式错误：' + validation.errors.join('，')
      });
    }
  }
  
  // 构建更新字段
  const updateFields = [];
  const updateValues = [];
  
  const updatableFields = [
    'package_name', 'description', 'price_platform_coins', 'price_real_money',
    'category', 'icon_url', 'is_active', 'is_limited', 'total_quantity',
    'max_per_user', 'start_time', 'end_time', 'available_weekdays', 'sort_order'
  ];
  
  updatableFields.forEach(field => {
    if (body[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      if (field === 'is_active' || field === 'is_limited') {
        updateValues.push(body[field] ? 1 : 0);
      } else {
        updateValues.push(body[field]);
      }
    }
  });
  
  if (body.gift_items) {
    updateFields.push('gift_items = ?');
    updateValues.push(JSON.stringify(body.gift_items));
  }
  
  if (updateFields.length === 0) {
    throw createError({
      status: 400,
      message: '没有需要更新的字段'
    });
  }
  
  updateValues.push(id);
  
  await sql({
    query: `UPDATE ExternalGiftPackages SET ${updateFields.join(', ')} WHERE id = ?`,
    values: updateValues
  });
  
  return {
    success: true,
    message: '礼包更新成功'
  };
}

// 删除礼包
async function handleDeleteGiftPackage(event: any) {
  const query = getQuery(event);
  const id = query.id;
  
  if (!id) {
    throw createError({
      status: 400,
      message: '缺少礼包ID'
    });
  }
  
  // 验证礼包是否存在
  const existingPackage = await ExternalGiftPackageModel.getGiftPackageById(Number(id));
  if (!existingPackage) {
    throw createError({
      status: 404,
      message: '礼包不存在'
    });
  }
  
  // 检查是否有购买记录
  const purchaseRecords = await sql({
    query: 'SELECT COUNT(*) as count FROM GiftPackagePurchaseRecords WHERE package_id = ?',
    values: [id]
  }) as any[];
  
  if (purchaseRecords[0]?.count > 0) {
    throw createError({
      status: 400,
      message: '该礼包已有购买记录，不能删除'
    });
  }
  
  await sql({
    query: 'DELETE FROM ExternalGiftPackages WHERE id = ?',
    values: [id]
  });
  
  return {
    success: true,
    message: '礼包删除成功'
  };
} 