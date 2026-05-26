#!/usr/bin/env node
/**
 * 统计某一天每个玩家的成功现金充值，并按倍率补发平台币
 *
 * 用法:
 *   1) 仅统计（默认今天）
 *      node cash-recharge-multiplier.js stats --date=2026-02-14 --rate=10
 *
 *   2) 执行补发（必须加 --confirm）
 *      node cash-recharge-multiplier.js compensate --date=2026-02-14 --rate=10 --confirm
 *
 * 说明:
 *   - rate 表示“每 1 元充值补发多少平台币”
 *   - 补发走“玩家发放”逻辑（管理员 id=1 扣减 available_platform_coins）
 *   - 防重复：同一天同倍率同玩家只补发一次
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const COMPENSATE_ADMIN_ID = 1;

const parseArgs = () => {
    const args = process.argv.slice(2);
    const mode = (args[0] || 'stats').toLowerCase(); // stats | compensate
    const options = {
        date: null,
        rate: 10,
        confirm: false
    };

    for (const arg of args.slice(1)) {
        if (arg.startsWith('--date=')) options.date = arg.split('=')[1];
        if (arg.startsWith('--rate=')) options.rate = Number(arg.split('=')[1]);
        if (arg === '--confirm') options.confirm = true;
    }

    return { mode, options };
};

const getTodayCN = () => {
    const now = new Date();
    const cn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const yyyy = cn.getFullYear();
    const mm = String(cn.getMonth() + 1).padStart(2, '0');
    const dd = String(cn.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const validateDate = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

const buildDayRange = (date) => {
    const startTs = `${date} 00:00:00`;
    const endTs = `${date} 23:59:59`;
    return { startTs, endTs };
};

const rateToKey = (rate) => String(rate).replace(/\./g, '_');

const queryCashRechargeByUser = async (conn, startTs, endTs, rate) => {
    const [rows] = await conn.execute(
        `
        SELECT
            u.id AS user_id,
            u.username,
            u.thirdparty_uid,
            u.channel_code,
            u.game_code,
            CAST(u.platform_coins AS DECIMAL(15,2)) AS current_balance,
            CAST(ROUND(SUM(pr.amount), 2) AS DECIMAL(15,2)) AS cash_recharge_amount,
            COUNT(*) AS recharge_records
        FROM paymentrecords pr
        INNER JOIN users u ON u.id = pr.user_id
        WHERE pr.payment_status = 3
          AND pr.created_at >= ?
          AND pr.created_at <= ?
          -- 现金支付方式（避免把平台币内部流水算进来）
          AND (
            pr.payment_way LIKE '%支付宝%' OR
            pr.payment_way LIKE '%微信%' OR
            LOWER(pr.payment_way) LIKE '%alipay%' OR
            LOWER(pr.payment_way) LIKE '%wechat%' OR
            LOWER(pr.payment_way) LIKE 'zfb%' OR
            LOWER(pr.payment_way) LIKE 'wx%'
          )
          -- 充值类型（过滤掉 gift:// 等礼包单）
          AND (
            (pr.server_url LIKE '%cashier%' AND pr.server_url NOT LIKE 'gift://%') OR
            pr.product_name LIKE '%充值%' OR
            pr.product_name LIKE '%平台币%' OR
            LOWER(pr.product_name) LIKE '%ptb%'
          )
        GROUP BY u.id, u.username, u.thirdparty_uid, u.channel_code, u.game_code, u.platform_coins
        HAVING SUM(pr.amount) > 0
        ORDER BY cash_recharge_amount DESC
        `,
        [startTs, endTs]
    );

    return rows.map((r) => {
        const rechargeAmount = Number(r.cash_recharge_amount || 0);
        const bonusCoins = Number((rechargeAmount * rate).toFixed(2));
        return {
            user_id: Number(r.user_id),
            username: r.username || '',
            thirdparty_uid: r.thirdparty_uid || '',
            channel_code: r.channel_code || '',
            game_code: r.game_code || '',
            current_balance: Number(r.current_balance || 0),
            cash_recharge_amount: rechargeAmount,
            recharge_records: Number(r.recharge_records || 0),
            bonus_coins: bonusCoins
        };
    });
};

const writeCsv = (file, rows) => {
    const header = [
        'user_id',
        'username',
        'thirdparty_uid',
        'channel_code',
        'game_code',
        'current_balance',
        'cash_recharge_amount',
        'recharge_records',
        'bonus_coins',
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
            r.cash_recharge_amount ?? '',
            r.recharge_records ?? '',
            r.bonus_coins ?? '',
            r.status || '',
            `"${String(r.message || '').replace(/"/g, '""')}"`
        ];
        lines.push(row.join(','));
    }

    fs.writeFileSync(file, lines.join('\n'), 'utf8');
};

const compensateOne = async (conn, item, markerKey, dayLabel, rate) => {
    const marker = `CASH_MULTI_${markerKey}`;
    const txId = `cash_multi_${markerKey}_${item.user_id}`;
    const remark = `${dayLabel} 现金充值倍率补发(rate=${rate})`;
    const change = Number(item.bonus_coins || 0);

    if (change <= 0) {
        return { status: 'skipped', message: '补发金额为 0，跳过' };
    }

    await conn.beginTransaction();
    try {
        // 防重复
        const [existsRows] = await conn.execute(
            `SELECT id FROM paymentrecords WHERE user_id = ? AND msg = ? LIMIT 1`,
            [item.user_id, marker]
        );
        if (existsRows.length > 0) {
            await conn.rollback();
            return { status: 'skipped', message: '该日期和倍率已补发，跳过' };
        }

        // 锁定管理员
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

        // 锁定用户
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
        const playerBalanceBefore = Number(user.platform_coins || 0);
        const adminBalanceAfter = Number((adminBalanceBefore - change).toFixed(2));
        const playerBalanceAfter = Number((playerBalanceBefore + change).toFixed(2));

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
            [playerBalanceAfter, item.user_id]
        );

        // 发放流水
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
                playerBalanceBefore,
                playerBalanceAfter,
                remark,
                String(admin.channel_code || '')
            ]
        );

        // PaymentRecords 流水（保持余额链）
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
                marker,
                '',
                '',
                user.channel_code || item.channel_code || '',
                user.game_code || item.game_code || '',
                3,
                playerBalanceBefore,
                change,
                playerBalanceAfter
            ]
        );

        await conn.commit();
        return {
            status: 'success',
            message: `补发成功 +${change}，玩家 ${playerBalanceBefore}->${playerBalanceAfter}，管理员 ${adminBalanceBefore}->${adminBalanceAfter}`
        };
    } catch (e) {
        await conn.rollback();
        return { status: 'error', message: e.message || '补发失败' };
    }
};

const run = async () => {
    const { mode, options } = parseArgs();
    const date = options.date || getTodayCN();
    const rate = Number(options.rate || 0);

    if (!validateDate(date)) {
        throw new Error(`日期格式错误: ${date}，应为 YYYY-MM-DD`);
    }
    if (!['stats', 'compensate'].includes(mode)) {
        throw new Error(`未知模式: ${mode}，仅支持 stats / compensate`);
    }
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`倍率错误: ${rate}，rate 必须 > 0`);
    }

    const { startTs, endTs } = buildDayRange(date);
    const markerKey = `${date}_${rateToKey(rate)}`;
    const dayLabel = `${date} 00:00-23:59`;
    const outBase = path.join(process.cwd(), `cash_recharge_multi_${markerKey}`);
    const statsCsv = `${outBase}_stats.csv`;
    const compensateCsv = `${outBase}_compensate.csv`;

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);
        logInfo(`统计日期: ${date}, 倍率: ${rate}`);

        const rows = await queryCashRechargeByUser(conn, startTs, endTs, rate);
        const totalCash = rows.reduce((s, r) => s + Number(r.cash_recharge_amount || 0), 0);
        const totalBonus = rows.reduce((s, r) => s + Number(r.bonus_coins || 0), 0);
        logInfo(`统计完成：共 ${rows.length} 个账号，现金充值总额 ${totalCash.toFixed(2)}，预计补发 ${totalBonus.toFixed(2)} 平台币`);

        if (mode === 'stats') {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })));
            logInfo(`统计CSV已输出: ${statsCsv}`);
            return;
        }

        if (!options.confirm) {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })));
            logWarn(`当前为补发模式，但未带 --confirm，已仅导出统计: ${statsCsv}`);
            return;
        }

        const resultRows = [];
        for (const item of rows) {
            const res = await compensateOne(conn, item, markerKey, dayLabel, rate);
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
        logInfo(`补发完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${errorCount}`);
        logInfo(`补发CSV已输出: ${compensateCsv}`);
    } finally {
        if (conn) await conn.end();
    }
};

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});

