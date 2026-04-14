import { defineEventHandler, readBody, getQuery, createError, getHeader } from 'h3';
import * as AdminModel from '../../model/admin';
import { 
  getItemConfig, 
  getItemById, 
  searchItems, 
  getAllItems,
  addItem,
  updateItem,
  deleteItem
} from '../../utils/itemConfig';

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
      message: '只有超级管理员可以管理物品配置',
    });
  }
  
  try {
    switch (method) {
      case 'GET':
        return await handleGetItems(event);
      case 'POST':
        return await handleCreateItem(event);
      case 'PUT':
        return await handleUpdateItem(event);
      case 'DELETE':
        return await handleDeleteItem(event);
      default:
        throw createError({
          status: 405,
          message: '不支持的请求方法',
        });
    }
  } catch (error: any) {
    console.error('物品配置管理API错误:', error);
    throw createError({
      status: error.status || 500,
      message: error.message || '服务器内部错误',
    });
  }
});

// 获取物品列表
async function handleGetItems(event: any) {
  const query = getQuery(event);
  const action = query.action as string;
  
  switch (action) {
    case 'list':
      return await getItemList(query);
    case 'search':
      return await searchItemList(query);
    case 'types':
      return await getItemTypeList();
    case 'rarities':
      return await getItemRarityList();
    case 'detail':
      return await getItemDetail(query);
    case 'debug':
      return await getConfigDebugInfo();
    case 'health':
      return await getHealthCheck();
    default:
      return await getItemList(query);
  }
}

// 获取物品列表（分页）
async function getItemList(query: any) {
  const page = Number(query.page) || 1;
  const pageSize = Math.min(Number(query.pageSize) || 20, 20000); // 最大支持20000个物品
  
  console.log('[getItemList] 开始获取物品配置...');
  const allItems = getAllItems();
  console.log(`[getItemList] 配置加载结果: ${allItems.length} 个物品`);
  
  // 转换为旧格式以兼容前端
  const items = allItems.map(item => ({
    id: item.id,
    n: item.name,
    cn: item.name,
    d: '',
    type: 'general',
    rarity: 'common'
  }));
  
  // 分页
  const total = items.length;
  const offset = (page - 1) * pageSize;
  const pagedItems = items.slice(offset, offset + pageSize);
  
  console.log(`[getItemList] 分页结果: 第${page}页, 每页${pageSize}, 共${total}项, 返回${pagedItems.length}项`);
  
  // 调试：输出前几个普通列表结果的数据结构
  if (pagedItems.length > 0) {
    console.log(`[getItemList] 示例列表结果:`, JSON.stringify(pagedItems.slice(0, 2), null, 2));
  }
  
  return {
    success: true,
    data: {
      list: pagedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

// 搜索物品
async function searchItemList(query: any) {
  const searchTerm = query.q as string;
  const page = Number(query.page) || 1;
  const pageSize = Math.min(Number(query.pageSize) || 20, 20000); // 最大支持20000个物品
  
  if (!searchTerm) {
    return {
      success: true,
      data: {
        list: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0
      }
    };
  }
  
  try {
    const results = searchItems(searchTerm);
    const total = results.length;
    const offset = (page - 1) * pageSize;
    const pagedResults = results.slice(offset, offset + pageSize);
    
    // 转换为旧格式以兼容前端
    const formattedResults = pagedResults.map(result => ({
      id: result.id,
      n: result.name,
      cn: result.name,
      d: '',
      type: 'general',
      rarity: 'common'
    }));
    
    console.log(`[searchItems] 搜索"${searchTerm}", 找到${total}个结果, 返回${pagedResults.length}个`);
    
    // 调试：输出前几个搜索结果的数据结构
    if (formattedResults.length > 0) {
      console.log(`[searchItems] 示例搜索结果:`, JSON.stringify(formattedResults.slice(0, 2), null, 2));
    }
    
    return {
      success: true,
      data: {
        list: formattedResults,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (error: any) {
    console.error(`[searchItems] 搜索失败: ${error.message}`);
    return {
      success: false,
      message: '搜索失败: ' + error.message,
      data: {
        list: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0
      }
    };
  }
}

// 获取物品类型列表（简化版）
async function getItemTypeList() {
  return {
    success: true,
    data: ['general', 'weapon', 'armor', 'consumable', 'material']
  };
}

// 获取稀有度列表（简化版）
async function getItemRarityList() {
  return {
    success: true,
    data: ['common', 'uncommon', 'rare', 'epic', 'legendary']
  };
}

// 获取物品详情
async function getItemDetail(query: any) {
  const itemId = query.id as string;
  
  if (!itemId) {
    throw createError({
      status: 400,
      message: '缺少物品ID'
    });
  }
  
  const itemName = getItemById(itemId);
  if (!itemName) {
    throw createError({
      status: 404,
      message: '物品不存在'
    });
  }
  
  return {
    success: true,
    data: { 
      id: itemId, 
      n: itemName,
      cn: itemName,
      d: '',
      type: 'general',
      rarity: 'common'
    }
  };
}

// 配置文件诊断信息
async function getConfigDebugInfo() {
  const fs = await import('fs');
  const path = await import('path');
  
  // 检查多个可能的配置文件路径
  const possiblePaths = [
    path.join(process.cwd(), 'server/config/itemConfig.json'),
    path.join(process.cwd(), '../server/config/itemConfig.json'),
    path.join(process.cwd(), 'config/itemConfig.json'),
    process.env.ITEM_CONFIG_PATH || ''
  ];
  
  const pathInfo = [];
  let foundConfigPath = '';
  
  for (const configPath of possiblePaths) {
    if (!configPath) continue;
    
    const exists = fs.existsSync(configPath);
    const info: any = {
      path: configPath,
      exists
    };
    
    if (exists) {
      try {
        const stats = fs.statSync(configPath);
        info.size = stats.size;
        info.modified = stats.mtime;
        info.readable = true;
        
        // 尝试读取文件前100个字符
        const content = fs.readFileSync(configPath, 'utf8');
        info.preview = content.substring(0, 100);
        info.isValidJson = true;
        
        // 尝试解析JSON
        const parsed = JSON.parse(content);
        info.itemCount = Object.keys(parsed).length;
        
        if (!foundConfigPath) {
          foundConfigPath = configPath;
        }
      } catch (error: any) {
        info.error = error.message;
        info.readable = false;
        info.isValidJson = false;
      }
    }
    
    pathInfo.push(info);
  }
  
  // 获取当前配置状态
  const config = getItemConfig();
  const currentItemCount = Object.keys(config).length;
  
  return {
    success: true,
    data: {
      currentWorkingDirectory: process.cwd(),
      environment: process.env.NODE_ENV || 'development',
      configPaths: pathInfo,
      foundConfigPath,
      currentLoadedItems: currentItemCount,
      sampleItems: Object.keys(config).slice(0, 5),
      timestamp: new Date().toISOString()
    }
  };
}

// 健康检查
async function getHealthCheck() {
  return {
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      api: 'item-config',
      version: '1.0.0'
    }
  };
}

// 创建物品
async function handleCreateItem(event: any) {
  const body = await readBody(event);
  
  const { item_id, n, cn } = body;
  
  if (!item_id || (!n && !cn)) {
    throw createError({
      status: 400,
      message: '缺少必填字段：item_id, 物品名称'
    });
  }
  
  const itemName = (cn || n).trim();
  const success = addItem(String(item_id), itemName);
  
  if (!success) {
    throw createError({
      status: 400,
      message: '物品创建失败，可能是ID已存在'
    });
  }
  
  return {
    success: true,
    message: '物品创建成功',
    data: { 
      id: item_id, 
      n: itemName,
      cn: itemName,
      d: '',
      type: 'general',
      rarity: 'common'
    }
  };
}

// 更新物品
async function handleUpdateItem(event: any) {
  const body = await readBody(event);
  const { id } = body;
  
  if (!id) {
    throw createError({
      status: 400,
      message: '缺少物品ID'
    });
  }
  
  // 检查物品是否存在
  const existingItem = getItemById(id);
  if (!existingItem) {
    throw createError({
      status: 404,
      message: '物品不存在'
    });
  }
  
  // 获取新的物品名称（支持 n 或 cn 字段，优先使用 cn）
  const newName = (body.cn || body.n || body.name)?.trim();
  
  if (!newName) {
    throw createError({
      status: 400,
      message: '缺少物品名称'
    });
  }
  
  const success = updateItem(String(id), newName);
  
  if (!success) {
    throw createError({
      status: 500,
      message: '物品更新失败'
    });
  }
  
  return {
    success: true,
    message: '物品更新成功',
    data: { 
      id: id, 
      n: newName,
      cn: newName,
      d: '',
      type: 'general',
      rarity: 'common'
    }
  };
}

// 删除物品
async function handleDeleteItem(event: any) {
  const query = getQuery(event);
  const id = query.id;
  
  if (!id) {
    throw createError({
      status: 400,
      message: '缺少物品ID'
    });
  }
  
  // 检查物品是否存在
  const existingItem = getItemById(String(id));
  if (!existingItem) {
    throw createError({
      status: 404,
      message: '物品不存在'
    });
  }
  
  const success = deleteItem(String(id));
  
  if (!success) {
    throw createError({
      status: 500,
      message: '物品删除失败'
    });
  }
  
  return {
    success: true,
    message: '物品删除成功'
  };
} 