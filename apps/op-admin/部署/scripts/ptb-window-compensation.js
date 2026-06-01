#!/usr/bin/env node
/**
 * 统计并补偿指定时间窗口内的平台币消耗
 *
 * 用法:
 *   1) 仅统计（默认今天 04:00~04:40）
 *      node scripts/ptb-window-compensation.js stats
 *
 *   2) 统计指定日期
 *      node scripts/ptb-window-compensation.js stats --date=2026-02-14
 *
 *   3) 执行补偿（需要显式 --confirm）
 *      node scripts/ptb-window-compensation.js compensate --date=2026-02-14 --confirm
 *
 * 可选参数:
 *   --start=04:00
 *   --end=04:40
 *   --date=YYYY-MM-DD
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const DEFAULT_START = '16:00';
const DEFAULT_END = '16:40';
const COMPENSATE_ADMIN_ID = 1; // 使用 admins.id=1 作为发放账号

const parseArgs = () => {
    const args = process.argv.slice(2);
    const mode = (args[0] || 'stats').toLowerCase(); // stats | compensate
    const options = {
        date: null,
        start: DEFAULT_START,
        end: DEFAULT_END,
        confirm: false
    };

    for (const arg of args.slice(1)) {
        if (arg.startsWith('--date=')) options.date = arg.split('=')[1];
        if (arg.startsWith('--start=')) options.start = arg.split('=')[1];
        if (arg.startsWith('--end=')) options.end = arg.split('=')[1];
        if (arg === '--confirm') options.confirm = true;
    }

    return { mode, options };
};

const getTodayCN = () => {
    const now = new Date();
    // 转北京时间（避免服务器时区干扰）
    const cn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const yyyy = cn.getFullYear();
    const mm = String(cn.getMonth() + 1).padStart(2, '0');
    const dd = String(cn.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const validateDate = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
const validateHm = (hm) => /^\d{2}:\d{2}$/.test(hm);

const buildWindow = (date, start, end) => {
    const startTs = `${date} ${start}:00`;
    const endTs = `${date} ${end}:59`;
    const key = `${date}_${start.replace(':', '')}_${end.replace(':', '')}`;
    return { startTs, endTs, key };
};

const queryWindowSpend = async (conn, startTs, endTs) => {
    const [rows] = await conn.execute(
        `
        SELECT
            u.id AS user_id,
            u.username,
            u.thirdparty_uid,
            u.channel_code,
            u.game_code,
            CAST(u.platform_coins AS DECIMAL(15,2)) AS current_balance,
            CAST(ROUND(SUM(-pr.ptb_change), 2) AS DECIMAL(15,2)) AS spent_coins,
            COUNT(*) AS spend_records
        FROM paymentrecords pr
        INNER JOIN users u ON u.id = pr.user_id
        WHERE pr.payment_status = 3
          AND pr.payment_way LIKE '%平台币%'
          AND pr.ptb_change < 0
          AND pr.created_at >= ?
          AND pr.created_at <= ?
        GROUP BY u.id, u.username, u.thirdparty_uid, u.channel_code, u.game_code, u.platform_coins
        HAVING SUM(-pr.ptb_change) > 0
        ORDER BY spent_coins DESC
        `,
        [startTs, endTs]
    );

    return rows.map((r) => ({
        user_id: Number(r.user_id),
        username: r.username || '',
        thirdparty_uid: r.thirdparty_uid || '',
        channel_code: r.channel_code || '',
        game_code: r.game_code || '',
        current_balance: Number(r.current_balance || 0),
        spent_coins: Number(r.spent_coins || 0),
        spend_records: Number(r.spend_records || 0)
    }));
};

const queryWindowSpendRaw = async (conn, startTs, endTs) => {
    const [rows] = await conn.execute(
        `
        SELECT
            pr.id AS payment_record_id,
            pr.created_at,
            pr.user_id,
            u.username,
            u.thirdparty_uid,
            u.channel_code,
            u.game_code,
            CAST(pr.ptb_before AS DECIMAL(15,2)) AS ptb_before,
            CAST(pr.ptb_change AS DECIMAL(15,2)) AS ptb_change,
            CAST(pr.ptb_after AS DECIMAL(15,2)) AS ptb_after,
            pr.transaction_id,
            pr.product_name,
            pr.msg
        FROM paymentrecords pr
        INNER JOIN users u ON u.id = pr.user_id
        WHERE pr.payment_status = 3
          AND pr.payment_way LIKE '%平台币%'
          AND pr.ptb_change < 0
          AND pr.created_at >= ?
          AND pr.created_at <= ?
        ORDER BY pr.created_at ASC, pr.id ASC
        `,
        [startTs, endTs]
    );
    return rows.map((r) => ({
        payment_record_id: Number(r.payment_record_id),
        created_at: r.created_at,
        user_id: Number(r.user_id),
        username: r.username || '',
        thirdparty_uid: r.thirdparty_uid || '',
        channel_code: r.channel_code || '',
        game_code: r.game_code || '',
        ptb_before: Number(r.ptb_before || 0),
        ptb_change: Number(r.ptb_change || 0),
        ptb_after: Number(r.ptb_after || 0),
        spent_coins: Number((-1 * Number(r.ptb_change || 0)).toFixed(2)),
        transaction_id: r.transaction_id || '',
        product_name: r.product_name || '',
        msg: r.msg || ''
    }));
};

const writeCsv = (file, rows) => {
    const header = [
        'user_id',
        'username',
        'thirdparty_uid',
        'channel_code',
        'game_code',
        'current_balance',
        'spent_coins',
        'spend_records',
        'status',
        'message'
    ];
    const lines = [header.join(',')];

    for (const r of rows) {
        const row = [
            r.user_id,
            `"${String(r.username || '').replace(/"/g, '""')}"`,
            `"${String(r.thirdparty_uid || '').replace(/"/g, '""')}"`,
            `"${String(r.channel_code || '').replace(/"/g, '""')}"`,
            `"${String(r.game_code || '').replace(/"/g, '""')}"`,
            r.current_balance ?? '',
            r.spent_coins ?? '',
            r.spend_records ?? '',
            r.status || '',
            `"${String(r.message || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
};

const writeRawCsv = (file, rows) => {
    const header = [
        'payment_record_id',
        'created_at',
        'user_id',
        'username',
        'thirdparty_uid',
        'channel_code',
        'game_code',
        'ptb_before',
        'ptb_change',
        'ptb_after',
        'spent_coins',
        'transaction_id',
        'product_name',
        'msg'
    ];
    const lines = [header.join(',')];

    for (const r of rows) {
        const row = [
            r.payment_record_id,
            `"${String(r.created_at || '').replace(/"/g, '""')}"`,
            r.user_id,
            `"${String(r.username || '').replace(/"/g, '""')}"`,
            `"${String(r.thirdparty_uid || '').replace(/"/g, '""')}"`,
            `"${String(r.channel_code || '').replace(/"/g, '""')}"`,
            `"${String(r.game_code || '').replace(/"/g, '""')}"`,
            r.ptb_before,
            r.ptb_change,
            r.ptb_after,
            r.spent_coins,
            `"${String(r.transaction_id || '').replace(/"/g, '""')}"`,
            `"${String(r.product_name || '').replace(/"/g, '""')}"`,
            `"${String(r.msg || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
};

const compensateOne = async (conn, item, windowKey, windowLabel) => {
    const marker = `PTB_COMP_${windowKey}`;
    const txId = `ptb_comp_${windowKey}_${item.user_id}`;
    const remark = `${windowLabel} 平台币消耗补偿`;

    await conn.beginTransaction();
    try {
        // 防重复：同一窗口同一用户只补偿一次
        const [existsRows] = await conn.execute(
            `SELECT id FROM paymentrecords WHERE user_id = ? AND msg = ? LIMIT 1`,
            [item.user_id, marker]
        );
        if (existsRows.length > 0) {
            await conn.rollback();
            return { status: 'skipped', message: '该窗口已补偿，已跳过' };
        }

        // 锁定发放管理员（按 id=1）
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

        // 锁定用户余额
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
        const adminBalanceBefore = Number(admin.available_platform_coins || 0);
        const before = Number(user.platform_coins || 0);
        const change = Number(item.spent_coins || 0);
        const after = Number((before + change).toFixed(2));
        const adminBalanceAfter = Number((adminBalanceBefore - change).toFixed(2));

        // 与“玩家发放”逻辑一致：发放时扣减管理员可用平台币，余额不足则失败
        if (adminBalanceBefore < change) {
            await conn.rollback();
            return {
                status: 'error',
                message: `管理员余额不足：需要 ${change}，当前 ${adminBalanceBefore}`
            };
        }

        await conn.execute(
            `UPDATE admins SET available_platform_coins = ? WHERE id = ?`,
            [adminBalanceAfter, COMPENSATE_ADMIN_ID]
        );

        await conn.execute(
            `UPDATE users SET platform_coins = ? WHERE id = ?`,
            [after, item.user_id]
        );

        // 记录代理给玩家发放流水（与平台币发放逻辑保持一致）
        await conn.execute(
            `INSERT INTO admintoplayerplatformcointransactions
             (admin_channel_code, admin_name, user_thirdparty_uid, user_channel_code, game_code,
              amount, admin_balance_before, admin_balance_after, player_balance_before, player_balance_after,
              remark, operator_channel_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                String(admin.channel_code || ''),
                String(admin.name || ''),
                String(user.thirdparty_uid || item.thirdparty_uid || ''),
                String(user.channel_code || item.channel_code || ''),
                String(user.game_code || item.game_code || ''),
                change,
                adminBalanceBefore,
                adminBalanceAfter,
                before,
                after,
                remark,
                String(admin.channel_code || '')
            ]
        );

        await conn.execute(
            `INSERT INTO paymentrecords
            (user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, payment_id, world_id,
             product_name, product_des, ip, amount, mch_order_id, msg, server_url, device, channel_code, game_code,
             payment_status, ptb_before, ptb_change, ptb_after)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.user_id,
                null,
                '',
                txId,
                String(item.thirdparty_uid || '0'),
                '平台币',
                0,
                1,
                '管理员发放',
                remark,
                '',
                change,
                txId,
                `${marker};操作人:${admin.channel_code || `admin_${COMPENSATE_ADMIN_ID}`}`,
                '',
                '',
                user.channel_code || item.channel_code || '',
                user.game_code || item.game_code || '',
                3,
                before,
                change,
                after
            ]
        );

        await conn.commit();
        return {
            status: 'success',
            message: `补偿成功 +${change}，玩家 ${before}->${after}，管理员 ${adminBalanceBefore}->${adminBalanceAfter}`
        };
    } catch (e) {
        await conn.rollback();
        return { status: 'error', message: e.message || '补偿失败' };
    }
};

const run = async () => {
    const { mode, options } = parseArgs();
    const date = options.date || getTodayCN();
    const start = options.start || DEFAULT_START;
    const end = options.end || DEFAULT_END;

    if (!validateDate(date)) {
        throw new Error(`日期格式错误: ${date}，应为 YYYY-MM-DD`);
    }
    if (!validateHm(start) || !validateHm(end)) {
        throw new Error(`时间格式错误: start=${start}, end=${end}，应为 HH:mm`);
    }
    if (!['stats', 'compensate'].includes(mode)) {
        throw new Error(`未知模式: ${mode}，仅支持 stats / compensate`);
    }

    const { startTs, endTs, key } = buildWindow(date, start, end);
    const windowLabel = `${date} ${start}-${end}`;
    const outBase = path.join(process.cwd(), `ptb_window_${key}`);
    const statsCsv = `${outBase}_stats.csv`;
    const rawCsv = `${outBase}_records.csv`;
    const compensateCsv = `${outBase}_compensate.csv`;

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);
        logInfo(`窗口: ${windowLabel}`);

        const rows = await queryWindowSpend(conn, startTs, endTs);
        const rawRows = await queryWindowSpendRaw(conn, startTs, endTs);
        const totalSpent = rows.reduce((s, r) => s + Number(r.spent_coins || 0), 0);
        logInfo(`统计完成：共 ${rows.length} 个账号（明细 ${rawRows.length} 条），平台币总消耗 ${totalSpent.toFixed(2)}`);
        writeRawCsv(rawCsv, rawRows);
        logInfo(`明细CSV已输出(不分账号): ${rawCsv}`);

        if (mode === 'stats') {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })));
            logInfo(`统计CSV已输出: ${statsCsv}`);
            return;
        }

        if (!options.confirm) {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })));
            logWarn(`当前为补偿模式，但未带 --confirm，已仅导出统计: ${statsCsv}`);
            return;
        }

        const resultRows = [];
        for (const item of rows) {
            const res = await compensateOne(conn, item, key, windowLabel);
            resultRows.push({
                ...item,
                status: res.status,
                message: res.message
            });
            logInfo(`user_id=${item.user_id} ${res.status}: ${res.message}`);
        }

        const successCount = resultRows.filter((r) => r.status === 'success').length;
        const skippedCount = resultRows.filter((r) => r.status === 'skipped').length;
        const errorCount = resultRows.filter((r) => r.status === 'error').length;
        writeCsv(compensateCsv, resultRows);
        logInfo(`补偿完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${errorCount}`);
        logInfo(`补偿CSV已输出: ${compensateCsv}`);
    } finally {
        if (conn) await conn.end();
    }
};

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});

