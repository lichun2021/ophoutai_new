import { sql } from '../db';
import { getRedisCluster } from '../utils/redis-cluster';

export interface GameServerConfig {
  id?: number;
  server_id?: number | null; // 业务用服务器ID，例如 10001（可为空）
  name: string;        // 业务/展示名称，例如 S1、一区
  webhost: string;     // 例如 http://1.2.3.4:8888 或 https://domain:port
  dbip: string;        // MySQL 主机
  bname: string;       // 数据库名，例如 game_1
  dbuser: string;      // MySQL 用户
  dbpass: string;      // MySQL 密码
  is_active?: number;  // 1=启用 0=停用
  allow_cdk_redeem?: number;  // 1=允许CDK领取 0=不允许
  count_online?: number; // 1=计入在线统计 0=忽略（合服共用接口时可关闭）
  created_at?: string;
  updated_at?: string;
}

export async function listAll(): Promise<GameServerConfig[]> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers ORDER BY id ASC'
  }) as any[];
  return rows as GameServerConfig[];
}

export async function listActive(): Promise<GameServerConfig[]> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE is_active = 1 ORDER BY id ASC'
  }) as any[];
  return rows as GameServerConfig[];
}

// 获取允许CDK领取的活跃服务器
export async function listCdkRedeemable(): Promise<GameServerConfig[]> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, created_at, updated_at FROM gameservers WHERE is_active = 1 AND allow_cdk_redeem = 1 ORDER BY id ASC'
  }) as any[];
  return rows as GameServerConfig[];
}

export async function getById(id: number): Promise<GameServerConfig | null> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE id = ? LIMIT 1',
    values: [id]
  }) as any[];
  return rows.length ? rows[0] as GameServerConfig : null;
}

export async function getByBName(bname: string): Promise<GameServerConfig | null> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE bname = ? LIMIT 1',
    values: [bname]
  }) as any[];
  return rows.length ? rows[0] as GameServerConfig : null;
}

export async function getByName(name: string): Promise<GameServerConfig | null> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE name = ? LIMIT 1',
    values: [name]
  }) as any[];
  return rows.length ? rows[0] as GameServerConfig : null;
}

export async function getByServerId(serverId: number): Promise<GameServerConfig | null> {
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE server_id = ? LIMIT 1',
    values: [serverId]
  }) as any[];
  return rows.length ? rows[0] as GameServerConfig : null;
}

// 兼容使用 server_id 或 bname 进行查找
export async function getByIdentifier(identifier: string | number): Promise<GameServerConfig | null> {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    const byServerId = await getByServerId(asNumber);
    if (byServerId) return byServerId;
  }
  return await getByBName(raw);
}

// 便利函数：从 bname 提取 worldId（例如 game_12 -> 12）
export function extractWorldIdFromBName(bname: string): number | null {
  const match = bname.match(/game_(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function getByWorldId(worldId: number): Promise<GameServerConfig | null> {
  const cacheKey = `gameserver:world_${worldId}`;
  
  try {
    // 1. 先尝试从 Redis 获取
    const redis = getRedisCluster();
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log(`[getByWorldId] Redis 缓存命中: world_id=${worldId}`);
      return JSON.parse(cachedData) as GameServerConfig;
    }
    
    console.log(`[getByWorldId] Redis 缓存未命中，查询数据库: world_id=${worldId}`);
  } catch (redisError) {
    console.warn(`[getByWorldId] Redis 查询失败，降级到数据库查询:`, redisError);
  }
  
  // 2. Redis 没有，从数据库查询
  const rows = await sql({
    query: 'SELECT id, server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online, created_at, updated_at FROM gameservers WHERE server_id = ? OR bname = ? OR name = ? LIMIT 1',
    values: [worldId, `game_${worldId}`, `game_${worldId}`]
  }) as any[];
  
  if (rows.length > 0) {
    const serverConfig = rows[0] as GameServerConfig;
    
    // 3. 存入 Redis 缓存，设置 1 小时过期
    try {
      const redis = getRedisCluster();
      await redis.set(cacheKey, JSON.stringify(serverConfig), 'EX', 3600); // 3600秒 = 1小时
      console.log(`[getByWorldId] 已缓存到 Redis: world_id=${worldId}, key=${cacheKey}`);
    } catch (redisError) {
      console.warn(`[getByWorldId] Redis 缓存写入失败:`, redisError);
      // 写入失败不影响返回结果
    }
    
    return serverConfig;
  }
  
  console.log(`[getByWorldId] 数据库中未找到服务器配置: world_id=${worldId}`);
  return null;
}

export async function createServer(cfg: Omit<GameServerConfig, 'id' | 'created_at' | 'updated_at'>): Promise<any> {
  return await sql({
    query: 'INSERT INTO gameservers (server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, allow_cdk_redeem, count_online) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    values: [cfg.server_id ?? null, cfg.name, cfg.webhost, cfg.dbip, cfg.bname, cfg.dbuser, cfg.dbpass, cfg.is_active ?? 1, cfg.allow_cdk_redeem ?? 1, cfg.count_online ?? 1]
  });
}

export async function updateServer(id: number, cfg: Partial<Omit<GameServerConfig, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (cfg.server_id !== undefined) { fields.push('server_id = ?'); values.push(cfg.server_id); }
  if (cfg.name !== undefined) { fields.push('name = ?'); values.push(cfg.name); }
  if (cfg.webhost !== undefined) { fields.push('webhost = ?'); values.push(cfg.webhost); }
  if (cfg.dbip !== undefined) { fields.push('dbip = ?'); values.push(cfg.dbip); }
  if (cfg.bname !== undefined) { fields.push('bname = ?'); values.push(cfg.bname); }
  if (cfg.dbuser !== undefined) { fields.push('dbuser = ?'); values.push(cfg.dbuser); }
  if (cfg.dbpass !== undefined) { fields.push('dbpass = ?'); values.push(cfg.dbpass); }
  if (cfg.is_active !== undefined) { fields.push('is_active = ?'); values.push(cfg.is_active); }
  if (cfg.allow_cdk_redeem !== undefined) { fields.push('allow_cdk_redeem = ?'); values.push(cfg.allow_cdk_redeem); }
  if (cfg.count_online !== undefined) { fields.push('count_online = ?'); values.push(cfg.count_online); }
  if (!fields.length) return;
  values.push(id);
  await sql({ query: `UPDATE gameservers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values });
  
  // 清除 Redis 缓存
  await clearServerCache(id);
}

export async function removeServer(id: number): Promise<void> {
  await sql({ query: 'DELETE FROM gameservers WHERE id = ?', values: [id] });
  
  // 清除 Redis 缓存
  await clearServerCache(id);
}

// 清除服务器 Redis 缓存
async function clearServerCache(serverId: number): Promise<void> {
  try {
    // 先查询服务器的 bname，提取 world_id
    const server = await getById(serverId);
    if (server) {
      const worldId = server.server_id ?? (server.bname ? extractWorldIdFromBName(server.bname) : null);
      if (worldId) {
        const redis = getRedisCluster();
        const cacheKey = `gameserver:world_${worldId}`;
        await redis.del(cacheKey);
        console.log(`[clearServerCache] 已清除缓存: ${cacheKey}`);
      }
    }
  } catch (error) {
    console.warn('[clearServerCache] 清除缓存失败:', error);
    // 失败不影响主流程
  }
}

// 手动清除指定 world_id 的缓存（供外部调用）
export async function clearCacheByWorldId(worldId: number): Promise<void> {
  try {
    const redis = getRedisCluster();
    const cacheKey = `gameserver:world_${worldId}`;
    await redis.del(cacheKey);
    console.log(`[clearCacheByWorldId] 已清除缓存: ${cacheKey}`);
  } catch (error) {
    console.warn('[clearCacheByWorldId] 清除缓存失败:', error);
  }
}


