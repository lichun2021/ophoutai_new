#!/usr/bin/env node
/**
 * 分析批量注册账号规则（只读，不删除）
 *
 * 用法：
 *   node analyze-bot-registrations.js
 *   node analyze-bot-registrations.js --start "2026-07-05 12:00:00"
 */

import mysql from 'mysql2/promise';

let sharedConfig = null;
try {
  sharedConfig = await import('./config.js');
} catch {}

const logInfo = sharedConfig?.logInfo || ((message) => console.log(`[${new Date().toISOString()}] INFO: ${message}`));
const logError = sharedConfig?.logError || ((message) => console.error(`[${new Date().toISOString()}] ERROR: ${message}`));

function parseArgs(argv) {
  const args = { start: '', limit: 50 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--start') args.start = argv[++i] || '';
    else if (arg.startsWith('--start=')) args.start = arg.slice('--start='.length);
    else if (arg === '--limit') args.limit = Number(argv[++i] || 50);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
  }
  return args;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function defaultStartAt() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} 12:00:00`;
}

function getDbConfig() {
  if (sharedConfig?.DB_CONFIG) return sharedConfig.DB_CONFIG;
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'quantum_db',
    charset: 'utf8mb4',
    timezone: '+08:00',
  };
}

async function printTable(conn, title, sql, values = []) {
  const [rows] = await conn.execute(sql, values);
  console.log(`\n========== ${title} ==========`);
  console.table(rows);
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  const startAt = args.start || defaultStartAt();
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 50;
  const dbConfig = getDbConfig();

  logInfo('--- [只读分析] 开始分析批量注册规则 ---');
  logInfo(`数据库: ${dbConfig.host}:${dbConfig.port || 3306}/${dbConfig.database}`);
  logInfo(`起始时间: ${startAt}`);

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);

    const noCashSql = `NOT EXISTS (
      SELECT 1
      FROM paymentrecords pr
      WHERE pr.user_id = u.id
        AND pr.payment_status = 3
        AND pr.payment_way IN ('支付宝', '微信')
    )`;

    await printTable(conn, '总量概览', `
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN ${noCashSql} THEN 1 ELSE 0 END) AS no_cash_users,
        COUNT(DISTINCT register_ip) AS distinct_register_ip,
        COUNT(DISTINCT channel_code) AS distinct_channel,
        MIN(created_at) AS first_created_at,
        MAX(created_at) AS last_created_at
      FROM users u
      WHERE u.created_at >= ?
    `, [startAt]);

    await printTable(conn, '用户名格式分布', `
      SELECT pattern, COUNT(*) AS cnt
      FROM (
        SELECT
          CASE
            WHEN username REGEXP '^[A-Za-z]{4}[0-9]+$' THEN '4字母+数字，例如 abcd123'
            WHEN username REGEXP '^[A-Za-z]{3}[0-9]+$' THEN '3字母+数字'
            WHEN username REGEXP '^[A-Za-z]{5}[0-9]+$' THEN '5字母+数字'
            WHEN username REGEXP '^[A-Za-z]{6,}[0-9]+$' THEN '6位以上字母+数字'
            WHEN username REGEXP '^[A-Za-z]+[0-9]+$' THEN '任意字母+数字'
            WHEN username REGEXP '^[0-9]+[A-Za-z]+$' THEN '数字+字母'
            WHEN username REGEXP '^[A-Za-z0-9]+$' THEN '纯字母数字混合'
            WHEN username REGEXP '^user_[0-9]+' THEN 'user_时间戳类'
            ELSE '其他'
          END AS pattern
        FROM users u
        WHERE u.created_at >= ?
          AND ${noCashSql}
      ) t
      GROUP BY pattern
      ORDER BY cnt DESC
    `, [startAt]);

    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      await printTable(conn, `前 ${n} 位前缀重复 TOP ${limit}`, `
        SELECT
          LOWER(LEFT(username, ${n})) AS prefix,
          COUNT(*) AS cnt,
          COUNT(DISTINCT register_ip) AS ip_count,
          MIN(created_at) AS first_created_at,
          MAX(created_at) AS last_created_at,
          GROUP_CONCAT(username ORDER BY created_at SEPARATOR ', ') AS sample_users
        FROM users u
        WHERE u.created_at >= ?
          AND username REGEXP '^[A-Za-z0-9]+$'
          AND CHAR_LENGTH(username) >= ${n}
          AND ${noCashSql}
        GROUP BY LOWER(LEFT(username, ${n}))
        HAVING cnt >= 3
        ORDER BY cnt DESC, last_created_at DESC
        LIMIT ${limit}
      `, [startAt]);
    }

    await printTable(conn, `注册 IP TOP ${limit}`, `
      SELECT
        register_ip,
        COUNT(*) AS cnt,
        COUNT(DISTINCT LOWER(LEFT(username, 4))) AS prefix4_count,
        MIN(created_at) AS first_created_at,
        MAX(created_at) AS last_created_at,
        GROUP_CONCAT(username ORDER BY created_at SEPARATOR ', ') AS sample_users
      FROM users u
      WHERE u.created_at >= ?
        AND ${noCashSql}
      GROUP BY register_ip
      HAVING cnt >= 3
      ORDER BY cnt DESC, last_created_at DESC
      LIMIT ${limit}
    `, [startAt]);

    await printTable(conn, `分钟级注册爆发 TOP ${limit}`, `
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:00') AS minute_bucket,
        COUNT(*) AS cnt,
        COUNT(DISTINCT register_ip) AS ip_count,
        COUNT(DISTINCT channel_code) AS channel_count,
        GROUP_CONCAT(username ORDER BY created_at SEPARATOR ', ') AS sample_users
      FROM users u
      WHERE u.created_at >= ?
        AND ${noCashSql}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:00')
      HAVING cnt >= 10
      ORDER BY cnt DESC, minute_bucket DESC
      LIMIT ${limit}
    `, [startAt]);

    await printTable(conn, `渠道 + IP 聚集 TOP ${limit}`, `
      SELECT
        channel_code,
        register_ip,
        COUNT(*) AS cnt,
        MIN(created_at) AS first_created_at,
        MAX(created_at) AS last_created_at,
        GROUP_CONCAT(username ORDER BY created_at SEPARATOR ', ') AS sample_users
      FROM users u
      WHERE u.created_at >= ?
        AND ${noCashSql}
      GROUP BY channel_code, register_ip
      HAVING cnt >= 3
      ORDER BY cnt DESC, last_created_at DESC
      LIMIT ${limit}
    `, [startAt]);

    await printTable(conn, `thirdparty_uid 模式 TOP ${limit}`, `
      SELECT pattern, COUNT(*) AS cnt
      FROM (
        SELECT
          CASE
            WHEN thirdparty_uid REGEXP '^user_[0-9]+$' THEN 'user_纯数字/时间戳'
            WHEN thirdparty_uid REGEXP '^user_[0-9]+_[a-z0-9]+$' THEN 'user_时间戳_随机串'
            WHEN thirdparty_uid = username THEN 'thirdparty_uid 等于 username'
            WHEN thirdparty_uid REGEXP '^[A-Za-z]{4}[0-9]+$' THEN '4字母+数字'
            WHEN thirdparty_uid REGEXP '^[A-Za-z0-9]+$' THEN '纯字母数字'
            ELSE '其他'
          END AS pattern
        FROM users u
        WHERE u.created_at >= ?
          AND ${noCashSql}
      ) t
      GROUP BY pattern
      ORDER BY cnt DESC
      LIMIT ${limit}
    `, [startAt]);

    logInfo('--- [只读分析] 完成。把 TOP 表里 cnt 最大的几行发我，我再帮你定最终删除规则。---');
  } catch (error) {
    logError(`分析失败: ${error.message || error}`);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

main();
