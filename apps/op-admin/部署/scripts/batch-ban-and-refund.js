#!/usr/bin/env node
/**
 * 批量封号 + 实充返还脚本
 *
 * 读取 CSV（第一列为账号 username），对每个 username：
 *   0. 按 username 查 users.id（user_id）
 *   1. 查其所有游戏角色（gamecharacters WHERE user_id = ?）
 *   2. 每个角色调游戏服 HTTP /open_api/player/ban 永久封号（openId = 角色 uuid）—— 不封主账号 users.status
 *   3. 统计实充总额（后台口径：payment_status=3 且 payment_way 不含"平台币"，不限日期）
 *   4. 实充 = 0  → 整账号跳过（不封号不发币）
 *      实充 > 0 → 发放 实充 × 15 平台币到主账号，先清零当前平台币再发（最终余额 = 返还额）
 *   5. 某角色封号失败 → 跳过该角色继续，不影响其他角色和平台币发放
 *
 * 用法:
 *   模拟运行（默认，只统计+打印，不调游戏服/不发币）:
 *     node batch-ban-and-refund.js --csv=users.csv
 *   正式执行（必须加 --confirm）:
 *     node batch-ban-and-refund.js --csv=users.csv --confirm
 *
 * 说明:
 *   - CSV 第一列为账号 username（字符串，非纯数字），其余列忽略；自动跳过表头/空行，自动去重
 *   - 防重复：marker BAN_REFUND_<user_id> 写入 paymentrecords.msg，重跑时跳过已处理的账号
 *   - 平台币发放：直接重置用户 platform_coins 为返还额（不扣管理员，避免受管理员余额限制），
 *     写 paymentrecords 流水保持余额链
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { createHmac } from 'crypto';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ── 配置 ──────────────────────────────────────────────────────────────────
const API_SIGN_KEY = process.env.API_SIGN_KEY || '';
const GM_TIMEOUT_MS = parseInt(process.env.GM_TIMEOUT_MS || '10000', 10);
const BAN_DURATION = 315360000;         // 永久封（约 10 年秒数，与前端"永久"选项一致）
const REFUND_RATE = 15;                  // 实充 × 15 返还
const BAN_REASON = '批量封号脚本';

// ── REST 签名工具（与 auto-gift-delivery.js / gameServerClient.ts 保持一致）────
function genNonce() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 12)}`;
}
function hmacSign(timestamp, nonce, body, signKey) {
    const payload = `${timestamp}\n${nonce}\n${body}`;
    return createHmac('sha256', signKey).update(payload).digest('hex');
}

// ── 参数解析 ───────────────────────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const options = { csv: null, confirm: false };
    for (const arg of args) {
        if (arg.startsWith('--csv=')) options.csv = arg.split('=')[1];
        if (arg === '--confirm') options.confirm = true;
    }
    return options;
}

// ── 读 CSV 第一列 账号 username ───────────────────────────────────────────
function readUsernames(csvPath) {
    if (!csvPath) throw new Error('缺少 --csv 参数，例如 --csv=users.csv');
    if (!fs.existsSync(csvPath)) throw new Error(`CSV 文件不存在: ${csvPath}`);

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const seen = new Set();
    const usernames = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const firstCol = line.split(',')[0].trim();
        if (!firstCol) continue;
        // 跳过常见表头（含“账号/用户名/username/user”等关键字）
        if (/^(账号|用户名|username|user|user_id|userid)$/i.test(firstCol)) continue;
        if (seen.has(firstCol)) continue;
        seen.add(firstCol);
        usernames.push(firstCol);
    }
    return usernames;
}

// ── 按 username 查 user_id + 主账号信息 ─────────────────────────────────
async function getUserByUsername(conn, username) {
    const [rows] = await conn.execute(
        `SELECT id, username, platform_coins, channel_code, game_code, thirdparty_uid
         FROM users WHERE username = ? LIMIT 1`,
        [username]
    );
    return rows[0] || null;
}

// ── 查 user_id 的所有角色 ─────────────────────────────────────────────────
async function getCharactersByUserId(conn, userId) {
    const [rows] = await conn.execute(
        `SELECT id, uuid, server_id, server_name, subuser_id, character_name
         FROM gamecharacters WHERE user_id = ? ORDER BY id ASC`,
        [userId]
    );
    return rows;
}

// ── 查实充总额（后台口径：payment_status=3 且 payment_way 不含"平台币"，不限日期）─
// 与后台用户实充统计一致：只排除平台币，包含支付宝/微信/其他所有现金支付方式
async function getCashRechargeTotal(conn, userId) {
    const [rows] = await conn.execute(
        `
        SELECT COALESCE(SUM(pr.amount), 0) AS total
        FROM paymentrecords pr
        WHERE pr.user_id = ?
          AND pr.payment_status = 3
          AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
        `,
        [userId]
    );
    const total = parseFloat(String(rows[0]?.total ?? 0));
    return Number.isFinite(total) ? total : 0;
}

// ── 调游戏服封号（HTTP /open_api/player/ban）─────────────────────────────
async function banCharacterOnGameServer(conn, serverId, uuid, reason) {
    // server_id 兼容短 ID：1 → 10001
    let sid = Number(serverId);
    if (Number.isFinite(sid) && sid > 0 && sid < 10000) sid = sid + 10000;
    const sidStr = String(sid);

    // 查游戏服配置（webhost）
    const [serverRows] = await conn.execute(
        `SELECT name, webhost FROM gameservers WHERE server_id = ? OR bname = ? OR name = ? LIMIT 1`,
        [Number.isFinite(sid) ? sid : -1, `game_${sidStr}`, sidStr]
    );
    const serverCfg = serverRows[0];
    if (!serverCfg || !serverCfg.webhost) {
        return { success: false, message: `未找到区服配置: server_id=${serverId}` };
    }

    const rawBase = String(serverCfg.webhost).replace(/\/+$/, '').replace(/\/script$/, '');
    const banUrl = `${rawBase}/open_api/player/ban`;

    const restPayload = {
        openId: String(uuid),
        serverId: sidStr,
        platform: 'android',
        duration: BAN_DURATION,
        reason,
    };
    const bodyStr = JSON.stringify(restPayload);

    // HMAC-SHA256 签名
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = genNonce();
    const headers = { 'Content-Type': 'application/json' };
    if (API_SIGN_KEY) {
        const sign = hmacSign(timestamp, nonce, bodyStr, API_SIGN_KEY);
        headers['X-Timestamp'] = timestamp;
        headers['X-Nonce'] = nonce;
        headers['X-Sign'] = sign;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GM_TIMEOUT_MS);
    try {
        const response = await fetch(banUrl, {
            method: 'POST',
            headers,
            body: bodyStr,
            signal: controller.signal,
        });
        clearTimeout(timeout);
        const respText = await response.text();
        if (!response.ok) {
            return { success: false, message: `HTTP ${response.status}: ${respText.slice(0, 200)}` };
        }
        // 游戏服返回 { code: 0, message: 'ok' }
        let data;
        try { data = JSON.parse(respText); } catch { data = null; }
        if (data && data.code !== 0 && data.code !== 200) {
            return { success: false, message: `游戏服失败: [${data.code}] ${data.message || ''}` };
        }
        return { success: true, message: 'ok' };
    } catch (err) {
        clearTimeout(timeout);
        const msg = err && err.name === 'AbortError' ? `请求超时(${GM_TIMEOUT_MS}ms)` : (err?.message || String(err));
        return { success: false, message: msg };
    }
}

// ── 发放平台币（先清零再发，复用 cash-recharge-multiplier 事务模式）─────────
async function refundPlatformCoins(conn, userId, refundAmount) {
    const marker = `BAN_REFUND_${userId}`;
    const txId = `ban_refund_${userId}_${Date.now()}`;
    const remark = `批量封号返还：实充×${REFUND_RATE}，重置平台币后发放`;

    if (refundAmount <= 0) {
        return { status: 'skipped', message: '返还金额为 0，跳过' };
    }

    await conn.beginTransaction();
    try {
        // 防重复
        const [existsRows] = await conn.execute(
            `SELECT id FROM paymentrecords WHERE user_id = ? AND msg = ? LIMIT 1`,
            [userId, marker]
        );
        if (existsRows.length > 0) {
            await conn.rollback();
            return { status: 'skipped', message: '该账号已处理过，跳过' };
        }

        // 锁定用户
        const [userRows] = await conn.execute(
            `SELECT id, platform_coins, channel_code, game_code, thirdparty_uid
             FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
            [userId]
        );
        if (!userRows.length) {
            await conn.rollback();
            return { status: 'error', message: '用户不存在' };
        }
        const user = userRows[0];

        const playerBalanceBefore = Number(user.platform_coins || 0);   // 清零前的原余额（记入流水）
        const playerBalanceAfter = Number(refundAmount.toFixed(2));     // ★ 重置后 = 返还额

        // ★ 重置用户平台币：直接设为返还额（先清零再发的最终结果）
        // 不扣减管理员（避免受管理员 available_platform_coins 余额限制）
        await conn.execute(
            `UPDATE users SET platform_coins = ? WHERE id = ?`,
            [playerBalanceAfter, userId]
        );

        // PaymentRecords 流水（保持余额链）
        await conn.execute(
            `INSERT INTO paymentrecords
            (user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, payment_id, world_id,
             product_name, product_des, ip, amount, mch_order_id, msg, server_url, device, channel_code, game_code,
             payment_status, ptb_before, ptb_change, ptb_after)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                null,
                '',
                txId,
                String(user.thirdparty_uid || '0'),
                '平台币',
                0,
                1,
                '管理员发放',
                remark,
                '',
                refundAmount,
                txId,
                marker,
                '',
                '',
                String(user.channel_code || ''),
                String(user.game_code || ''),
                3,
                playerBalanceBefore,
                refundAmount,
                playerBalanceAfter
            ]
        );

        await conn.commit();
        return {
            status: 'success',
            message: `返还 +${refundAmount}（重置前 ${playerBalanceBefore} -> ${playerBalanceAfter}）`
        };
    } catch (e) {
        await conn.rollback();
        return { status: 'error', message: e.message || '发放失败' };
    }
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function run() {
    const options = parseArgs();
    const confirm = options.confirm;

    const usernames = readUsernames(options.csv);
    if (usernames.length === 0) {
        logWarn('CSV 未读到任何账号 username，退出');
        return;
    }
    logInfo(`读取到 ${usernames.length} 个账号${confirm ? '【正式执行】' : '【模拟运行，加 --confirm 才真正执行】'}`);

    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const outCsv = path.join(process.cwd(), `batch_ban_refund_${ts}.csv`);
    const header = [
        'username', 'user_id', '角色数', '封号成功', '封号失败',
        '实充总额', '返还额', '平台币状态', '平台币说明', '失败角色(uuid@server_id)'
    ];
    const lines = [header.join(',')];

    let conn;
    const summary = {
        total: usernames.length, banned: 0, refunded: 0,
        skippedNoUser: 0, skippedNoChar: 0, skippedNoRecharge: 0, errors: 0
    };

    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);

        for (const username of usernames) {
            const resultRow = {
                username, user_id: '', charCount: 0, banOk: 0, banFail: 0,
                recharge: 0, refund: 0, ptbStatus: '', ptbMsg: '', failedChars: ''
            };

            try {
                // 按 username 查 user_id
                const user = await getUserByUsername(conn, username);
                if (!user) {
                    resultRow.ptbStatus = 'skipped';
                    resultRow.ptbMsg = '账号不存在，跳过';
                    summary.skippedNoUser++;
                    logWarn(`username=${username} 账号不存在，跳过`);
                    lines.push(toCsvLine(resultRow));
                    continue;
                }
                const userId = Number(user.id);
                resultRow.user_id = userId;

                // 查角色
                const chars = await getCharactersByUserId(conn, userId);
                resultRow.charCount = chars.length;

                if (chars.length === 0) {
                    resultRow.ptbStatus = 'skipped';
                    resultRow.ptbMsg = '无角色，跳过';
                    summary.skippedNoChar++;
                    logInfo(`username=${username} (user_id=${userId}) 无角色，跳过`);
                    lines.push(toCsvLine(resultRow));
                    continue;
                }

                // 查实充
                const recharge = await getCashRechargeTotal(conn, userId);
                resultRow.recharge = Number(recharge.toFixed(2));

                if (recharge <= 0) {
                    resultRow.ptbStatus = 'skipped';
                    resultRow.ptbMsg = '实充为0，整账号跳过';
                    summary.skippedNoRecharge++;
                    logInfo(`username=${username} (user_id=${userId}) 实充=0，整账号跳过（不封号不发币）`);
                    lines.push(toCsvLine(resultRow));
                    continue;
                }

                const refund = Number((recharge * REFUND_RATE).toFixed(2));
                resultRow.refund = refund;
                logInfo(`username=${username} (user_id=${userId}) 角色${chars.length}个 实充=${recharge} 返还=${refund}`);

                // 封号：每个角色调游戏服
                const failedChars = [];
                for (const ch of chars) {
                    if (confirm) {
                        const r = await banCharacterOnGameServer(conn, ch.server_id, ch.uuid, BAN_REASON);
                        if (r.success) {
                            resultRow.banOk++;
                        } else {
                            resultRow.banFail++;
                            failedChars.push(`${ch.uuid}@${ch.server_id}:${r.message}`);
                            logWarn(`  username=${username} 封号失败 uuid=${ch.uuid} server=${ch.server_id}: ${r.message}`);
                        }
                    } else {
                        // 模拟：打印将执行的封号
                        logInfo(`  [模拟] 将封号 username=${username} uuid=${ch.uuid} server=${ch.server_id} name=${ch.character_name}`);
                        resultRow.banOk++;
                    }
                }
                resultRow.failedChars = failedChars.join('; ');
                if (resultRow.banOk > 0) summary.banned++;

                // 发放平台币（先清零再发）
                if (confirm) {
                    const r = await refundPlatformCoins(conn, userId, refund);
                    resultRow.ptbStatus = r.status;
                    resultRow.ptbMsg = r.message;
                    if (r.status === 'success') summary.refunded++;
                    else if (r.status === 'error') summary.errors++;
                    logInfo(`  username=${username} 平台币 ${r.status}: ${r.message}`);
                } else {
                    resultRow.ptbStatus = 'dry-run';
                    resultRow.ptbMsg = `模拟：将重置平台币并发放 ${refund}`;
                    logInfo(`  [模拟] 将发放平台币 ${refund}（先清零）`);
                }

                lines.push(toCsvLine(resultRow));
            } catch (e) {
                summary.errors++;
                resultRow.ptbStatus = 'error';
                resultRow.ptbMsg = e.message || '处理异常';
                logError(`username=${username} 处理异常: ${e.message}`);
                lines.push(toCsvLine(resultRow));
            }
        }

        fs.writeFileSync(outCsv, lines.join('\n'), 'utf8');
        console.log(`\n===================================================`);
        console.log(`📊 处理总览 (${confirm ? '正式执行' : '模拟运行'}):`);
        console.log(`   总账号数:       ${summary.total}`);
        console.log(`   封号账号数:     ${summary.banned}`);
        console.log(`   发放账号数:     ${summary.refunded}`);
        console.log(`   账号不存在跳过: ${summary.skippedNoUser}`);
        console.log(`   无角色跳过:     ${summary.skippedNoChar}`);
        console.log(`   实充为0跳过:    ${summary.skippedNoRecharge}`);
        console.log(`   错误数:          ${summary.errors}`);
        console.log(`   结果CSV: ${outCsv}`);
        console.log(`===================================================\n`);
    } finally {
        if (conn) await conn.end();
    }
}

function toCsvLine(r) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
        esc(r.username),
        r.user_id,
        r.charCount,
        r.banOk,
        r.banFail,
        r.recharge,
        r.refund,
        esc(r.ptbStatus),
        esc(r.ptbMsg),
        esc(r.failedChars),
    ].join(',');
}

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});
