#!/usr/bin/env node
/**
 * 安全 & 财务审计工具
 *
 * Usage:
 *   node scripts/audit.js <command> [options]
 *
 * 命令:
 *   admin-coins-log         管理员发币 / 操作日志
 *   admin-orders-reconcile  支付订单 vs 管理员发币流水 对账
 *   balance-check           玩家余额 vs 支付订单累计变动 校验
 *   user-trace              单玩家全轨迹（登录 + 余额变动 + 管理员操作）
 *   item-mail-check         查询某道具ID被发邮件的gm_operation_logs记录
 *   clean-failed-orders     删除 PaymentRecords 中所有非成功订单（dry-run 模式默认开启）
 *   help                    显示帮助
 *
 * 通用参数:
 *   --days=N        最近 N 天，默认 30
 *   --user=ID       玩家 user_id
 *   --username=NAME 玩家用户名
 *   --admin=NAME    管理员名 / 渠道代码
 *   --threshold=X   余额差异阈值（仅 balance-check），默认 0.01
 *   --limit=N       输出条数上限，默认 100
 *   --json          以 JSON 输出（默认表格）
 *
 * item-mail-check 专用参数:
 *   --item=道具ID   要查询的道具ID（必填）
 *   --days=N        搜索最近N天，默认30
 *
 * clean-failed-orders 专用参数:
 *   --dry-run       仅统计不删除（默认开启，必须显式加 --confirm 才真正删除）
 *   --confirm       确认真实删除
 *   --keep-days=N   保留最近N天的失败订单不删（默认保留7天内的），0=全删
 *
 * 示例:
 *   node scripts/audit.js admin-coins-log --days=7
 *   node scripts/audit.js admin-coins-log --admin=channel_abc --days=30
 *   node scripts/audit.js admin-orders-reconcile --days=30
 *   node scripts/audit.js balance-check --user=12345
 *   node scripts/audit.js balance-check --threshold=1
 *   node scripts/audit.js user-trace --username=alice --days=30
 *   node scripts/audit.js item-mail-check --item=10001 --days=90
 *   node scripts/audit.js clean-failed-orders              # dry-run 预览
 *   node scripts/audit.js clean-failed-orders --confirm    # 真实删除
 *   node scripts/audit.js clean-failed-orders --confirm --keep-days=0  # 全部删除
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// -----------------------------
// 参数解析
// -----------------------------
function parseArgs(argv) {
    const out = {};
    for (const a of argv) {
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            if (eq === -1) {
                out[a.slice(2)] = true;
            } else {
                out[a.slice(2, eq)] = a.slice(eq + 1);
            }
        }
    }
    return out;
}

const cmd = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const DAYS = parseInt(args.days || '30', 10);
const LIMIT = parseInt(args.limit || '100', 10);
const AS_JSON = !!args.json;

// -----------------------------
// DB
// -----------------------------
let pool;
async function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            ...DB_CONFIG,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
        });
    }
    return pool;
}

async function q(sqlText, values = []) {
    const p = await getPool();
    const [rows] = await p.query(sqlText, values);
    return rows;
}

// 带计时的查询 — 打印 SQL 耗时
async function qt(label, sqlText, values = []) {
    const t0 = Date.now();
    const p = await getPool();
    const [rows] = await p.query(sqlText, values);
    const ms = Date.now() - t0;
    const flag = ms > 3000 ? '🔴' : ms > 1000 ? '🟡' : '🟢';
    console.log(`  ${flag} [${label}] ${ms}ms  rows=${Array.isArray(rows) ? rows.length : '-'}`);
    return rows;
}

// -----------------------------
// 输出辅助
// -----------------------------
function output(title, rows) {
    console.log('');
    console.log('===== ' + title + ' =====');
    if (!rows || rows.length === 0) {
        console.log('  （无数据）');
        return;
    }
    if (AS_JSON) {
        console.log(JSON.stringify(rows, null, 2));
    } else {
        console.table(rows);
    }
    console.log(`  共 ${rows.length} 条`);
}

function fmt(n) {
    if (n === null || n === undefined) return '';
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n);
    return x.toFixed(2);
}

// -----------------------------
// 用户解析（user_id / username -> {id, username, thirdparty_uid}）
// -----------------------------
async function resolveUser({ user, username }) {
    if (!user && !username) return null;
    let row;
    if (user) {
        const r = await q('SELECT id, username, iphone, channel_code, game_code, platform_coins, status, created_at, thirdparty_uid FROM Users WHERE id = ? LIMIT 1', [user]);
        row = r[0];
    } else {
        const r = await q('SELECT id, username, iphone, channel_code, game_code, platform_coins, status, created_at, thirdparty_uid FROM Users WHERE username = ? LIMIT 1', [username]);
        row = r[0];
    }
    return row || null;
}

// =================================================================
// 命令 1: admin-coins-log  管理员发币 / 操作日志
// =================================================================
async function adminCoinsLog() {
    logInfo(`查询最近 ${DAYS} 天管理员操作日志`);

    // -- 1) AdminToPlayerPlatformCoinTransactions（管理员→玩家平台币）
    {
        const where = ['apt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'];
        const vals = [DAYS];
        if (args.admin) {
            where.push('(apt.admin_name = ? OR apt.admin_channel_code = ? OR apt.operator_channel_code = ?)');
            vals.push(args.admin, args.admin, args.admin);
        }
        if (args.user) {
            where.push('u.id = ?');
            vals.push(args.user);
        }
        if (args.username) {
            where.push('u.username = ?');
            vals.push(args.username);
        }
        const sqlText = `
            SELECT
                apt.created_at,
                apt.admin_name,
                apt.admin_channel_code,
                apt.operator_channel_code,
                u.id           AS user_id,
                u.username     AS username,
                apt.user_channel_code,
                apt.amount,
                apt.player_balance_before,
                apt.player_balance_after,
                apt.remark
            FROM AdminToPlayerPlatformCoinTransactions apt
            LEFT JOIN Users u ON u.thirdparty_uid = apt.user_thirdparty_uid
            WHERE ${where.join(' AND ')}
            ORDER BY apt.created_at DESC
            LIMIT ${LIMIT}
        `;
        const rows = await q(sqlText, vals);
        const view = rows.map(r => ({
            time: r.created_at,
            admin: r.admin_name,
            admin_ch: r.admin_channel_code,
            op_by: r.operator_channel_code || '',
            user_id: r.user_id,
            username: r.username,
            amount: fmt(r.amount),
            before: fmt(r.player_balance_before),
            after: fmt(r.player_balance_after),
            remark: r.remark || '',
        }));
        output('管理员 → 玩家 平台币流水 (AdminToPlayerPlatformCoinTransactions)', view);

        const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
        console.log(`  合计变动: ${fmt(total)}`);
    }

    // -- 2) AdminPlatformCoinTransactions（管理员→管理员）
    {
        const where = ['created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'];
        const vals = [DAYS];
        if (args.admin) {
            where.push('(from_channel_code = ? OR to_channel_code = ? OR operator_channel_code = ? OR from_admin_name = ? OR to_admin_name = ?)');
            vals.push(args.admin, args.admin, args.admin, args.admin, args.admin);
        }
        const sqlText = `
            SELECT created_at, from_admin_name, from_channel_code, to_admin_name, to_channel_code,
                   amount, from_balance_before, from_balance_after, to_balance_before, to_balance_after,
                   operator_channel_code, remark
            FROM AdminPlatformCoinTransactions
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC
            LIMIT ${LIMIT}
        `;
        const rows = await q(sqlText, vals);
        const view = rows.map(r => ({
            time: r.created_at,
            from: `${r.from_admin_name}(${r.from_channel_code})`,
            to: `${r.to_admin_name}(${r.to_channel_code})`,
            amount: fmt(r.amount),
            op_by: r.operator_channel_code || '',
            remark: r.remark || '',
        }));
        output('管理员 → 管理员 平台币流水 (AdminPlatformCoinTransactions)', view);
    }

    // -- 3) gm_operation_logs（GM 后台操作：发奖、邮件、迁服等）
    {
        const where = ['created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'];
        const vals = [DAYS];
        if (args.admin) {
            where.push('(admin_name = ? OR admin_id = ?)');
            vals.push(args.admin, args.admin);
        }
        if (args.user) {
            where.push('player_id = ?');
            vals.push(String(args.user));
        }
        if (args.username) {
            where.push('player_name = ?');
            vals.push(args.username);
        }
        const sqlText = `
            SELECT created_at, op_type, admin_name, admin_id, server, player_id, player_name,
                   role_id, success, error_message
            FROM gm_operation_logs
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC
            LIMIT ${LIMIT}
        `;
        const rows = await q(sqlText, vals);
        output('GM 后台操作日志 (gm_operation_logs)', rows);
    }
}

// =================================================================
// 命令 2: admin-orders-reconcile  PaymentRecords vs AdminToPlayerPlatformCoinTransactions
// =================================================================
async function adminOrdersReconcile() {
    logInfo(`对账最近 ${DAYS} 天的管理员发币订单`);

    // 1) PaymentRecords 中所有"管理员发放/扣除"订单
    const pr = await q(`
        SELECT id, user_id, transaction_id, mch_order_id, product_name, amount, ptb_before, ptb_change, ptb_after,
               channel_code, msg, payment_status, created_at
        FROM PaymentRecords
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (product_name LIKE '管理员%' OR payment_way = '平台币')
        ORDER BY created_at DESC
    `, [DAYS]);

    // 2) AdminToPlayerPlatformCoinTransactions 同期
    const xfer = await q(`
        SELECT apt.id, apt.created_at, apt.amount, apt.admin_name, apt.admin_channel_code,
               apt.operator_channel_code, apt.player_balance_before, apt.player_balance_after,
               apt.remark, u.id AS user_id
        FROM AdminToPlayerPlatformCoinTransactions apt
        LEFT JOIN Users u ON u.thirdparty_uid = apt.user_thirdparty_uid
        WHERE apt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY apt.created_at DESC
    `, [DAYS]);

    // 3) 对账：以 (user_id, |amount|, 30 秒内) 配对
    const xferIndex = new Map(); // key: user_id|absAmount  -> [xfer rows]
    for (const x of xfer) {
        const key = `${x.user_id}|${Math.abs(Number(x.amount)).toFixed(2)}`;
        if (!xferIndex.has(key)) xferIndex.set(key, []);
        xferIndex.get(key).push(x);
    }

    const matched = [];
    const prOrphans = [];   // PR 里有，xfer 里没有 -> 可疑（绕开流水改余额）
    for (const r of pr) {
        const key = `${r.user_id}|${Math.abs(Number(r.amount)).toFixed(2)}`;
        const candidates = xferIndex.get(key) || [];
        // 取时间最近的一条（30 秒内）作配对
        const prTime = new Date(r.created_at).getTime();
        let bestIdx = -1;
        let bestDelta = Infinity;
        for (let i = 0; i < candidates.length; i++) {
            const xt = new Date(candidates[i].created_at).getTime();
            const dt = Math.abs(xt - prTime);
            if (dt < 30000 && dt < bestDelta) {
                bestDelta = dt;
                bestIdx = i;
            }
        }
        if (bestIdx >= 0) {
            matched.push({ pr_id: r.id, xfer_id: candidates[bestIdx].id, user_id: r.user_id, amount: fmt(r.amount), product: r.product_name });
            candidates.splice(bestIdx, 1);
            if (candidates.length === 0) xferIndex.delete(key);
        } else {
            prOrphans.push({
                pr_id: r.id,
                time: r.created_at,
                user_id: r.user_id,
                product: r.product_name,
                amount: fmt(r.amount),
                ptb_change: fmt(r.ptb_change),
                msg: r.msg || '',
                channel: r.channel_code,
            });
        }
    }

    // 剩下的 xfer = 流水有 PR 没有
    const xferOrphans = [];
    for (const [, arr] of xferIndex) for (const x of arr) {
        xferOrphans.push({
            xfer_id: x.id,
            time: x.created_at,
            user_id: x.user_id,
            admin: x.admin_name,
            admin_ch: x.admin_channel_code,
            op_by: x.operator_channel_code,
            amount: fmt(x.amount),
            remark: x.remark || '',
        });
    }

    console.log('');
    console.log('===== 对账汇总 =====');
    console.log(`  PaymentRecords 管理员相关订单: ${pr.length}`);
    console.log(`  AdminToPlayer 转账流水:        ${xfer.length}`);
    console.log(`  匹配成功:                     ${matched.length}`);
    console.log(`  ❌ PR 孤儿 (有订单无流水):     ${prOrphans.length}`);
    console.log(`  ❌ Xfer 孤儿 (有流水无订单):   ${xferOrphans.length}`);

    output('PR 孤儿 ❌ 可疑：可能绕过流水表直接改了余额', prOrphans);
    output('Xfer 孤儿 ❌ 可疑：操作了但未生成支付订单', xferOrphans);

    if (args.verbose) {
        output('匹配成功明细', matched);
    } else {
        console.log('  （加 --verbose 查看匹配明细）');
    }
}

// =================================================================
// 命令 3: balance-check  Users.platform_coins vs SUM(PaymentRecords.ptb_change)
// =================================================================
async function balanceCheck() {
    const threshold = parseFloat(args.threshold || '0.01');
    logInfo(`余额校验，阈值 ${threshold}`);

    if (args.user || args.username) {
        const u = await resolveUser(args);
        if (!u) {
            logError('用户不存在');
            return;
        }
        await checkOne(u, threshold);
        return;
    }

    // 全量：分页扫描，所有 status=0 用户
    logInfo('全量扫描所有玩家（仅状态正常的）');
    const PAGE = 500;
    let offset = 0;
    let totalChecked = 0;
    const diffs = [];
    while (true) {
        const batch = await q(
            'SELECT id, username, platform_coins FROM Users WHERE status = 0 ORDER BY id ASC LIMIT ? OFFSET ?',
            [PAGE, offset]
        );
        if (batch.length === 0) break;
        for (const u of batch) {
            const sum = await q(
                'SELECT COALESCE(SUM(ptb_change), 0) AS s FROM PaymentRecords WHERE user_id = ? AND payment_status = 3',
                [u.id]
            );
            const calc = Number(sum[0].s || 0);
            const actual = Number(u.platform_coins || 0);
            const diff = +(actual - calc).toFixed(4);
            totalChecked++;
            if (Math.abs(diff) > threshold) {
                diffs.push({
                    user_id: u.id,
                    username: u.username,
                    actual: fmt(actual),
                    calc_from_orders: fmt(calc),
                    diff: fmt(diff),
                });
            }
        }
        offset += PAGE;
        if (totalChecked % 2000 === 0) {
            logInfo(`已扫描 ${totalChecked} 个用户，发现差异 ${diffs.length} 个`);
        }
    }
    console.log('');
    console.log(`扫描完成：共 ${totalChecked} 个用户，差异 ${diffs.length} 个`);
    output(`余额异常用户（|差异| > ${threshold}）`, diffs.slice(0, LIMIT));
    if (diffs.length > LIMIT) {
        console.log(`  仅显示前 ${LIMIT} 条，加 --limit=N 调整`);
    }
}

async function checkOne(u, threshold) {
    const sum = await q(
        'SELECT COALESCE(SUM(ptb_change), 0) AS s FROM PaymentRecords WHERE user_id = ? AND payment_status = 3',
        [u.id]
    );
    const calc = Number(sum[0].s || 0);
    const actual = Number(u.platform_coins || 0);
    const diff = +(actual - calc).toFixed(4);

    console.log('');
    console.log(`===== 用户 ${u.username} (id=${u.id}) 余额校验 =====`);
    console.log(`  当前余额 (Users.platform_coins): ${fmt(actual)}`);
    console.log(`  订单累计 SUM(ptb_change WHERE status=3): ${fmt(calc)}`);
    console.log(`  差异: ${fmt(diff)} ${Math.abs(diff) > threshold ? '❌ 超出阈值' : '✅ 正常'}`);
}

// =================================================================
// 命令 4: user-trace  单用户全轨迹（盗号事件调查用）
// =================================================================
async function userTrace() {
    const u = await resolveUser(args);
    if (!u) {
        logError('需指定 --user=ID 或 --username=NAME，且用户必须存在');
        return;
    }

    console.log('');
    console.log('===== 玩家基本信息 =====');
    console.table([{
        id: u.id,
        username: u.username,
        iphone: u.iphone || '',
        channel_code: u.channel_code,
        game_code: u.game_code,
        platform_coins: fmt(u.platform_coins),
        status: u.status === 1 ? '封号' : '正常',
        created_at: u.created_at,
        thirdparty_uid: u.thirdparty_uid,
    }]);

    // 登录日志（按 username 关联 UserLoginLogs）
    {
        const rows = await q(`
            SELECT login_time, ip_address, device, imei, game_code, channel_code
            FROM UserLoginLogs
            WHERE username = ? AND login_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY login_time DESC
            LIMIT ?
        `, [u.username, DAYS, LIMIT]).catch(() => []);
        output(`最近 ${DAYS} 天登录日志（含成功失败）`, rows);

        // 异常检测：IP 多样性
        const ipSet = new Set(rows.map(r => r.ip_address));
        const deviceSet = new Set(rows.map(r => r.device));
        if (rows.length > 0) {
            console.log(`  独立 IP: ${ipSet.size}, 独立 device: ${deviceSet.size}`);
            if (ipSet.size > 5) {
                console.log('  ⚠️  IP 数量较多，疑似异地登录 / 撞库');
            }
        }
    }

    // 余额变动
    {
        const rows = await q(`
            SELECT created_at, transaction_id, payment_way, product_name, amount,
                   ptb_before, ptb_change, ptb_after, payment_status, msg
            FROM PaymentRecords
            WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY created_at DESC
            LIMIT ?
        `, [u.id, DAYS, LIMIT]);
        const view = rows.map(r => ({
            time: r.created_at,
            tx: r.transaction_id,
            way: r.payment_way,
            product: r.product_name,
            amount: fmt(r.amount),
            ptb_before: fmt(r.ptb_before),
            ptb_change: fmt(r.ptb_change),
            ptb_after: fmt(r.ptb_after),
            status: r.payment_status,
            msg: r.msg || '',
        }));
        output(`最近 ${DAYS} 天余额变动 (PaymentRecords)`, view);
    }

    // 管理员对该玩家的操作 - AdminToPlayer
    {
        const rows = await q(`
            SELECT apt.created_at, apt.admin_name, apt.admin_channel_code,
                   apt.operator_channel_code, apt.amount,
                   apt.player_balance_before, apt.player_balance_after, apt.remark
            FROM AdminToPlayerPlatformCoinTransactions apt
            WHERE apt.user_thirdparty_uid = ?
              AND apt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY apt.created_at DESC
            LIMIT ?
        `, [u.thirdparty_uid, DAYS, LIMIT]);
        output(`最近 ${DAYS} 天管理员发币记录`, rows.map(r => ({
            time: r.created_at,
            admin: r.admin_name,
            admin_ch: r.admin_channel_code,
            op_by: r.operator_channel_code,
            amount: fmt(r.amount),
            before: fmt(r.player_balance_before),
            after: fmt(r.player_balance_after),
            remark: r.remark || '',
        })));
    }

    // GM 后台操作
    {
        const rows = await q(`
            SELECT created_at, op_type, admin_name, server, player_id, role_id, success, error_message
            FROM gm_operation_logs
            WHERE (player_name = ? OR player_id = ?)
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY created_at DESC
            LIMIT ?
        `, [u.username, String(u.id), DAYS, LIMIT]).catch(() => []);
        output(`最近 ${DAYS} 天 GM 操作 (gm_operation_logs)`, rows);
    }

    // 余额一致性
    await checkOne(u, parseFloat(args.threshold || '0.01'));
}

// =================================================================
// 命令 5: item-mail-check  查道具ID被发邮件的 gm_operation_logs 记录
// =================================================================
async function itemMailCheck() {
    const itemId = args.item;
    if (!itemId) {
        logError('请指定 --item=道具ID，例如: --item=10001');
        return;
    }
    logInfo(`查询道具 ID=${itemId} 被发送邮件的记录，最近 ${DAYS} 天`);

    // gm_operation_logs 可能在 request_body / details / extra / error_message 等 JSON 列里存了道具信息
    // 同时也按 op_type LIKE '%邮件%' OR '%mail%' 过滤
    const rows = await q(`
        SELECT
            id,
            created_at,
            op_type,
            admin_name,
            admin_id,
            server,
            player_id,
            player_name,
            role_id,
            success,
            error_message
        FROM gm_operation_logs
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (
              op_type LIKE '%邮件%'
           OR op_type LIKE '%mail%'
           OR op_type LIKE '%Mail%'
           OR op_type LIKE '%发奖%'
           OR op_type LIKE '%发物品%'
          )
          AND (
              player_id    = ?
           OR role_id      = ?
           OR error_message LIKE CONCAT('%', ?, '%')
          )
        ORDER BY created_at DESC
        LIMIT ?
    `, [DAYS, String(itemId), String(itemId), String(itemId), LIMIT]);

    output(`道具 ID=${itemId} 的邮件发送记录 (gm_operation_logs)`, rows.map(r => ({
        id:       r.id,
        time:     r.created_at,
        op_type:  r.op_type,
        admin:    r.admin_name || r.admin_id,
        server:   r.server,
        player:   r.player_name || r.player_id,
        role_id:  r.role_id,
        success:  r.success ? '✅' : '❌',
        err:      r.error_message || '',
    })));

    // 如果想也搜 error_message 里含道具ID的（不限 op_type）
    const rows2 = await q(`
        SELECT
            id, created_at, op_type, admin_name, server,
            player_id, player_name, role_id, success, error_message
        FROM gm_operation_logs
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND error_message LIKE CONCAT('%', ?, '%')
          AND NOT (
              op_type LIKE '%邮件%'
           OR op_type LIKE '%mail%'
           OR op_type LIKE '%Mail%'
           OR op_type LIKE '%发奖%'
           OR op_type LIKE '%发物品%'
          )
        ORDER BY created_at DESC
        LIMIT ?
    `, [DAYS, String(itemId), LIMIT]);

    if (rows2.length > 0) {
        output(`其他 op_type 中 error_message 含 "${itemId}" 的记录`, rows2.map(r => ({
            id:      r.id,
            time:    r.created_at,
            op_type: r.op_type,
            admin:   r.admin_name,
            player:  r.player_name || r.player_id,
            role_id: r.role_id,
            success: r.success ? '✅' : '❌',
            err:     r.error_message || '',
        })));
    }

    if (rows.length === 0 && rows2.length === 0) {
        console.log(`\n  ℹ️  最近 ${DAYS} 天内未找到道具 ID=${itemId} 相关的邮件记录`);
        console.log('  提示：可以用 --days=90 扩大搜索范围');
    }
}

// =================================================================
// 命令 6: clean-failed-orders  清理 PaymentRecords 非成功订单
// =================================================================
async function cleanFailedOrders() {
    const isDryRun  = !args.confirm;
    const keepDays  = args['keep-days'] !== undefined ? parseInt(args['keep-days'], 10) : 7;

    logInfo(`清理 PaymentRecords 非成功订单${isDryRun ? ' [DRY-RUN 预览模式，不会真实删除]' : ' [⚠️  真实删除模式]'}`);
    logInfo(`保留最近 ${keepDays} 天内的失败订单不删 (--keep-days=${keepDays})`);

    // --- 1. 先统计各状态数量 ---
    const stats = await q(`
        SELECT
            payment_status,
            COUNT(*)          AS cnt,
            MIN(created_at)   AS earliest,
            MAX(created_at)   AS latest
        FROM PaymentRecords
        GROUP BY payment_status
        ORDER BY payment_status
    `);
    console.log('');
    console.log('===== PaymentRecords 当前统计 =====');
    console.table(stats);
    const total = stats.reduce((s, r) => s + Number(r.cnt), 0);
    const successRow = stats.find(r => Number(r.payment_status) === 3);
    console.log(`  总计: ${total} 条，其中成功(status=3): ${successRow ? successRow.cnt : 0} 条`);

    // --- 2. 检查索引（解释慢查询原因）---
    console.log('');
    console.log('===== 索引检查 =====');
    const indexes = await q(`SHOW INDEX FROM PaymentRecords`);
    const idxCols = indexes.map(r => r.Column_name);
    const needCols = ['user_id', 'payment_status', 'transaction_id', 'created_at'];
    for (const col of needCols) {
        const has = idxCols.includes(col);
        console.log(`  ${has ? '✅' : '❌ 缺少索引'} ${col}`);
    }
    if (!idxCols.includes('payment_status') || !idxCols.includes('user_id')) {
        console.log('');
        console.log('  ⚠️  建议执行以下 SQL 补充索引（可显著提速）:');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_user_status (user_id, payment_status);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_status_created (payment_status, created_at);');
    } else {
        console.log('  ✅ 索引配置正常，38万条数据有索引不会慢，若仍慢建议 EXPLAIN 具体查询');
    }

    // --- 3. 统计将要删除的数量 ---
    let keepClause = '';
    const keepVals = [];
    if (keepDays > 0) {
        keepClause = 'AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)';
        keepVals.push(keepDays);
    }
    const toDelete = await q(
        `SELECT COUNT(*) AS cnt, MIN(created_at) AS earliest, MAX(created_at) AS latest
         FROM PaymentRecords
         WHERE payment_status != 3 ${keepClause}`,
        keepVals
    );
    console.log('');
    console.log('===== 待删除统计 =====');
    console.log(`  将删除: ${toDelete[0].cnt} 条 (payment_status != 3, 且 ${keepDays} 天前创建的)`);
    console.log(`  最早:   ${toDelete[0].earliest || '-'}`);
    console.log(`  最近:   ${toDelete[0].latest || '-'}`);

    if (Number(toDelete[0].cnt) === 0) {
        console.log('  ✅ 没有符合条件的记录可删除');
        return;
    }

    // --- 4. dry-run 则退出 ---
    if (isDryRun) {
        console.log('');
        console.log('  👆 以上为 DRY-RUN 预览。确认无误后加 --confirm 参数执行真实删除：');
        console.log('  node scripts/audit.js clean-failed-orders --confirm');
        if (keepDays > 0) {
            console.log(`  node scripts/audit.js clean-failed-orders --confirm --keep-days=${keepDays}`);
        }
        return;
    }

    // --- 5. 真实删除（分批，避免锁表）---
    console.log('');
    logWarn(`开始删除，每批 5000 条...`);
    let totalDeleted = 0;
    while (true) {
        const result = await q(
            `DELETE FROM PaymentRecords
             WHERE payment_status != 3 ${keepClause}
             LIMIT 5000`,
            keepVals
        );
        const affected = result.affectedRows || 0;
        totalDeleted += affected;
        if (affected === 0) break;
        logInfo(`已删除 ${totalDeleted} 条...`);
        // 稍作停顿，避免连续大量写操作影响线上
        await new Promise(r => setTimeout(r, 200));
    }
    console.log('');
    console.log(`  ✅ 删除完成，共删除 ${totalDeleted} 条非成功订单`);

    // --- 6. 显示删除后统计 ---
    const statsAfter = await q(`
        SELECT payment_status, COUNT(*) AS cnt
        FROM PaymentRecords
        GROUP BY payment_status
        ORDER BY payment_status
    `);
    output('删除后 PaymentRecords 统计', statsAfter);
}

// =================================================================
// 命令 7: payment-slow-check  对实际 admin 面板用的查询做 EXPLAIN + 计时
// =================================================================
async function paymentSlowCheck() {
    logInfo('分析支付订单查询性能（模拟 admin 面板实际 SQL）');

    // 商量基本信息
    const [countRow] = await q('SELECT COUNT(*) AS cnt FROM PaymentRecords');
    console.log(`\n  表总行数: ${countRow.cnt}`);

    // 检查索引
    console.log('');
    console.log('===== 索引状态 =====');
    const indexes = await q('SHOW INDEX FROM PaymentRecords');
    const idxMap = {};
    for (const r of indexes) {
        const k = r.Key_name;
        if (!idxMap[k]) idxMap[k] = [];
        idxMap[k].push(r.Column_name);
    }
    for (const [name, cols] of Object.entries(idxMap)) {
        console.log(`  ${name}: (${cols.join(', ')})`);
    }
    const hasCols = new Set(indexes.map(r => r.Column_name));
    const missing = ['created_at','channel_code','payment_status','user_id'].filter(c => !hasCols.has(c));
    if (missing.length) {
        console.log(`\n  ❌ 缺少索引列: ${missing.join(', ')}`);
        console.log('  建议执行:');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_created (created_at DESC);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_status_created (payment_status, created_at DESC);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_channel_created (channel_code, created_at DESC);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_user (user_id);');
    } else {
        console.log('  ✅ 常用列均有索引');
    }

    // 实际运行 admin 面板的 3 个并发查询并计时
    console.log('');
    console.log('===== 实际运行计时（模拟第1页、无年月过滤）=====');
    await Promise.all([
        qt('readPage  SELECT *',
           'SELECT pr.* FROM PaymentRecords pr ORDER BY pr.created_at DESC LIMIT 0, 10'),
        qt('count     COUNT(*)',
           'SELECT COUNT(*) AS total FROM PaymentRecords pr'),
        qt('allAmount SUM(amount)',
           'SELECT SUM(pr.amount) AS total FROM PaymentRecords pr'),
    ]);

    // 有渠道將1个 channel_code 的情向
    const [sampleCh] = await q('SELECT channel_code FROM PaymentRecords WHERE channel_code != "" LIMIT 1');
    if (sampleCh) {
        const ch = sampleCh.channel_code;
        console.log(`\n  模拟有渠道將过滤 (channel_code=${ch}):`);
        await Promise.all([
            qt('readPage  channel filter',
               'SELECT pr.* FROM PaymentRecords pr WHERE pr.channel_code = ? ORDER BY pr.created_at DESC LIMIT 0, 10',
               [ch]),
            qt('count     channel filter',
               'SELECT COUNT(*) AS total FROM PaymentRecords pr WHERE pr.channel_code = ?',
               [ch]),
            qt('allAmount channel filter',
               'SELECT SUM(pr.amount) AS total FROM PaymentRecords pr WHERE pr.channel_code = ?',
               [ch]),
        ]);
    }

    // EXPLAIN
    console.log('');
    console.log('===== EXPLAIN (readPage 无过滤) =====');
    const explainRows = await q('EXPLAIN SELECT pr.* FROM PaymentRecords pr ORDER BY pr.created_at DESC LIMIT 0, 10');
    console.table(explainRows);

    console.log('');
    console.log('===== EXPLAIN (count 无过滤) =====');
    const explainCount = await q('EXPLAIN SELECT COUNT(*) AS total FROM PaymentRecords pr');
    console.table(explainCount);

    // 根据耗时给出建议
    console.log('');
    console.log('===== 优化建议 =====');
    console.log('1. 加索引（最重要）:');
    console.log('   ALTER TABLE PaymentRecords ADD INDEX idx_created (created_at DESC);');
    console.log('   ALTER TABLE PaymentRecords ADD INDEX idx_status_created (payment_status, created_at DESC);');
    console.log('   ALTER TABLE PaymentRecords ADD INDEX idx_channel_created (channel_code, created_at DESC);');
    console.log('');
    console.log('2. admin 面板并发了 readPage + count + allAmount 共3个全表扫描，可以优化为:');
    console.log('   a) count 用 SQL_CALC_FOUND_ROWS 只扫一次');
    console.log('   b) allAmount 加上 payment_status=3 条件索引，避免全表 SUM');
    console.log('   c) 删除失败订单（clean-failed-orders）减少数据量');
}

// =================================================================
// 命令 8: login-ip-check  登录IP分析（检查是否异常）
// =================================================================
async function loginIpCheck() {
    const targetUsername = args.username;
    if (!targetUsername) {
        logError('请指定 --username=NAME，例如: --username=ao1shib123');
        return;
    }
    const days = DAYS;
    logInfo(`分析用户 [${targetUsername}] 最近 ${days} 天的登录IP`);

    // 1. 查用户基本信息
    const userRows = await q('SELECT id, username, channel_code, status, created_at FROM Users WHERE username = ? LIMIT 1', [targetUsername]);
    if (userRows.length === 0) {
        logError(`用户 ${targetUsername} 不存在`);
        return;
    }
    const u = userRows[0];
    console.log('');
    console.log('===== 用户基本信息 =====');
    console.table([{ id: u.id, username: u.username, channel: u.channel_code, status: u.status === 1 ? '封号' : '正常', created_at: u.created_at }]);

    // 2. 拉登录日志
    const logs = await q(`
        SELECT login_time, ip_address, device, imei, game_code, channel_code
        FROM UserLoginLogs
        WHERE username = ? AND login_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY login_time DESC
        LIMIT 500
    `, [targetUsername, days]);

    if (logs.length === 0) {
        console.log('  （该用户在此时间范围内无登录记录）');
        return;
    }

    // 3. 按IP汇总
    const ipMap = new Map();
    for (const row of logs) {
        const ip = row.ip_address || '(空)';
        if (!ipMap.has(ip)) {
            ipMap.set(ip, { ip, count: 0, first: row.login_time, last: row.login_time, devices: new Set() });
        }
        const entry = ipMap.get(ip);
        entry.count++;
        if (row.login_time < entry.first) entry.first = row.login_time;
        if (row.login_time > entry.last) entry.last = row.login_time;
        if (row.device) entry.devices.add(row.device);
    }

    const ipSummary = Array.from(ipMap.values()).sort((a, b) => b.count - a.count).map(e => ({
        ip: e.ip,
        次数: e.count,
        设备数: e.devices.size,
        首次: e.first,
        最近: e.last,
        异常: e.count > 50 ? '🔴 高频' : (ipMap.size > 10 && e.count < 3) ? '🟡 低频/异地' : '✅ 正常',
    }));

    console.log('');
    console.log(`===== IP 汇总（共 ${ipMap.size} 个独立IP，${logs.length} 次登录） =====`);
    console.table(ipSummary);

    // 4. 异常提示
    const highFreqIps = ipSummary.filter(e => e.次数 > 50);
    const suspiciousIps = ipSummary.filter(e => ipMap.size > 10 && e.次数 < 3);
    if (highFreqIps.length > 0) {
        console.log(`\n  🔴 高频IP（>50次）: ${highFreqIps.map(e => e.ip).join(', ')}`);
        console.log('     可能是脚本/机器人 或 长期固定IP（正常用户）');
    }
    if (ipMap.size > 10) {
        console.log(`\n  🟡 该账号使用了 ${ipMap.size} 个不同IP，IP数量偏多，建议排查是否被共享/盗号`);
    }
    if (ipMap.size === 1) {
        console.log(`\n  ✅ 该账号始终使用同一IP，非常正常`);
    }
    if (ipMap.size <= 3) {
        console.log(`\n  ✅ IP数量少（${ipMap.size}个），属正常范围`);
    }

    // 5. 原始明细（最近50条）
    const detail = logs.slice(0, 50).map(r => ({
        time: r.login_time,
        ip: r.ip_address || '(空)',
        device: (r.device || '').substring(0, 30),
        imei: r.imei || '',
    }));
    output('最近 50 条登录明细', detail);
}

// =================================================================
// 命令 9: db-status  数据库全局状态查看
// =================================================================
async function dbStatus() {
    logInfo('查询数据库运行状态');

    // 1. 连接数 / 查询量 / 慢查询
    console.log('');
    console.log('===== 关键状态变量 =====');
    const statusVars = [
        'Threads_connected', 'Threads_running', 'Connections',
        'Slow_queries', 'Questions', 'Uptime',
        'Innodb_row_lock_waits', 'Innodb_row_lock_time_avg',
        'Handler_read_rnd_next',  // 高 = 全表扫描多
        'Select_full_join',        // 无索引 JOIN
    ];
    const statusRows = await q(`SHOW STATUS WHERE Variable_name IN (${statusVars.map(() => '?').join(',')})`, statusVars);
    console.table(statusRows);

    // 2. key 配置变量
    console.log('');
    console.log('===== 内存 / 缓存配置 =====');
    const confVars = [
        'innodb_buffer_pool_size', 'innodb_buffer_pool_instances',
        'query_cache_size', 'tmp_table_size', 'max_heap_table_size',
        'slow_query_log', 'long_query_time', 'max_connections',
    ];
    const confRows = await q(`SHOW VARIABLES WHERE Variable_name IN (${confVars.map(() => '?').join(',')})`, confVars);
    console.table(confRows);

    // 3. 当前 processlist
    console.log('');
    console.log('===== 当前 PROCESSLIST =====');
    const procs = await q('SHOW PROCESSLIST');
    const running = procs.filter(r => r.Command !== 'Sleep');
    console.log(`  活跃连接: ${running.length} / 总连接: ${procs.length}`);
    if (running.length > 0) console.table(running);
    else console.log('  ✅ 暂无运行中的查询');

    // 4. 主要表大小 + 行数估计
    console.log('');
    console.log('===== 主要表大小 =====');
    const tableSizes = await q(`
        SELECT
            table_name                                       AS \`table\`,
            table_rows                                       AS est_rows,
            ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mb,
            ROUND(data_length  / 1024 / 1024, 2)             AS data_mb,
            ROUND(index_length / 1024 / 1024, 2)             AS index_mb
        FROM information_schema.TABLES
        WHERE table_schema = DATABASE()
        ORDER BY (data_length + index_length) DESC
        LIMIT 20
    `);
    console.table(tableSizes);

    // 5. PaymentRecords 具体索引
    console.log('');
    console.log('===== PaymentRecords 索引详情 =====');
    const prIdx = await q('SHOW INDEX FROM PaymentRecords');
    const idxSummary = {};
    for (const r of prIdx) {
        const k = r.Key_name;
        if (!idxSummary[k]) idxSummary[k] = { Key_name: k, Columns: '', Cardinality: '' };
        idxSummary[k].Columns += (idxSummary[k].Columns ? ',' : '') + r.Column_name;
        idxSummary[k].Cardinality = r.Cardinality;
    }
    console.table(Object.values(idxSummary));

    const hasCols = new Set(prIdx.map(r => r.Column_name));
    const mustHave = ['created_at', 'payment_status', 'channel_code', 'user_id'];
    const miss = mustHave.filter(c => !hasCols.has(c));
    if (miss.length) {
        console.log(`\n  ⚠️  建议添加缺失索引 (${miss.join(', ')})`);
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_created (created_at DESC);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_status_created (payment_status, created_at DESC);');
        console.log('  ALTER TABLE PaymentRecords ADD INDEX idx_channel_created (channel_code, created_at DESC);');
    } else {
        console.log('  ✅ 索引配置合理');
    }

    // 6. 慢查询日志是否开启
    console.log('');
    const [slowLog] = await q("SHOW VARIABLES LIKE 'slow_query_log'");
    const [longTime] = await q("SHOW VARIABLES LIKE 'long_query_time'");
    if (slowLog?.Value === 'OFF') {
        console.log('  ⚠️  慢查询日志未开启，建议开启以便排查:');
        console.log('  SET GLOBAL slow_query_log = 1;');
        console.log(`  SET GLOBAL long_query_time = 1;  -- 超过 1s 就记录`);
    } else {
        console.log(`  ✅ 慢查询日志开启，阀值: ${longTime?.Value}s`);
    }
}


function printHelp() {
    console.log(`
安全 & 财务审计工具

命令:
  admin-coins-log         管理员发币 / 操作日志
  admin-orders-reconcile  支付订单 vs 管理员发币流水 对账
  balance-check           玩家余额 vs 支付订单累计变动 校验
  user-trace              单玩家全轨迹（登录 + 余额变动 + 管理员操作）
  item-mail-check         查询某道具ID被发邮件的 gm_operation_logs 记录
  clean-failed-orders     删除 PaymentRecords 中所有非成功订单
  payment-slow-check      对 admin 面板的支付查询做 EXPLAIN+计时分析
  db-status               数据库全局状态（连接、慢查询、processlist、表大小、索引）

通用参数:
  --days=N        最近 N 天，默认 30
  --user=ID       玩家 user_id
  --username=NAME 玩家用户名
  --admin=NAME    管理员名 / 渠道代码
  --threshold=X   余额差异阈值（balance-check），默认 0.01
  --limit=N       输出条数上限，默认 100
  --json          以 JSON 输出（默认表格）
  --verbose       admin-orders-reconcile 显示匹配明细

item-mail-check 参数:
  --item=道具ID   要查询的道具ID（必填）
  --days=N        搜索范围，默认30天

clean-failed-orders 参数:
  --dry-run       默认模式，只预览不删
  --confirm       真实删除（必须显式指定）
  --keep-days=N   保留最近N天的失败订单（默认7天），0=全删

示例:
  node scripts/audit.js admin-coins-log --days=7
  node scripts/audit.js admin-coins-log --admin=channel_abc
  node scripts/audit.js admin-orders-reconcile --days=30 --verbose
  node scripts/audit.js balance-check --user=12345
  node scripts/audit.js balance-check --threshold=1
  node scripts/audit.js user-trace --username=alice --days=30
  node scripts/audit.js login-ip-check --username=ao1shib123 --days=90
  node scripts/audit.js item-mail-check --item=10001 --days=90
  node scripts/audit.js clean-failed-orders
  node scripts/audit.js clean-failed-orders --confirm
  node scripts/audit.js clean-failed-orders --confirm --keep-days=0
  node scripts/audit.js payment-slow-check
  node scripts/audit.js db-status
`);
}

async function main() {
    try {
        switch (cmd) {
            case 'admin-coins-log':
                await adminCoinsLog();
                break;
            case 'admin-orders-reconcile':
                await adminOrdersReconcile();
                break;
            case 'balance-check':
                await balanceCheck();
                break;
            case 'user-trace':
                await userTrace();
                break;
            case 'login-ip-check':
                await loginIpCheck();
                break;
            case 'item-mail-check':
                await itemMailCheck();
                break;
            case 'clean-failed-orders':
                await cleanFailedOrders();
                break;
            case 'payment-slow-check':
                await paymentSlowCheck();
                break;
            case 'db-status':
                await dbStatus();
                break;
            case 'help':
            case '--help':
            case '-h':
            case undefined:
                printHelp();
                break;
            default:
                logError(`未知命令: ${cmd}`);
                printHelp();
                process.exitCode = 1;
        }
    } catch (e) {
        logError(`执行失败: ${e.message}`);
        if (e.stack) console.error(e.stack);
        process.exitCode = 1;
    } finally {
        if (pool) await pool.end();
    }
}

main();
