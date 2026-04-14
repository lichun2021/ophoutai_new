import fs from 'fs';
import path from 'path';

// 充值配置类型
export type RechargeConfigItem = {
    name: string;
    id: string;
    andid: string;
    rechargeType: number;
    price: number;
};

export type RechargeConfigMap = Record<string, RechargeConfigItem>;

let rechargeConfigCache: RechargeConfigMap | null = null;
let configLastModified = 0;

// 获取配置文件路径 - 支持开发和生产环境
function getConfigFilePath(): string {
  // 尝试多个可能的路径
  const possiblePaths = [
    // 开发环境路径
    path.join(process.cwd(), 'server/config/rechargeConfig.json'),
    // 生产环境路径（相对于.output）
    path.join(process.cwd(), '../server/config/rechargeConfig.json'),
    path.join(process.cwd(), 'server/config/rechargeConfig.json'),
    // 生产环境实际路径（基于诊断结果）
    path.join(process.cwd(), 'nuxt3/server/config/rechargeConfig.json'),
    '/data/nuxt3/server/config/rechargeConfig.json',
    // 用户指定的兼容路径
    '/data/config/rechargeConfig.json',
    path.join(process.cwd(), 'config/rechargeConfig.json'),
    // 绝对路径（如果设置了环境变量）
    process.env.RECHARGE_CONFIG_PATH || ''
  ];
  
  for (const configPath of possiblePaths) {
    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }
  }
  
  // 如果都找不到，返回默认路径
  const defaultPath = path.join(process.cwd(), 'server/config/rechargeConfig.json');
  console.warn(`未找到充值配置文件，使用默认路径: ${defaultPath}`);
  return defaultPath;
}

// 检查配置文件是否需要重新加载
function needsReload(): boolean {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      console.warn(`充值配置文件不存在: ${configPath}`);
      return true;
    }
    const stats = fs.statSync(configPath);
    const currentModified = stats.mtimeMs;
    if (currentModified !== configLastModified) {
      configLastModified = currentModified;
      return true;
    }
    return false;
  } catch (error) {
    console.error('检查充值配置文件修改时间失败:', error);
    return true;
  }
}

// 加载充值配置文件
export function loadRechargeConfig(): RechargeConfigMap {
  try {
    if (rechargeConfigCache && !needsReload()) {
      return rechargeConfigCache;
    }

    const configPath = getConfigFilePath();
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(fileContent) as RechargeConfigMap;
    
    rechargeConfigCache = config;
    
    return config;
  } catch (error) {
    console.error('加载充值配置文件失败:', error);
    return {};
  }
}

// 根据商品ID获取配置
export function getRechargeConfig(productName: string): RechargeConfigItem | null {
  const config = loadRechargeConfig();
  return config[productName] || null;
}

// 根据商品ID获取商品名称
export function getRechargeProductName(productName: string): string {
  const config = getRechargeConfig(productName);
  return config?.name || productName;
}

// 获取所有充值配置
export function getAllRechargeConfigs(): RechargeConfigMap {
  return loadRechargeConfig();
}

// 清除缓存（用于测试）
export function clearRechargeConfigCache(): void {
  rechargeConfigCache = null;
  configLastModified = 0;
}

