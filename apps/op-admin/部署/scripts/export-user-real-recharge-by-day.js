#!/usr/bin/env node
/**
 * 导出指定日期所有玩家的真实充值汇总，并给出当日充值最多的区服与对应角色
 *
 * 定义：
 * - 真实充值：PaymentRecords.payment_status = 3 且 payment_way 不包含“平台币”
 * - 最多区服：同一用户在该日期按 server_id(从 server_url 中解析)聚合充值金额，取金额最大的区服
 * - 角色信息：依据 (user_id, server_id) 从 GameCharacters 取一条（按 character_level DESC, id DESC）
 *
 * 输出字段（CSV）：
 * user_id, username, thirdparty_uid, total_real_recharge, top_server_id, top_server_name, top_role_uuid
 *
 * 用法：
 * node scripts/export-user-real-recharge-by-day.js 2026-04-05
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const OUTPUT_FILE = (dateStr) => path.join(process.cwd(), `export_user_real_recharge_${dateStr}.csv`);

function parseServerIdFromUrl(serverUrlRaw) {
    try {
        const serverUrl = (serverUrlRaw || '').toString();
        if (!serverUrl) return null;
        // gift:// 开头的是礼包单，依然允许解析但不做特殊排除（这里只有“平台币”做排除）
        // 常见参数名：h=server_id 或 sid=server_id
        const mH = serverUrl.match(/(?:[?&#])h=([^&#]+)/i);
        if (mH && mH[1]) return String(decodeURIComponent(mH[1]));
        const mSid = serverUrl.match(/(?:[?&#])sid=([^&#]+)/i);
        if (mSid && mSid[1]) return String(decodeURIComponent(mSid[1]));
        return null;
    } catch {
        return null;
    }
}

async function run(dateArg) {
    if (!dateArg) {
        console.error('缺少日期参数，请使用：node scripts/export-user-real-recharge-by-day.js YYYY-MM-DD');
        process.exit(1);
        return;
    }
    // 简单校验 YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
        console.error('日期格式错误，应为 YYYY-MM-DD');
        process.exit(1);
        return;
    }

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);

        // 1) 拉取当日所有真实充值（排除平台币），聚合到 user 维度
        // 额外保留每条记录的 server_id（解析自 server_url），后续用于找“最多区服”
        const [records] = await conn.execute(
            `
            SELECT 
                pr.user_id,
                pr.amount,
                pr.server_url,
                u.username,
                u.thirdparty_uid
            FROM paymentrecords pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.payment_status = 3
              AND DATE(pr.created_at) = ?
              AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
            `,
            [dateArg]
        );

        if (!records || records.length === 0) {
            logWarn(`日期 ${dateArg} 没有符合条件的真实充值记录，退出。`);
            return;
        }

        // 2) 以 user_id 聚合总额，同时统计该用户在各 server_id 的金额
        const userAgg = new Map();
        for (const r of records) {
            const userId = r.user_id;
            const amount = Number(r.amount) || 0;
            const serverId = parseServerIdFromUrl(r.server_url) || '';
            const key = String(userId);
            if (!userAgg.has(key)) {
                userAgg.set(key, {
                    user_id: userId,
                    username: r.username || '',
                    thirdparty_uid: r.thirdparty_uid || '',
                    total: 0,
                    byServer: new Map()
                });
            }
            const item = userAgg.get(key);
            item.total += amount;
            if (serverId) {
                const prev = item.byServer.get(serverId) || 0;
                item.byServer.set(serverId, prev + amount);
            }
        }

        // 3) 为每个用户挑选“当天充值最多的区服”
        const results = [];
        for (const [, item] of userAgg) {
            let topServerId = '';
            let topServerAmount = -1;
            for (const [sid, amt] of item.byServer) {
                if (amt > topServerAmount) {
                    topServerAmount = amt;
                    topServerId = sid;
                }
            }

            // 4) 在 GameCharacters 中按 (user_id, server_id) 匹配一条角色，取更“代表性”的一条
            // 优先：character_level DESC，其次：id DESC
            let topRoleUuid = '';
            let topServerName = '';
            if (topServerId) {
                const [chars] = await conn.execute(
                    `
                    SELECT uuid, server_id, server_name, character_level
                    FROM gamecharacters
                    WHERE user_id = ? AND server_id = ?
                    ORDER BY character_level DESC, id DESC
                    LIMIT 1
                    `,
                    [item.user_id, topServerId]
                );
                if (chars && chars.length > 0) {
                    topRoleUuid = chars[0].uuid || '';
                    topServerName = chars[0].server_name || '';
                } else {
                    // 若没能在该区服匹配到角色，则退化为该用户任意一个角色
                    const [anyChar] = await conn.execute(
                        `
                        SELECT uuid, server_id, server_name, character_level
                        FROM gamecharacters
                        WHERE user_id = ?
                        ORDER BY character_level DESC, id DESC
                        LIMIT 1
                        `,
                        [item.user_id]
                    );
                    if (anyChar && anyChar.length > 0) {
                        topRoleUuid = anyChar[0].uuid || '';
                        topServerName = anyChar[0].server_name || '';
                        // 同时补 topServerId
                        topServerId = anyChar[0].server_id ? String(anyChar[0].server_id) : '';
                    }
                }
            } else {
                // 当天该用户的 server_url 都无法解析出区服，退化为任意一个角色
                const [anyChar] = await conn.execute(
                    `
                    SELECT uuid, server_id, server_name, character_level
                    FROM gamecharacters
                    WHERE user_id = ?
                    ORDER BY character_level DESC, id DESC
                    LIMIT 1
                    `,
                    [item.user_id]
                );
                if (anyChar && anyChar.length > 0) {
                    topRoleUuid = anyChar[0].uuid || '';
                    topServerName = anyChar[0].server_name || '';
                    topServerId = anyChar[0].server_id ? String(anyChar[0].server_id) : '';
                }
            }

            results.push({
                user_id: item.user_id,
                username: item.username,
                thirdparty_uid: item.thirdparty_uid,
                total_real_recharge: Math.round(item.total * 100) / 100,
                top_server_id: topServerId || '',
                top_server_name: topServerName || '',
                top_role_uuid: topRoleUuid || ''
            });
        }

        // 5) 写 CSV
        const header = [
            'user_id',
            'username',
            'thirdparty_uid',
            'total_real_recharge',
            'top_server_id',
            'top_server_name',
            'top_role_uuid'
        ];
        const lines = [header.join(',')];
        results.sort((a, b) => b.total_real_recharge - a.total_real_recharge);
        for (const r of results) {
            const row = [
                r.user_id,
                `"${(r.username || '').replace(/"/g, '""')}"`,
                `"${(r.thirdparty_uid || '').replace(/"/g, '""')}"`,
                r.total_real_recharge,
                `"${(r.top_server_id || '').replace(/"/g, '""')}"`,
                `"${(r.top_server_name || '').replace(/"/g, '""')}"`,
                `"${(r.top_role_uuid || '').replace(/"/g, '""')}"`
            ];
            lines.push(row.join(','));
        }
        const out = OUTPUT_FILE(dateArg);
        fs.writeFileSync(out, lines.join('\n'), 'utf8');
        logInfo(`导出完成：${out}（共 ${results.length} 行）`);
    } catch (err) {
        logError(`执行失败：${err.message}`);
        process.exitCode = 1;
    } finally {
        if (conn) await conn.end();
    }
}

const targetDate = process.argv[2];
run(targetDate);

