#!/usr/bin/env node
/**
 * 按玩家现金充值总额，以 1:18 比例返还平台币
 *
 * 逻辑：
 *   统计每个用户在 paymentrecords 中 payment_status=3（成功订单）
 *   且 payment_way IN ('wx','zfb', ...)（只统计真实现金支付方式）
 *   的 amount 累加，即为「真实现金充值总额」
 *   返还平台币 = 充值总额 × 18
 *
 * 用法:
 *   1) 仅统计，导出 CSV 供人工审核（不执行发放）
 *      node recharge-to-ptb-compensation.js stats
 *      node recharge-to-ptb-compensation.js stats --from=2025-08-01 --to=2025-10-31
 *
 *   2) 执行发放（需显式 --confirm）
 *      node recharge-to-ptb-compensation.js compensate --confirm
 *      node recharge-to-ptb-compensation.js compensate --from=2025-08-01 --to=2025-10-31 --confirm
 *
 * 可选参数:
 *   --from=YYYY-MM-DD   充值记录起始日（含当天 00:00:00，北京时间）
 *   --to=YYYY-MM-DD     充值记录结束日（含当天 23:59:59，北京时间）
 *                        不指定则统计全部历史
 *   --ratio=18           现金 → 平台币 比例（默认 18）
 *   --min-recharge=0     最低充值门槛，低于此值的用户跳过（默认 0 = 不限制）
 *   --confirm            真正执行发放，不带此参数仅导出 CSV
 *   --excel-bom          CSV 带 UTF-8 BOM（Excel 打开中文更友好）
 *
 * 环境变量（优先级高于 config.js 默认值）:
 *   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *
 * 执行示例:
 *   DB_HOST=103.85.188.218 node recharge-to-ptb-compensation.js stats --from=2025-08-26 --to=2025-10-31 --excel-bom
 *   DB_HOST=103.85.188.218 node recharge-to-ptb-compensation.js compensate --from=2025-08-26 --to=2025-10-31 --confirm
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ── 常量 ──────────────────────────────────────────────────────────────────
const DEFAULT_RATIO = 18;                // 1元 → 18 平台币
const COMPENSATE_ADMIN_ID = 1;           // 发放用的管理员 id（需有足够 available_platform_coins）

/**
 * 只统计这些 payment_way 的订单（真实现金支付）
 * 值对应 paymentrecords.payment_way 实际存储的中文内容：
 *   微信  → 微信支付
 *   支付宝 → 支付宝
 *   Steam  → Steam 充值
 * 如果将来新增其他渠道，直接在此数组追加即可
 */
const CASH_WAYS = ['微信', '支付宝', 'Steam'];

// ── 参数解析 ──────────────────────────────────────────────────────────────
const parseArgs = () => {
    const args = process.argv.slice(2);
    const mode = (args[0] || 'stats').toLowerCase();

    const opts = {
        from: null,
        to: null,
        ratio: DEFAULT_RATIO,
        minRecharge: 0,
        confirm: false,
        excelBom: process.env.PTB_CSV_EXCEL_BOM === '1',
    };

    for (const arg of args.slice(1)) {
        if (arg.startsWith('--from='))          opts.from        = arg.split('=')[1];
        if (arg.startsWith('--to='))            opts.to          = arg.split('=')[1];
        if (arg.startsWith('--ratio='))         opts.ratio       = Number(arg.split('=')[1]) || DEFAULT_RATIO;
        if (arg.startsWith('--min-recharge='))  opts.minRecharge = Number(arg.split('=')[1]) || 0;
        if (arg === '--confirm')                opts.confirm     = true;
        if (arg === '--excel-bom')              opts.excelBom    = true;
    }

    return { mode, opts };
};

const validateDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const buildDateBounds = (fromStr, toStr) => {
    let startTs = null, endTs = null;
    if (fromStr) {
        if (!validateDate(fromStr)) throw new Error(`--from 格式错误: ${fromStr}`);
        startTs = `${fromStr} 00:00:00`;
    }
    if (toStr) {
        if (!validateDate(toStr)) throw new Error(`--to 格式错误: ${toStr}`);
        endTs = `${toStr} 23:59:59`;
    }
    if (startTs && endTs && startTs > endTs) throw new Error('日期范围无效: from > to');
    return { startTs, endTs };
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const dateTag = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// ── CSV 工具 ───────────────────────────────────────────────────────────────
const csvText   = (s)  => `"${String(s ?? '').replace(/"/g, '""').trim()}"`;
const csvMoney  = (v)  => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00'; };
const csvInt    = (v)  => { if (typeof v === 'bigint') return String(v); const n = Number(v); return Number.isFinite(n) ? String(Math.trunc(n)) : '0'; };
const writeCsvFile = (file, lines, withBom = false) => {
    const body   = lines.join('\r\n');
    const prefix = withBom ? '\uFEFF' : '';
    fs.writeFileSync(file, `${prefix}${body}`, 'utf8');
};

// ── 查询：按用户汇总现金充值 ───────────────────────────────────────────────
const queryRechargeStats = async (conn, startTs, endTs) => {
    const where  = [`pr.payment_status = 3`];
    const params = [];

    // 只统计真实现金支付方式（白名单 IN），不依赖排除逻辑
    const placeholders = CASH_WAYS.map(() => '?').join(', ');
    where.push(`pr.payment_way IN (${placeholders})`);
    params.push(...CASH_WAYS);

    // 金额必须 > 0
    where.push(`pr.amount > 0`);

    if (startTs) { where.push('pr.created_at >= ?'); params.push(startTs); }
    if (endTs)   { where.push('pr.created_at <= ?'); params.push(endTs);   }

    const [rows] = await conn.execute(
        `SELECT
            u.id                                          AS user_id,
            u.username,
            u.thirdparty_uid,
            u.channel_code,
            u.game_code,
            CAST(u.platform_coins AS DECIMAL(15,2))       AS current_balance,
            CAST(ROUND(SUM(pr.amount), 2) AS DECIMAL(15,2)) AS total_recharge,
            COUNT(*)                                       AS recharge_times
         FROM paymentrecords pr
         INNER JOIN users u ON u.id = pr.user_id
         WHERE ${where.join(' AND ')}
         GROUP BY u.id, u.username, u.thirdparty_uid, u.channel_code, u.game_code, u.platform_coins
         HAVING SUM(pr.amount) > 0
         ORDER BY total_recharge DESC`,
        params
    );

    return rows.map((r) => ({
        user_id:         Number(r.user_id),
        username:        r.username        || '',
        thirdparty_uid:  r.thirdparty_uid  || '',
        channel_code:    r.channel_code    || '',
        game_code:       r.game_code       || '',
        current_balance: Number(r.current_balance || 0),
        total_recharge:  Number(r.total_recharge  || 0),
        recharge_times:  Number(r.recharge_times  || 0),
    }));
};

// ── 写统计 CSV ─────────────────────────────────────────────────────────────
const writeStatsCsv = (file, rows, ratio, withBom = false) => {
    const header = [
        'user_id', 'username', 'thirdparty_uid', 'channel_code', 'game_code',
        'current_balance', 'total_recharge', 'ratio', 'grant_coins',
        'recharge_times', 'status', 'message',
    ];
    const lines = [header.join(',')];

    for (const r of rows) {
        const grant = round2(r.total_recharge * ratio);
        lines.push([
            csvInt(r.user_id),
            csvText(r.username),
            csvText(r.thirdparty_uid),
            csvText(r.channel_code),
            csvText(r.game_code),
            csvMoney(r.current_balance),
            csvMoney(r.total_recharge),
            String(ratio),
            csvMoney(grant),
            csvInt(r.recharge_times),
            csvText(r.status   ?? ''),
            csvText(r.message  ?? ''),
        ].join(','));
    }

    writeCsvFile(file, lines, withBom);
};

// ── 单用户发放（带事务防重）──────────────────────────────────────────────────
const compensateOne = async (conn, item, runKey, ratio) => {
    const grant  = round2(item.total_recharge * ratio);
    if (grant <= 0) return { status: 'skipped', message: '应发金额为 0，跳过' };

    const marker = `RECHARGE_PTB_${runKey}`;
    const txId   = `rch_ptb_${runKey}_u${item.user_id}`.slice(0, 100);
    const remark = `现金充值 ${item.total_recharge} 元 ×${ratio} 返还平台币`;

    await conn.beginTransaction();
    try {
        // 防重复：检查同 runKey 是否已发过
        const [dup] = await conn.execute(
            `SELECT id FROM paymentrecords WHERE user_id = ? AND msg LIKE ? LIMIT 1`,
            [item.user_id, `${marker};%`]
        );
        if (dup.length > 0) {
            await conn.rollback();
            return { status: 'skipped', message: '该批次已发放（防重复），跳过' };
        }

        // 锁管理员行
        const [adminRows] = await conn.execute(
            `SELECT id, name, channel_code, available_platform_coins
             FROM admins WHERE id = ? LIMIT 1 FOR UPDATE`,
            [COMPENSATE_ADMIN_ID]
        );
        if (!adminRows.length) {
            await conn.rollback();
            return { status: 'error', message: `未找到发放管理员 id=${COMPENSATE_ADMIN_ID}` };
        }
        const admin = adminRows[0];

        // 锁用户行
        const [userRows] = await conn.execute(
            `SELECT id, platform_coins, channel_code, game_code, thirdparty_uid
             FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
            [item.user_id]
        );
        if (!userRows.length) {
            await conn.rollback();
            return { status: 'error', message: '用户不存在' };
        }
        const user = userRows[0];

        const adminBefore = Number(admin.available_platform_coins || 0);
        const userBefore  = Number(user.platform_coins || 0);
        const adminAfter  = round2(adminBefore - grant);
        const userAfter   = round2(userBefore  + grant);

        if (adminBefore < grant) {
            await conn.rollback();
            return { status: 'error', message: `管理员余额不足：需 ${grant}，当前 ${adminBefore}` };
        }

        // 更新管理员余额
        await conn.execute(
            `UPDATE admins SET available_platform_coins = ? WHERE id = ?`,
            [adminAfter, COMPENSATE_ADMIN_ID]
        );

        // 更新用户余额
        await conn.execute(
            `UPDATE users SET platform_coins = ? WHERE id = ?`,
            [userAfter, item.user_id]
        );

        // 写平台币流水
        await conn.execute(
            `INSERT INTO admintoplayerplatformcointransactions
             (admin_channel_code, admin_name, user_thirdparty_uid, user_channel_code, game_code,
              amount, admin_balance_before, admin_balance_after,
              player_balance_before, player_balance_after, remark, operator_channel_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(admin.channel_code    || ''),
                String(admin.name            || ''),
                String(user.thirdparty_uid   || item.thirdparty_uid || ''),
                String(user.channel_code     || item.channel_code   || ''),
                String(user.game_code        || item.game_code      || ''),
                grant,
                adminBefore, adminAfter,
                userBefore,  userAfter,
                remark,
                String(admin.channel_code || ''),
            ]
        );

        // 写支付记录（便于审计 & 防重）
        const msgFull = `${marker};充值${item.total_recharge}×${ratio};操作人:admin_${COMPENSATE_ADMIN_ID}`;
        await conn.execute(
            `INSERT INTO paymentrecords
             (user_id, sub_user_id, role_id, transaction_id, wuid,
              payment_way, payment_id, world_id,
              product_name, product_des, ip, amount,
              mch_order_id, msg, server_url, device,
              channel_code, game_code, payment_status,
              ptb_before, ptb_change, ptb_after)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.user_id,
                null,
                '',
                txId,
                String(item.thirdparty_uid || '0'),
                '平台币',          // payment_way
                0,                  // payment_id
                1,                  // world_id
                '充值返平台币',
                remark,
                '',                 // ip
                grant,              // amount
                txId,               // mch_order_id
                msgFull,
                '', '',             // server_url / device
                user.channel_code || item.channel_code || '',
                user.game_code    || item.game_code    || '',
                3,                  // payment_status = 成功
                userBefore,
                grant,
                userAfter,
            ]
        );

        await conn.commit();
        return {
            status:  'success',
            message: `发放成功 +${grant}（充值 ${item.total_recharge}×${ratio}），余额 ${userBefore} → ${userAfter}`,
        };
    } catch (e) {
        await conn.rollback();
        return { status: 'error', message: e.message || '发放异常' };
    }
};

// ── 主流程 ────────────────────────────────────────────────────────────────
const run = async () => {
    const { mode, opts } = parseArgs();

    if (!['stats', 'compensate'].includes(mode)) {
        throw new Error(`未知模式: ${mode}，支持 stats / compensate`);
    }
    if (!Number.isFinite(opts.ratio) || opts.ratio <= 0) {
        throw new Error(`--ratio 无效: ${opts.ratio}`);
    }

    const { startTs, endTs } = buildDateBounds(opts.from, opts.to);

    const timePart = startTs && endTs
        ? `${startTs} ~ ${endTs}`
        : startTs ? `>= ${startTs}` : endTs ? `<= ${endTs}` : '全历史';

    const tag    = `r${String(opts.ratio).replace('.', 'p')}_${dateTag()}`;
    const outDir = process.cwd();
    const statsCsv      = path.join(outDir, `recharge_ptb_${tag}_stats.csv`);
    const compensateCsv = path.join(outDir, `recharge_ptb_${tag}_grant.csv`);

    if (!startTs && !endTs) {
        logWarn('未指定 --from/--to，将统计全部历史现金充值记录。');
    }

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接数据库 ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
        logInfo(`时间范围: ${timePart} | 比例: 1 元 = ${opts.ratio} 平台币 | 最低门槛: ${opts.minRecharge} 元`);

        // 1. 统计
        let rows = await queryRechargeStats(conn, startTs, endTs);

        // 2. 最低门槛过滤
        if (opts.minRecharge > 0) {
            const before = rows.length;
            rows = rows.filter((r) => r.total_recharge >= opts.minRecharge);
            logInfo(`门槛过滤：${before} → ${rows.length} 个用户（最低充值 ${opts.minRecharge} 元）`);
        }

        const totalRecharge = rows.reduce((s, r) => s + r.total_recharge, 0);
        const totalGrant    = round2(totalRecharge * opts.ratio);
        logInfo(`统计完成：${rows.length} 个用户，现金充值合计 ${totalRecharge.toFixed(2)} 元，应返平台币 ${totalGrant.toFixed(2)}`);

        // 3. stats 模式 → 仅导出 CSV
        if (mode === 'stats') {
            writeStatsCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })), opts.ratio, opts.excelBom);
            logInfo(`统计 CSV 已导出: ${statsCsv}`);
            logInfo('如无问题，加 --confirm 参数再次运行以执行发放。');
            return;
        }

        // 4. compensate 模式
        if (!opts.confirm) {
            writeStatsCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })), opts.ratio, opts.excelBom);
            logWarn(`compensate 模式未带 --confirm，仅导出预览 CSV: ${statsCsv}`);
            return;
        }

        logInfo(`开始逐用户发放（共 ${rows.length} 人）...`);
        const runKey    = `r${String(opts.ratio).replace('.', 'p')}_${startTs ? opts.from : 'all'}_${endTs ? opts.to : 'all'}`;
        const results   = [];

        for (const item of rows) {
            const res = await compensateOne(conn, item, runKey, opts.ratio);
            results.push({ ...item, status: res.status, message: res.message });
            logInfo(`user_id=${item.user_id}(${item.username}) ${res.status}: ${res.message}`);
        }

        const ok      = results.filter((r) => r.status === 'success').length;
        const skipped = results.filter((r) => r.status === 'skipped').length;
        const errors  = results.filter((r) => r.status === 'error').length;

        writeStatsCsv(compensateCsv, results, opts.ratio, opts.excelBom);
        logInfo(`发放结束：✓ 成功 ${ok}，⚡ 跳过 ${skipped}，✗ 失败 ${errors}`);
        logInfo(`结果 CSV: ${compensateCsv}`);

    } finally {
        if (conn) await conn.end();
    }
};

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});
