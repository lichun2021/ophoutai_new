import * as mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import { listActive, getByIdentifier, type GameServerConfig } from '../model/gameServers';

interface Options {
    query: string;
    values?: any[];
    database?: string; // 这里传入的是 bname，例如 game_1
}

// 连接池缓存：按 (dbip|dbuser|dbpass) 维度缓存，多个库共用同一实例
const pools = new Map<string, mysql.Pool>();

function getPoolKey(cfg: GameServerConfig): string {
  return `${cfg.dbip}|${cfg.dbuser}|${cfg.dbpass}`;
}

function getOrCreatePool(cfg: GameServerConfig): mysql.Pool {
  const key = getPoolKey(cfg);
  const existing = pools.get(key);
  if (existing) return existing;
  const pool = mysql.createPool({
    host: cfg.dbip,
    port: 3306,
    user: cfg.dbuser,
    password: cfg.dbpass,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.GAME_DB_CONNECTION_LIMIT || '50'),
    queueLimit: parseInt(process.env.GAME_DB_QUEUE_LIMIT || '0'),
    multipleStatements: true
  });
  pools.set(key, pool);
  return pool;
}

export const gameDbSql = async ({ query, values = [], database }: Options) => {
  if (!database) {
    throw new Error('gameDbSql 需要提供 database(bname)，例如 game_1');
  }
  const cfg = await getByIdentifier(database);
  if (!cfg || cfg.is_active === 0) {
    throw new Error(`未找到或未启用的游戏服务器配置: ${database}`);
  }

  let connection: mysql.PoolConnection | null = null;
  try {
    const pool = getOrCreatePool(cfg);
    connection = await pool.getConnection();
    await connection.query(`USE \`${cfg.bname}\``);
    const [rows] = await connection.query(query, values);
    return rows;
  } catch (err) {
    console.error('Game DB Query error:', err);
    throw err;
  } finally {
    if (connection) connection.release();
  }
};

// 获取所有游戏数据库列表（来自配置表）
export const getGameDatabases = async (): Promise<string[]> => {
  try {
    const servers = await listActive();
    return servers.map(s => s.bname).filter(Boolean);
  } catch (err) {
    console.error('获取游戏数据库列表失败:', err);
    return [];
  }
};

// 检查数据库是否存在（来自配置表）
export const checkGameDatabase = async (database: string): Promise<boolean> => {
  try {
    const cfg = await getByIdentifier(database);
    return !!(cfg && cfg.is_active !== 0);
  } catch (err) {
    console.error('检查数据库失败:', err);
    return false;
  }
};