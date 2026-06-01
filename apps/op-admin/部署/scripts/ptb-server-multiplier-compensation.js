#!/usr/bin/env node
/**
 * 按指定区服（world_id）统计用户平台币消费总额，人工审核 CSV 后，按消费额的倍数返还平台币（默认 7 服 ×1.3）
 *
 * 用法:
 *   1) 仅统计（导出 CSV 供人工审核）
 *      node scripts/ptb-server-multiplier-compensation.js stats
 *      node scripts/ptb-server-multiplier-compensation.js stats --world-id=7 --from=2026-01-01 --to=2026-04-11
 *
 *   2) 执行发放（需显式 --confirm，倍数默认 1.3）
 *      node ptb-server-multiplier-compensation.js compensate --world-id=100007 --from=2026-01-01 --to=2026-04-11 --confirm
 *
 * 可选参数:
 *   --world-id=N        区服 ID，对应 PaymentRecords.world_id（默认 7）
 *   --multiplier=1.3    返还倍数（默认 1.3）
 *   --from=YYYY-MM-DD   消费记录起始日（含当天 00:00:00，北京时间）
 *   --to=YYYY-MM-DD     消费记录结束日（含当天 23:59:59，北京时间）
 *   若不指定 from/to，则统计该区服全部历史消费（会打 WARN）
 *
 *   --excel-bom          CSV 带 UTF-8 BOM（Excel 打开更友好）；默认不带 BOM，Linux cat 首列无 ﻿ 乱符
 *   环境变量 PTB_CSV_EXCEL_BOM=1 等同 --excel-bom
 *
 *   --all-worlds         不按 PaymentRecords.world_id 过滤（很多业务里扣款流水 world_id 恒为 1，与游戏「几服」无关）
 *   --world-id=any       同上
 *   --payment-status=3   仅统计 payment_status=3（默认，与后台「成功订单」一致）
 *   --payment-status=23  统计 IN (2,3)：含礼包等「处理中+成功」，避免一直卡在 2 导致导不出
 *   --payment-status=any 仅按 ptb_change<0 统计，不限制状态（慎用，可能含异常单）
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const DEFAULT_WORLD_ID = 7;
const DEFAULT_MULTIPLIER = 1.3;
const COMPENSATE_ADMIN_ID = 1;

const parseArgs = () => {
    const args = process.argv.slice(2);
    const mode = (args[0] || 'stats').toLowerCase();
    const options = {
        worldId: DEFAULT_WORLD_ID,
        allWorlds: false,
        paymentStatusMode: '3',
        multiplier: DEFAULT_MULTIPLIER,
        from: null,
        to: null,
        confirm: false,
        excelBom: process.env.PTB_CSV_EXCEL_BOM === '1'
    };

    for (const arg of args.slice(1)) {
        if (arg.startsWith('--world-id=')) {
            const raw = arg.split('=')[1] || '';
            if (raw === 'any' || raw === '*') {
                options.allWorlds = true;
            } else {
                const n = Number(raw);
                options.worldId = Number.isFinite(n) ? n : DEFAULT_WORLD_ID;
            }
        }
        if (arg.startsWith('--multiplier=')) options.multiplier = Number(arg.split('=')[1]) || DEFAULT_MULTIPLIER;
        if (arg.startsWith('--from=')) options.from = arg.split('=')[1];
        if (arg.startsWith('--to=')) options.to = arg.split('=')[1];
        if (arg.startsWith('--payment-status=')) options.paymentStatusMode = (arg.split('=')[1] || '3').trim();
        if (arg === '--confirm') options.confirm = true;
        if (arg === '--excel-bom') options.excelBom = true;
        if (arg === '--all-worlds') options.allWorlds = true;
    }

    return { mode, options };
};

const validateDate = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

/** 北京时间当日边界，用于 SQL */
const buildDateBounds = (fromStr, toStr) => {
    let startTs = null;
    let endTs = null;
    if (fromStr) {
        if (!validateDate(fromStr)) throw new Error(`--from 格式错误: ${fromStr}`);
        startTs = `${fromStr} 00:00:00`;
    }
    if (toStr) {
        if (!validateDate(toStr)) throw new Error(`--to 格式错误: ${toStr}`);
        endTs = `${toStr} 23:59:59`;
    }
    if (startTs && endTs && startTs > endTs) {
        throw new Error(`日期范围无效: from > to`);
    }
    return { startTs, endTs };
};

/** 用于文件名与防重复标记：仅 [A-Za-z0-9_.-]，无空格冒号，避免 Linux/Shell 下难处理 */
const buildRangeSegment = (fromStr, toStr, startTs, endTs) => {
    if (!startTs && !endTs) return 'all';
    if (fromStr && toStr && validateDate(fromStr) && validateDate(toStr)) {
        return `${fromStr.replace(/-/g, '')}_${toStr.replace(/-/g, '')}`;
    }
    const L = startTs ? startTs.replace(/[-:\s]/g, '').slice(0, 14) : 'open';
    const R = endTs ? endTs.replace(/[-:\s]/g, '').slice(0, 14) : 'open';
    return `${L}_${R}`;
};

const statusTagForFile = (paymentStatusMode) => {
    const st = String(paymentStatusMode || '3').toLowerCase();
    if (st === 'any' || st === 'all') return 'stany';
    if (st === '23' || st === '2,3' || st === '2-3') return 'st23';
    return 'st3';
};

const buildRunKey = (worldId, multiplier, fromStr, toStr, startTs, endTs, allWorlds, paymentStatusMode) => {
    const m = String(multiplier).replace('.', 'p');
    const range = buildRangeSegment(fromStr, toStr, startTs, endTs);
    const wseg = allWorlds ? 'allworld' : `w${worldId}`;
    const st = statusTagForFile(paymentStatusMode);
    return `${wseg}_x${m}_${range}_${st}`;
};

/** 与业务一致：平台币扣款 + 可选区服 + 可选订单状态（默认仅成功=3） */
const buildPtbSpendFilters = (filterByWorld, worldId, startTs, endTs, paymentStatusMode) => {
    const where = [];
    const params = [];

    const st = String(paymentStatusMode || '3').toLowerCase();
    if (st === 'any' || st === 'all') {
        /* 只信 ptb_change */
    } else if (st === '23' || st === '2,3' || st === '2-3') {
        where.push('pr.payment_status IN (2, 3)');
    } else {
        where.push('pr.payment_status = 3');
    }

    where.push('pr.payment_way LIKE ?');
    params.push('%平台币%');
    where.push('pr.ptb_change < 0');

    if (filterByWorld) {
        where.push('pr.world_id = ?');
        params.push(worldId);
    }
    if (startTs) {
        where.push('pr.created_at >= ?');
        params.push(startTs);
    }
    if (endTs) {
        where.push('pr.created_at <= ?');
        params.push(endTs);
    }

    return { whereSql: where.join(' AND '), params };
};

/** CSV：CRLF、去空白、金额两位小数；BOM 由 --excel-bom 控制（默认无 BOM，便于 cat） */
const csvText = (s) => `"${String(s ?? '').replace(/"/g, '""').trim()}"`;

const csvMoney = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

const csvInt = (v) => {
    if (typeof v === 'bigint') return String(v);
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.trunc(n)) : '0';
};

/** 明细表时间：多数情况下为字符串；若为 Date 则按本地时间格式化，避免单元格空白或乱码 */
const csvDateTime = (v) => {
    if (v == null || v === '') return csvText('');
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        const pad = (x) => String(x).padStart(2, '0');
        return csvText(
            `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
        );
    }
    return csvText(String(v).trim());
};

const writeCsvUtf8 = (file, lines, withBom = false) => {
    const body = lines.join('\r\n');
    const prefix = withBom ? '\uFEFF' : '';
    fs.writeFileSync(file, `${prefix}${body}`, 'utf8');
};

const queryServerSpend = async (conn, filterByWorld, worldId, startTs, endTs, paymentStatusMode) => {
    const { whereSql, params } = buildPtbSpendFilters(filterByWorld, worldId, startTs, endTs, paymentStatusMode);

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
        WHERE ${whereSql}
        GROUP BY u.id, u.username, u.thirdparty_uid, u.channel_code, u.game_code, u.platform_coins
        HAVING SUM(-pr.ptb_change) > 0
        ORDER BY spent_coins DESC
        `,
        params
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

const queryServerSpendRaw = async (conn, filterByWorld, worldId, startTs, endTs, paymentStatusMode) => {
    const { whereSql, params } = buildPtbSpendFilters(filterByWorld, worldId, startTs, endTs, paymentStatusMode);

    const [rows] = await conn.execute(
        `
        SELECT
            pr.id AS payment_record_id,
            pr.created_at,
            pr.world_id,
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
        WHERE ${whereSql}
        ORDER BY pr.created_at ASC, pr.id ASC
        `,
        params
    );
    return rows.map((r) => ({
        payment_record_id: Number(r.payment_record_id),
        created_at: r.created_at,
        world_id: Number(r.world_id || 0),
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

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const writeCsv = (file, rows, multiplier, withBom = false) => {
    const header = [
        'user_id',
        'username',
        'thirdparty_uid',
        'channel_code',
        'game_code',
        'current_balance',
        'spent_coins',
        'multiplier',
        'grant_coins',
        'spend_records',
        'status',
        'message'
    ];
    const lines = [header.join(',')];

    for (const r of rows) {
        const spent = Number(r.spent_coins || 0);
        const grant = round2(spent * multiplier);
        const row = [
            csvInt(r.user_id),
            csvText(r.username),
            csvText(r.thirdparty_uid),
            csvText(r.channel_code),
            csvText(r.game_code),
            csvMoney(r.current_balance),
            csvMoney(r.spent_coins),
            String(multiplier),
            csvMoney(grant),
            csvInt(r.spend_records),
            csvText(r.status),
            csvText(r.message)
        ];
        lines.push(row.join(','));
    }

    writeCsvUtf8(file, lines, withBom);
};

const writeRawCsv = (file, rows, withBom = false) => {
    const header = [
        'payment_record_id',
        'created_at',
        'world_id',
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
            csvInt(r.payment_record_id),
            csvDateTime(r.created_at),
            csvInt(r.world_id),
            csvInt(r.user_id),
            csvText(r.username),
            csvText(r.thirdparty_uid),
            csvText(r.channel_code),
            csvText(r.game_code),
            csvMoney(r.ptb_before),
            csvMoney(r.ptb_change),
            csvMoney(r.ptb_after),
            csvMoney(r.spent_coins),
            csvText(r.transaction_id),
            csvText(r.product_name),
            csvText(r.msg)
        ];
        lines.push(row.join(','));
    }

    writeCsvUtf8(file, lines, withBom);
};

/** 统计为 0 时：不按 world_id 过滤，看同条件下全库分布（与主查询同一套 payment_status 规则） */
const logSpendByWorldIdHint = async (conn, targetWorldId, startTs, endTs, paymentStatusMode, filterByWorld) => {
    const { whereSql, params } = buildPtbSpendFilters(false, null, startTs, endTs, paymentStatusMode);
    const [[totRow]] = await conn.execute(`SELECT COUNT(*) AS total FROM paymentrecords pr WHERE ${whereSql}`, params);
    const grandTotal = Number(totRow?.total || 0);
    if (grandTotal === 0) {
        logWarn(
            '该时间范围内没有任何「平台币扣款」流水。可尝试放宽：--payment-status=23 或 any；或核对日期/库。'
        );
        return;
    }

    const [rows] = await conn.execute(
        `
        SELECT pr.world_id, COUNT(*) AS cnt
        FROM paymentrecords pr
        WHERE ${whereSql}
        GROUP BY pr.world_id
        ORDER BY cnt DESC
        LIMIT 25
        `,
        params
    );
    const list = rows.map((r) => {
        const wid = r.world_id == null ? 'NULL' : r.world_id;
        return `world_id=${wid}:${Number(r.cnt)}`;
    });
    logWarn(
        `（诊断，不限区服）同条件下平台币扣款共 ${grandTotal} 条；按 world_id 分布（前 25 组）：${list.join(' | ')}`
    );
    if (filterByWorld) {
        const hit = rows.find((r) => Number(r.world_id) === Number(targetWorldId));
        if (!hit) {
            logWarn(
                `其中没有 world_id=${targetWorldId}。业务里大量流水 world_id 固定为 1（见 platformCoins 发放等），礼包消费才写角色 server_id。可改用 --all-worlds 或核对真实过滤字段。`
            );
        }
    }
};

const compensateOne = async (conn, item, runKey, windowLabel, multiplier) => {
    const change = round2(Number(item.spent_coins || 0) * multiplier);
    if (change <= 0) {
        return { status: 'skipped', message: '发放金额为 0，已跳过' };
    }

    const marker = `PTB_SRV_MULT_${runKey}`;
    const txId = `ptb_srv_mult_${runKey}_${item.user_id}`.slice(0, 120);
    const remark = `${windowLabel} 区服消费×${multiplier} 返还`;

    await conn.beginTransaction();
    try {
        const [existsRows] = await conn.execute(
            `SELECT id FROM paymentrecords WHERE user_id = ? AND msg LIKE ? LIMIT 1`,
            [item.user_id, `${marker};%`]
        );
        if (existsRows.length > 0) {
            await conn.rollback();
            return { status: 'skipped', message: '该批次已发放过（防重复），已跳过' };
        }

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
        const after = Number((before + change).toFixed(2));
        const adminBalanceAfter = Number((adminBalanceBefore - change).toFixed(2));

        if (adminBalanceBefore < change) {
            await conn.rollback();
            return {
                status: 'error',
                message: `管理员余额不足：需要 ${change}，当前 ${adminBalanceBefore}`
            };
        }

        await conn.execute(`UPDATE admins SET available_platform_coins = ? WHERE id = ?`, [
            adminBalanceAfter,
            COMPENSATE_ADMIN_ID
        ]);

        await conn.execute(`UPDATE users SET platform_coins = ? WHERE id = ?`, [after, item.user_id]);

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

        const msgFull = `${marker};消费${item.spent_coins}×${multiplier};操作人:${admin.channel_code || `admin_${COMPENSATE_ADMIN_ID}`}`;

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
                msgFull,
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
            message: `发放成功 +${change}（消费 ${item.spent_coins}×${multiplier}），玩家 ${before}->${after}`
        };
    } catch (e) {
        await conn.rollback();
        return { status: 'error', message: e.message || '发放失败' };
    }
};

const run = async () => {
    const { mode, options } = parseArgs();
    const { startTs, endTs } = buildDateBounds(options.from, options.to);
    const worldId = options.worldId;
    const multiplier = options.multiplier;
    const filterByWorld = !options.allWorlds;
    const psm = String(options.paymentStatusMode || '3').toLowerCase();
    const psmOk = new Set(['3', '23', '2,3', '2-3', 'any', 'all']);
    if (!psmOk.has(psm)) {
        throw new Error(`--payment-status 无效: ${options.paymentStatusMode}，支持 3 | 23 | any`);
    }

    if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error(`倍数无效: ${multiplier}`);
    }

    if (!['stats', 'compensate'].includes(mode)) {
        throw new Error(`未知模式: ${mode}，仅支持 stats / compensate`);
    }

    if (!startTs && !endTs) {
        logWarn('未指定 --from/--to，将统计该区服全部历史平台币消费；建议先缩小日期范围再导出审核。');
    }

    const runKey = buildRunKey(
        worldId,
        multiplier,
        options.from,
        options.to,
        startTs,
        endTs,
        options.allWorlds,
        options.paymentStatusMode
    );
    const worldPart = filterByWorld ? `world_id=${worldId}` : '不限 world_id（--all-worlds）';
    const stPart =
        psm === 'any' || psm === 'all'
            ? 'payment_status 任意(仅 ptb_change<0)'
            : psm === '23' || psm === '2,3' || psm === '2-3'
              ? 'payment_status IN (2,3)'
              : 'payment_status=3';
    const timePart =
        startTs && endTs
            ? `${startTs} ~ ${endTs}`
            : startTs
              ? `>= ${startTs}`
              : endTs
                ? `<= ${endTs}`
                : '全历史 (未限定 from/to)';
    const windowLabel = `${worldPart}；${stPart}；${timePart}`;
    const outBase = path.join(process.cwd(), `ptb_server_${runKey}`);
    const statsCsv = `${outBase}_stats.csv`;
    const rawCsv = `${outBase}_records.csv`;
    const compensateCsv = `${outBase}_grant.csv`;

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);
        logInfo(`条件: ${windowLabel}；倍数 ${multiplier}`);

        const rows = await queryServerSpend(conn, filterByWorld, worldId, startTs, endTs, options.paymentStatusMode);
        const rawRows = await queryServerSpendRaw(
            conn,
            filterByWorld,
            worldId,
            startTs,
            endTs,
            options.paymentStatusMode
        );
        const totalSpent = rows.reduce((s, r) => s + Number(r.spent_coins || 0), 0);
        const totalGrant = round2(totalSpent * multiplier);
        logInfo(
            `统计完成：${rows.length} 个账号，明细流水 ${rawRows.length} 条；消费合计 ${totalSpent.toFixed(2)}，按×${multiplier} 应发 ${totalGrant.toFixed(2)}`
        );
        if (rows.length === 0 && rawRows.length === 0) {
            await logSpendByWorldIdHint(conn, worldId, startTs, endTs, options.paymentStatusMode, filterByWorld);
        }
        writeRawCsv(rawCsv, rawRows, options.excelBom);
        logInfo(`流水明细 CSV: ${rawCsv}`);

        if (mode === 'stats') {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })), multiplier, options.excelBom);
            logInfo(`汇总 CSV（含 grant_coins 列供审核）: ${statsCsv}`);
            return;
        }

        if (!options.confirm) {
            writeCsv(statsCsv, rows.map((r) => ({ ...r, status: '', message: '' })), multiplier, options.excelBom);
            logWarn(`当前为 compensate 模式但未带 --confirm，仅导出: ${statsCsv}`);
            return;
        }

        const resultRows = [];
        for (const item of rows) {
            const res = await compensateOne(conn, item, runKey, windowLabel, multiplier);
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
        writeCsv(compensateCsv, resultRows, multiplier, options.excelBom);
        logInfo(`发放结束：成功 ${successCount}，跳过 ${skippedCount}，失败 ${errorCount}`);
        logInfo(`结果 CSV: ${compensateCsv}`);
    } finally {
        if (conn) await conn.end();
    }
};

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});
