import fs from 'fs';
import path from 'path';

// 新的简化格式：直接ID -> 名称的映射
export type ItemConfigMap = Record<string, string>;

let itemConfigCache: ItemConfigMap | null = null;
let configLastModified = 0;

// 获取配置文件路径 - 支持开发和生产环境
function getConfigFilePath(): string {
  // 尝试多个可能的路径
  const possiblePaths = [
    // 开发环境路径
    path.join(process.cwd(), 'server/config/itemConfig.json'),
    // 生产环境路径（相对于.output）
    path.join(process.cwd(), '../server/config/itemConfig.json'),
    path.join(process.cwd(), 'server/config/itemConfig.json'),
    // 生产环境实际路径（基于诊断结果）
    path.join(process.cwd(), 'nuxt3/server/config/itemConfig.json'),
    '/data/nuxt3/server/config/itemConfig.json',
    // 用户指定的兼容路径
    '/data/config/itemConfig.json',
    path.join(process.cwd(), 'config/itemConfig.json'),
    // 绝对路径（如果设置了环境变量）
    process.env.ITEM_CONFIG_PATH || ''
  ];
  
  for (const configPath of possiblePaths) {
    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }
  }
  
  // 如果都找不到，返回默认路径
  const defaultPath = path.join(process.cwd(), 'server/config/itemConfig.json');
  return defaultPath;
}

// 检查配置文件是否需要重新加载
function needsReload(): boolean {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      return true;
    }
    const stats = fs.statSync(configPath);
    return stats.mtimeMs > configLastModified;
  } catch (error) {
    return true;
  }
}

// 加载配置文件
function loadConfig(): ItemConfigMap {
  try {
    const configPath = getConfigFilePath();
    
    if (!fs.existsSync(configPath)) {
      console.error(`[itemConfig] 配置文件不存在: ${configPath}`);
      
      // 列出当前目录内容进行调试
      try {
        const currentDir = process.cwd();
        console.log('[itemConfig] 📁 当前目录内容:');
        const files = fs.readdirSync(currentDir);
        files.forEach(file => {
          console.log(`[itemConfig]   - ${file}`);
        });
        
        // 检查是否有server目录
        const serverDir = path.join(currentDir, 'server');
        if (fs.existsSync(serverDir)) {
          console.log('[itemConfig] 📁 server目录内容:');
          const serverFiles = fs.readdirSync(serverDir);
          serverFiles.forEach(file => {
            console.log(`[itemConfig]   - server/${file}`);
          });
          
          // 检查config目录
          const configDir = path.join(serverDir, 'config');
          if (fs.existsSync(configDir)) {
            console.log('[itemConfig] 📁 server/config目录内容:');
            const configFiles = fs.readdirSync(configDir);
            configFiles.forEach(file => {
              console.log(`[itemConfig]   - server/config/${file}`);
            });
          } else {
            console.log('[itemConfig] ❌ server/config目录不存在');
          }
        } else {
          console.log('[itemConfig] ❌ server目录不存在');
        }
      } catch (dirError) {
        console.error('[itemConfig] 列出目录失败:', dirError);
      }
      
      return {};
    }
    
    console.log('[itemConfig] ✅ 配置文件存在，开始读取...');
    const configData = fs.readFileSync(configPath, 'utf8');
    const stats = fs.statSync(configPath);
    
    console.log('[itemConfig] 📄 文件大小:', stats.size, 'bytes');
    console.log('[itemConfig] 📄 文件修改时间:', stats.mtime);
    console.log('[itemConfig] 📄 文件内容预览:', configData.substring(0, 100) + '...');
    
    console.log('[itemConfig] 🔄 开始解析JSON...');
    itemConfigCache = JSON.parse(configData);
    configLastModified = stats.mtimeMs;
    
    const itemCount = Object.keys(itemConfigCache || {}).length;
    console.log(`[itemConfig] ✅ 物品配置加载成功！共 ${itemCount} 个物品`);
    console.log('[itemConfig] 📝 示例物品:', Object.keys(itemConfigCache || {}).slice(0, 3));
    
    // 验证数据质量 - 新格式验证
    let invalidItems = 0;
    Object.keys(itemConfigCache || {}).forEach(itemId => {
      const itemName = itemConfigCache![itemId];
      if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
        invalidItems++;
        if (invalidItems <= 5) { // 只显示前5个有问题的物品
          console.warn(`[itemConfig] ⚠️ 物品${itemId}缺少名称: ${itemName}`);
        }
      }
    });
    
    if (invalidItems > 0) {
      console.warn(`[itemConfig] ⚠️ 发现 ${invalidItems} 个物品缺少名称信息`);
    }
    
    return itemConfigCache || {};
  } catch (error: any) {
    console.error('[itemConfig] ❌ 加载物品配置失败:', error);
    console.error('[itemConfig] 错误详情:', error.message);
    console.error('[itemConfig] 错误堆栈:', error.stack);
    return {};
  }
}

// 获取物品配置（带缓存）
export function getItemConfig(): ItemConfigMap {
  if (!itemConfigCache || needsReload()) {
    loadConfig();
  }
  return itemConfigCache || {};
}

// 根据物品ID获取物品名称
export function getItemById(itemId: string | number): string | null {
  const config = getItemConfig();
  const id = String(itemId);
  return config[id] || null;
}

// 根据物品ID批量获取物品信息
export function getItemsByIds(itemIds: (string | number)[]): Record<string, string> {
  const config = getItemConfig();
  const result: Record<string, string> = {};
  
  itemIds.forEach(id => {
    const idStr = String(id);
    if (config[idStr]) {
      result[idStr] = config[idStr];
    }
  });
  
  return result;
}

// 获取物品名称
export function getItemName(itemId: string | number): string {
  const itemName = getItemById(itemId);
  if (!itemName) return `未知物品${itemId}`;
  return itemName.trim() || `物品${itemId}`;
}

// 获取物品名称映射表（直接返回配置）
export function getItemNameMap(): Record<string, string> {
  return getItemConfig();
}

// 搜索物品（根据名称）
export function searchItems(searchTerm: string): Array<{ id: string; name: string }> {
  const config = getItemConfig();
  const results: Array<{ id: string; name: string }> = [];
  const term = searchTerm.toLowerCase();
  
  Object.keys(config).forEach(itemId => {
    const itemName = config[itemId];
    if (
      itemName.toLowerCase().includes(term) ||
      itemId.includes(term)
    ) {
      results.push({ id: itemId, name: itemName });
    }
  });
  
  return results;
}

// 获取所有物品（简化版）
export function getAllItems(): Array<{ id: string; name: string }> {
  const config = getItemConfig();
  return Object.keys(config).map(id => ({
    id,
    name: config[id]
  }));
}

// 保存配置文件
export function saveItemConfig(config: ItemConfigMap): boolean {
  try {
    const configPath = getConfigFilePath();
    const configData = JSON.stringify(config, null, 2);
    
    // 备份原文件
    const backupPath = configPath + '.backup';
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, backupPath);
    }
    
    fs.writeFileSync(configPath, configData, 'utf8');
    
    // 清除缓存，强制重新加载
    itemConfigCache = null;
    configLastModified = 0;
    
    console.log('物品配置已保存');
    return true;
  } catch (error) {
    console.error('保存物品配置失败:', error);
    return false;
  }
}

// 添加新物品
export function addItem(itemId: string, itemName: string): boolean {
  const config = getItemConfig();
  
  if (config[itemId]) {
    console.error(`物品ID ${itemId} 已存在`);
    return false;
  }
  
  config[itemId] = itemName;
  return saveItemConfig(config);
}

// 更新物品
export function updateItem(itemId: string, itemName: string): boolean {
  const config = getItemConfig();
  
  if (!config[itemId]) {
    console.error(`物品ID ${itemId} 不存在`);
    return false;
  }
  
  config[itemId] = itemName;
  return saveItemConfig(config);
}

// 删除物品
export function deleteItem(itemId: string): boolean {
  const config = getItemConfig();
  
  if (!config[itemId]) {
    console.error(`物品ID ${itemId} 不存在`);
    return false;
  }
  
  delete config[itemId];
  return saveItemConfig(config);
}

// 验证礼包物品格式
export function validateGiftItems(giftItems: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = getItemConfig();
  
  if (!Array.isArray(giftItems)) {
    errors.push('礼包物品必须是数组格式');
    return { valid: false, errors };
  }
  
  if (giftItems.length > 10) {
    errors.push('礼包最多只能包含10个物品');
  }
  
  if (giftItems.length === 0) {
    errors.push('礼包至少需要包含1个物品');
  }
  
  giftItems.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`第${index + 1}个物品格式错误`);
      return;
    }
    
    if (!item.i || typeof item.i !== 'number') {
      errors.push(`第${index + 1}个物品缺少物品ID(i)或格式错误`);
    } else if (!config[String(item.i)]) {
      errors.push(`第${index + 1}个物品ID(${item.i})在配置中不存在`);
    }
    
    if (!item.a || typeof item.a !== 'number' || item.a <= 0) {
      errors.push(`第${index + 1}个物品缺少数量(a)或数量无效`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}

// 格式化礼包物品显示
export function formatGiftItemsDisplay(giftItems: any[]): string {
  const config = getItemConfig();
  
  if (!Array.isArray(giftItems)) {
    return '格式错误';
  }
  
  const itemStrings = giftItems
    .filter(item => item && item.i && item.a > 0)
    .map(item => {
      const itemName = config[String(item.i)];
      const name = itemName || `物品${item.i}`;
      return `${name}×${item.a}`;
    });
  
  return itemStrings.join('、');
} 