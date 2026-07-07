#!/usr/bin/env node
/**
 * 清理批量注册攻击账号
 *
 * 默认只预览，不删除：
 *   node cleanup-bot-registrations.js
 *
 * 确认后执行删除：
 *   node cleanup-bot-registrations.js --execute
 *
 * 可指定开始时间：
 *   node cleanup-bot-registrations.js --start "2026-07-05 12:00:00"
 */

import mysql from 'mysql2/promise';

let sharedConfig = null;
try {
  sharedConfig = await import('./config.js');
} catch {}

const logInfo = sharedConfig?.logInfo || ((message) => console.log(`[${new Date().toISOString()}] INFO: ${message}`));
const logWarn = sharedConfig?.logWarn || ((message) => console.warn(`[${new Date().toISOString()}] WARN: ${message}`));
const logError = sharedConfig?.logError || ((message) => console.error(`[${new Date().toISOString()}] ERROR: ${message}`));

function parseArgs(argv) {
  const args = { execute: false, start: '', help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') args.execute = true;
    else if (arg === '--start') args.start = argv[++i] || '';
    else if (arg.startsWith('--start=')) args.start = arg.slice('--start='.length);
    else if (arg === '--help' || arg === '-h') args.help = true;
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

function printHelp() {
  console.log(`用法：
  node cleanup-bot-registrations.js              # 只预览
  node cleanup-bot-registrations.js --execute    # 执行删除
  node cleanup-bot-registrations.js --start "2026-07-05 12:00:00"

匹配条件：
  1. Users.created_at >= startAt，默认昨天 12:00:00
  2. 没有支付宝/微信成功现金支付：payment_status=3 AND payment_way IN ('支付宝','微信')
  3. register_ip 为空（攻击发生在 IP 入库修复前）
  4. 渠道在该时间段内无现金注册数 >= 1000
  5. 用户名匹配批量生成器模式：nuke_/scan_/单词数字/手机号样式/纯数字/纯字母数字`);
}

const noCashSql = `NOT EXISTS (
  SELECT 1
  FROM paymentrecords cash_pr
  WHERE cash_pr.user_id = u.id
    AND cash_pr.payment_status = 3
    AND cash_pr.payment_way IN ('支付宝', '微信')
)`;

const botUsernameSql = `(
  u.username REGEXP '^nuke_[0-9]{10,}_[a-z0-9]+$'
  OR u.username REGEXP '^scan_[0-9]{5,}$'
  OR u.username REGEXP '^[a-z]{2,24}[0-9]{3,6}$'
  OR u.username REGEXP '^[0-9]{11}$'
  OR u.username REGEXP '^[0-9]{6,10}$'
  OR u.username REGEXP '^[A-Za-z0-9]{3,24}$'
)`;

const victimSourceSql = `
FROM (
  SELECT u.*
  FROM users u
  JOIN (
    SELECT channel_code
    FROM users u
    WHERE u.created_at >= ?
      AND (u.register_ip IS NULL OR u.register_ip = '')
      AND ${noCashSql}
    GROUP BY channel_code
    HAVING COUNT(*) >= 1000
  ) bad_channels ON bad_channels.channel_code = u.channel_code
  WHERE u.created_at >= ?
    AND (u.register_ip IS NULL OR u.register_ip = '')
    AND ${noCashSql}
    AND ${botUsernameSql}
) u`;

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const startAt = args.start || defaultStartAt();
  const mode = args.execute ? '正式删除' : '模拟预览';
  const dbConfig = getDbConfig();

  logInfo(`--- [${mode}] 开始清理批量注册账号 ---`);
  logInfo(`数据库: ${dbConfig.host}:${dbConfig.port || 3306}/${dbConfig.database}`);
  logInfo(`起始时间: ${startAt}`);

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.execute('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');

    const [prefixRows] = await conn.execute(
      `SELECT
         channel_code,
         COUNT(*) AS no_cash_null_ip_users,
         MIN(created_at) AS first_created_at,
         MAX(created_at) AS last_created_at,
         LEFT(GROUP_CONCAT(username ORDER BY created_at SEPARATOR ', '), 220) AS samples
       FROM users u
       WHERE u.created_at >= ?
         AND (u.register_ip IS NULL OR u.register_ip = '')
         AND ${noCashSql}
       GROUP BY channel_code
       HAVING COUNT(*) >= 1000
       ORDER BY no_cash_null_ip_users DESC, last_created_at DESC`,
      [startAt]
    );

    console.log('\n========== 异常渠道（无现金 + 空IP，>=1000） ==========' );
    console.table(prefixRows.slice(0, 80));
    if (prefixRows.length > 80) logWarn(`还有 ${prefixRows.length - 80} 个渠道未显示`);

    const [victims] = await conn.execute(
      `SELECT
         u.id,
         u.username,
         u.thirdparty_uid,
         u.channel_code,
         u.game_code,
         u.register_ip,
         u.platform_coins,
         u.created_at,
         CASE
           WHEN u.username REGEXP '^nuke_[0-9]{10,}_[a-z0-9]+$' THEN 'nuke_ts_rand'
           WHEN u.username REGEXP '^scan_[0-9]{5,}$' THEN 'scan_digits'
           WHEN u.username REGEXP '^[a-z]{2,24}[0-9]{3,6}$' THEN 'lowerword_digits'
           WHEN u.username REGEXP '^[0-9]{11}$' THEN 'phone_like_11_digits'
           WHEN u.username REGEXP '^[0-9]{6,10}$' THEN 'digits_6_10'
           WHEN u.username REGEXP '^[A-Za-z0-9]{3,24}$' THEN 'alnum_mixed'
           ELSE 'other'
         END AS bot_pattern,
         COALESCE(pr_all.total_payment_records, 0) AS total_payment_records,
         COALESCE(pr_ptb.platform_coin_records, 0) AS platform_coin_records,
         COALESCE(gc.character_count, 0) AS character_count,
         COALESCE(su.subuser_count, 0) AS subuser_count
       ${victimSourceSql}
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS total_payment_records
         FROM paymentrecords
         GROUP BY user_id
       ) pr_all ON pr_all.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS platform_coin_records
         FROM paymentrecords
         WHERE payment_way LIKE '%平台币%'
         GROUP BY user_id
       ) pr_ptb ON pr_ptb.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS character_count
         FROM gamecharacters
         GROUP BY user_id
       ) gc ON gc.user_id = u.id
       LEFT JOIN (
         SELECT parent_user_id, COUNT(*) AS subuser_count
         FROM subusers
         GROUP BY parent_user_id
       ) su ON su.parent_user_id = u.id
       ORDER BY LOWER(LEFT(u.username, 4)), u.created_at`,
      [startAt, startAt]
    );

    console.log('\n========== 将清理的账号预览 ==========' );
    console.table(victims.slice(0, 100));
    if (victims.length > 100) logWarn(`还有 ${victims.length - 100} 个账号未显示`);

    const [summaryRows] = await conn.execute(
      `SELECT
         COUNT(*) AS users_to_delete,
         COALESCE(SUM((SELECT COUNT(*) FROM subusers su WHERE su.parent_user_id = victim.id)), 0) AS subusers_to_delete,
         COALESCE(SUM((SELECT COUNT(*) FROM gamecharacters gc WHERE gc.user_id = victim.id)), 0) AS gamecharacters_to_delete,
         COALESCE(SUM((SELECT COUNT(*) FROM paymentrecords pr WHERE pr.user_id = victim.id)), 0) AS paymentrecords_to_delete,
         COALESCE(SUM((SELECT COUNT(*) FROM giftpackagepurchaserecords gpr WHERE gpr.user_id = victim.id)), 0) AS gift_purchase_records_to_delete,
         COALESCE(SUM((SELECT COUNT(*) FROM admintoplayerplatformcointransactions apt WHERE apt.user_thirdparty_uid = victim.thirdparty_uid)), 0) AS admin_to_player_coin_records_to_delete
       FROM (
         SELECT u.id, u.thirdparty_uid
         ${victimSourceSql}
       ) victim`,
      [startAt, startAt]
    );

    console.log('\n========== 删除数量汇总 ==========' );
    console.table(summaryRows);

    if (!args.execute) {
      logInfo('模拟预览完成，未执行删除。确认无误后加 --execute 执行。');
      return;
    }

    if (victims.length === 0) {
      logInfo('没有命中账号，无需删除。');
      return;
    }

    logWarn('即将执行真实删除，开始事务...');
    await conn.beginTransaction();

    await conn.execute('DROP TEMPORARY TABLE IF EXISTS cleanup_victim_users');
    await conn.execute(
      `CREATE TEMPORARY TABLE cleanup_victim_users AS
       SELECT u.id, u.username, u.thirdparty_uid
       ${victimSourceSql}`,
      [startAt, startAt]
    );

    const deleteSteps = [
      ['giftpackagepurchaserecords', `DELETE gpr FROM giftpackagepurchaserecords gpr JOIN cleanup_victim_users v ON v.id = gpr.user_id`],
      ['paymentrecords', `DELETE pr FROM paymentrecords pr JOIN cleanup_victim_users v ON v.id = pr.user_id`],
      ['gamecharacters', `DELETE gc FROM gamecharacters gc JOIN cleanup_victim_users v ON v.id = gc.user_id`],
      ['subusers', `DELETE su FROM subusers su JOIN cleanup_victim_users v ON v.id = su.parent_user_id`],
      ['admintoplayerplatformcointransactions', `DELETE apt FROM admintoplayerplatformcointransactions apt JOIN cleanup_victim_users v ON v.thirdparty_uid = apt.user_thirdparty_uid`],
      ['users', `DELETE u FROM users u JOIN cleanup_victim_users v ON v.id = u.id`],
    ];

    for (const [name, sql] of deleteSteps) {
      const [result] = await conn.execute(sql);
      logInfo(`[删除] ${name}: ${result.affectedRows || 0}`);
    }

    const remainChecks = [];
    for (const [name, sql] of [
      ['remain_users', `SELECT COUNT(*) AS cnt FROM users u JOIN cleanup_victim_users v ON v.id = u.id`],
      ['remain_subusers', `SELECT COUNT(*) AS cnt FROM subusers su JOIN cleanup_victim_users v ON v.id = su.parent_user_id`],
      ['remain_gamecharacters', `SELECT COUNT(*) AS cnt FROM gamecharacters gc JOIN cleanup_victim_users v ON v.id = gc.user_id`],
      ['remain_paymentrecords', `SELECT COUNT(*) AS cnt FROM paymentrecords pr JOIN cleanup_victim_users v ON v.id = pr.user_id`],
      ['remain_gift_purchase_records', `SELECT COUNT(*) AS cnt FROM giftpackagepurchaserecords gpr JOIN cleanup_victim_users v ON v.id = gpr.user_id`],
      ['remain_admin_to_player_coin_records', `SELECT COUNT(*) AS cnt FROM admintoplayerplatformcointransactions apt JOIN cleanup_victim_users v ON v.thirdparty_uid = apt.user_thirdparty_uid`],
    ]) {
      const [rows] = await conn.execute(sql);
      remainChecks.push({ name, count: Number(rows[0]?.cnt || 0) });
    }

    console.log('\n========== 删除后复核 ==========' );
    console.table(remainChecks);

    await conn.commit();
    logInfo('真实删除完成，事务已提交。');
  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    logError(`执行失败，已回滚: ${error.message || error}`);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

main();
