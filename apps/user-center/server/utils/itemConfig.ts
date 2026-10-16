import fs from 'fs';
import path from 'path';

// 新的简化格式：直接ID -> 名称的映射
export type ItemConfigMap = Record<string, string>;

let itemConfigCache: ItemConfigMap | null = null;
let itemConfigEnCache: ItemConfigMap | null = null;
let configLastModified = 0;
let configEnLastModified = 0;

// 自动转换常见游戏道具名称为英文（当未单独配置英文名时作为默认展示）
export function autoTranslateItemName(zhName: string): string {
  if (!zhName) return '';
  const exactMap: Record<string, string> = {
    '宝石': 'Gems',
    'W币': 'W Coins',
    '金币': 'Gold Coins',
    '黄金': 'Gold',
    '金条': 'Gold Bars',
    '体力': 'Stamina',
    '经验': 'EXP',
    'VIP点数': 'VIP Points',
    '随机迁城': 'Random Teleport',
    '高级迁城': 'Advanced Teleport',
    '驻地迁城': 'Garrison Teleport',
    '领地迁城': 'Territory Teleport',
    '时空迁城': 'Space-Time Teleport',
    '跨服活动迁城': 'Cross-Server Teleport',
    '行军加速': 'March Speedup',
    '高级行军加速': 'Adv. March Speedup',
    '行军召回': 'March Recall',
    '撤兵牌': 'Troop Recall',
    '集结撤军': 'Rally Recall',
    '队伍扩编': 'March Size Boost',
    '高级队伍扩编': 'Adv. March Size Boost',
    '魔法之眼': 'Magic Eye',
    '狩猎急行军': 'Monster March Speedup',
    '高级狩猎急行军': 'Adv. Monster March Speedup',
  };
  if (exactMap[zhName]) return exactMap[zhName];

  let en = zhName
    .replace(/木材包/g, 'Wood Pack ')
    .replace(/石料包/g, 'Stone Pack ')
    .replace(/铁矿包/g, 'Iron Pack ')
    .replace(/粮食包/g, 'Food Pack ')
    .replace(/资源宝箱(\d+)级/g, 'Lv.$1 Resource Chest')
    .replace(/粮食抵扣券/g, 'Food Voucher ')
    .replace(/木材抵扣券/g, 'Wood Voucher ')
    .replace(/石料抵扣券/g, 'Stone Voucher ')
    .replace(/铁矿抵扣券/g, 'Iron Voucher ')
    .replace(/和平守护/g, 'Peace Shield ')
    .replace(/战争迷雾/g, 'Anti-Scout ')
    .replace(/高级攻击加成/g, 'Adv. Attack Boost ')
    .replace(/高级血量加成/g, 'Adv. HP Boost ')
    .replace(/攻击加成/g, 'Attack Boost ')
    .replace(/血量加成/g, 'HP Boost ')
    .replace(/防御加成/g, 'Defense Boost ')
    .replace(/伐木场提升/g, 'Sawmill Boost ')
    .replace(/采石场提升/g, 'Quarry Boost ')
    .replace(/铁矿场提升/g, 'Iron Mine Boost ')
    .replace(/农田提升/g, 'Farm Boost ')
    .replace(/建筑加速/g, 'Building Speedup ')
    .replace(/研究加速/g, 'Research Speedup ')
    .replace(/科技加速/g, 'Tech Speedup ')
    .replace(/训练加速/g, 'Training Speedup ')
    .replace(/治疗加速/g, 'Healing Speedup ')
    .replace(/通用加速/g, 'General Speedup ')
    .replace(/加速/g, 'Speedup ')
    .replace(/碎片/g, ' Shard')
    .replace(/宝箱/g, ' Chest')
    .replace(/礼包/g, ' Pack')
    .replace(/小时/g, 'h')
    .replace(/分钟/g, 'm')
    .replace(/天/g, 'd')
    .replace(/级/g, ' Lv.');
  return en.trim();
}

// 获取配置文件路径 - 支持开发和生产环境（优先读取 op-admin 的配置以保持一致）
function getConfigFilePath(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), '../op-admin/server/config/itemConfig.json'),
    path.join(process.cwd(), 'server/config/itemConfig.json'),
    path.join(process.cwd(), '../server/config/itemConfig.json'),
    path.join(process.cwd(), 'nuxt3/server/config/itemConfig.json'),
    '/data/nuxt3/server/config/itemConfig.json',
    '/data/config/itemConfig.json',
    path.join(process.cwd(), 'config/itemConfig.json'),
    process.env.ITEM_CONFIG_PATH || ''
  ];
  
  for (const configPath of possiblePaths) {
    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }
  }
  
  return path.join(process.cwd(), 'server/config/itemConfig.json');
}

function getConfigEnFilePath(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), '../op-admin/server/config/itemConfigEn.json'),
    path.join(process.cwd(), 'server/config/itemConfigEn.json'),
    path.join(path.dirname(getConfigFilePath()), 'itemConfigEn.json'),
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return path.join(path.dirname(getConfigFilePath()), 'itemConfigEn.json');
}

// 检查配置文件是否需要重新加载
function needsReload(): boolean {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      return true;
    }
    const stats = fs.statSync(configPath);
    const enPath = getConfigEnFilePath();
    const enMtime = fs.existsSync(enPath) ? fs.statSync(enPath).mtimeMs : 0;
    return stats.mtimeMs > configLastModified || enMtime > configEnLastModified;
  } catch (error) {
    return true;
  }
}

function loadConfigEn(): ItemConfigMap {
  try {
    const enPath = getConfigEnFilePath();
    if (!fs.existsSync(enPath)) {
      itemConfigEnCache = {};
      configEnLastModified = 0;
      return {};
    }
    const data = fs.readFileSync(enPath, 'utf8');
    const stats = fs.statSync(enPath);
    itemConfigEnCache = JSON.parse(data);
    configEnLastModified = stats.mtimeMs;
    return itemConfigEnCache || {};
  } catch (e) {
    itemConfigEnCache = {};
    return {};
  }
}

export function getItemConfigEn(): ItemConfigMap {
  if (!itemConfigEnCache || needsReload()) {
    loadConfigEn();
  }
  return itemConfigEnCache || {};
}

// 加载配置文件
function loadConfig(): ItemConfigMap {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const configData = fs.readFileSync(configPath, 'utf8');
    const stats = fs.statSync(configPath);
    const primaryMap = JSON.parse(configData) || {};

    // 同时合并 user-center 自身的 itemConfig.json（防止遗漏旧ID）
    const localPath = path.join(process.cwd(), 'server/config/itemConfig.json');
    let mergedMap: ItemConfigMap = { ...primaryMap };
    if (localPath !== configPath && fs.existsSync(localPath)) {
      try {
        const localMap = JSON.parse(fs.readFileSync(localPath, 'utf8')) || {};
        mergedMap = { ...localMap, ...primaryMap };
      } catch {}
    }

    itemConfigCache = mergedMap;
    configLastModified = stats.mtimeMs;
    loadConfigEn();
    return itemConfigCache || {};
  } catch (error: any) {
    console.error('[itemConfig] ❌ 加载物品配置失败:', error);
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

export function getItemEnById(itemId: string | number): string {
  const configEn = getItemConfigEn();
  const id = String(itemId);
  if (configEn[id]) return configEn[id];
  const zhName = getItemById(id);
  return zhName ? autoTranslateItemName(zhName) : '';
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
export function getItemName(itemId: string | number, lang: string = 'zh'): string {
  if (lang === 'en') {
    const enName = getItemEnById(itemId);
    if (enName) return enName;
  }
  const itemName = getItemById(itemId);
  if (!itemName) return lang === 'en' ? `Item ${itemId}` : `未知物品${itemId}`;
  return itemName.trim() || (lang === 'en' ? `Item ${itemId}` : `物品${itemId}`);
}

// 获取物品名称映射表（直接返回配置）
export function getItemNameMap(): Record<string, string> {
  return getItemConfig();
}

// 搜索物品（根据名称）
export function searchItems(searchTerm: string): Array<{ id: string; name: string; en: string }> {
  const config = getItemConfig();
  const configEn = getItemConfigEn();
  const results: Array<{ id: string; name: string; en: string }> = [];
  const term = searchTerm.toLowerCase();
  
  Object.keys(config).forEach(itemId => {
    const itemName = config[itemId];
    const itemEn = configEn[itemId] || autoTranslateItemName(itemName);
    if (
      itemName.toLowerCase().includes(term) ||
      itemEn.toLowerCase().includes(term) ||
      itemId.includes(term)
    ) {
      results.push({ id: itemId, name: itemName, en: itemEn });
    }
  });
  
  return results;
}

// 获取所有物品（简化版）
export function getAllItems(): Array<{ id: string; name: string; en: string }> {
  const config = getItemConfig();
  const configEn = getItemConfigEn();
  return Object.keys(config).map(id => ({
    id,
    name: config[id],
    en: configEn[id] || autoTranslateItemName(config[id])
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