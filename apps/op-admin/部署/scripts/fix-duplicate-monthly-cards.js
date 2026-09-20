#!/usr/bin/env node
/**
 * 修复重复月卡脚本
 *
 * 背景：
 *   旧版续购逻辑是"有生效卡也直接插入新卡"，导致同一用户名下可能同时存在
 *   多张 is_active=1 的月卡（card_type='monthly'），而每日发放是把所有生效卡
 *   的 daily_coins 累加发放的 —— 相当于买得越多、每天领得越多，而不是卡的
 *   有效期变长。续购逻辑已修复为"延期"，但历史上已经产生的重复卡不会自动
 *   合并，需要用本脚本一次性修复。
 *
 * 逻辑：
 *   1. 找出所有 card_type='monthly'、is_active=1、且未过期(expire_date>=今天)
 *      的卡数量 > 1 的用户
 *   2. 对每个用户，把该用户名下所有这类重复月卡的"剩余天数"
 *      （DATEDIFF(expire_date, 今天) + 1，即含到期当天）累加求和
 *   3. 保留 created_at 最早的一张卡，把它的 expire_date 改为
 *      今天 + 累加剩余天数 - 1（即把所有卡里没花完的天数全部合并到这一张）
 *   4. 其余重复卡设置 is_active = 0（不删除，保留记录方便对账）
 *   5. 幂等：重跑时，已经合并过的用户不会再被查出来（因为只剩一张生效卡）
 *
 * 说明：
 *   - 只处理月卡(card_type='monthly')，不处理终身卡(lifetime)
 *   - 不会影响 MonthlyCardClaims 领取记录，历史领取记录原样保留
 *   - 每个用户的合并在单个事务内完成，避免中途失败导致数据不一致
 *
 * 用法:
 *   模拟运行（默认，只统计+打印+输出CSV，不写库）:
 *     node fix-duplicate-monthly-cards.js
 *   只看某一个用户（配合排查/验证）:
 *     node fix-duplicate-monthly-cards.js --user-id=123
 *   正式执行（必须加 --confirm）:
 *     node fix-duplicate-monthly-cards.js --confirm
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ── 与 server/model/monthlyCard.ts 保持一致的"北京时间日期"计算 ──────────
function getBeijingDate() {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

// ── 把 DATE 字段规整成 'YYYY-MM-DD' 字符串 ───────────────────────────────
// mysql2 默认会把 DATE 列解析成本地时区的 Date 对象（而不是字符串），
// 直接做字符串拼接会得到 "Tue Sep 29 2026 00:00:00 GMT+0800 ..." 这种格式，
// 拼上 "T00:00:00Z" 会变成非法日期字符串导致 new Date() 抛 Invalid time value。
// 这里不依赖连接层 dateStrings 配置，统一在使用前做一次防御性转换。
function toDateStr(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
        // 用本地年月日拼接，避免 toISOString() 做 UTC 转换导致跨时区偏移一天
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // 已经是字符串（如连接层配置了 dateStrings: true），只取日期部分
    return String(value).slice(0, 10);
}

// ── 参数解析 ───────────────────────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const options = { confirm: false, userId: null };
    for (const arg of args) {
        if (arg === '--confirm') options.confirm = true;
        if (arg.startsWith('--user-id=')) options.userId = Number(arg.split('=')[1]);
    }
    return options;
}

function toCsvLine(r) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
        r.user_id,
        r.duplicate_card_count,
        esc(r.duplicate_card_ids),
        esc(r.old_expire_dates),
        r.total_remaining_days,
        r.kept_card_id,
        r.old_kept_expire,
        r.new_kept_expire,
        esc(r.status),
        esc(r.message),
    ].join(',');
}

// ── 查出所有存在重复生效月卡的用户 ID 列表 ─────────────────────────────────
async function findDuplicateUsers(conn, today, onlyUserId) {
    let query = `
        SELECT user_id, COUNT(*) AS card_count
        FROM MonthlyCards
        WHERE card_type = 'monthly'
          AND is_active = 1
          AND (expire_date IS NULL OR expire_date >= ?)
    `;
    const values = [today];
    if (onlyUserId) {
        query += ` AND user_id = ? `;
        values.push(onlyUserId);
    }
    query += ` GROUP BY user_id HAVING card_count > 1 ORDER BY user_id ASC`;

    const [rows] = await conn.execute(query, values);
    return rows.map((r) => r.user_id);
}

// ── 查某个用户当前所有生效中的月卡（未过期） ────────────────────────────────
async function getActiveMonthlyCards(conn, userId, today) {
    const [rows] = await conn.execute(
        `SELECT id, user_id, daily_coins, start_date, expire_date, purchase_amount, transaction_id, created_at
         FROM MonthlyCards
         WHERE user_id = ? AND card_type = 'monthly' AND is_active = 1
           AND (expire_date IS NULL OR expire_date >= ?)
         ORDER BY created_at ASC`,
        [userId, today]
    );
    return rows;
}

// ── 合并单个用户的重复月卡（单事务） ─────────────────────────────────────
async function mergeUserCards(conn, userId, today, confirm) {
    const result = {
        user_id: userId,
        duplicate_card_count: 0,
        duplicate_card_ids: '',
        old_expire_dates: '',
        total_remaining_days: 0,
        kept_card_id: '',
        old_kept_expire: '',
        new_kept_expire: '',
        status: '',
        message: '',
    };

    await conn.beginTransaction();
    try {
        // FOR UPDATE 锁住这批卡，避免与正在处理的支付回调撞车
        const [cards] = await conn.execute(
            `SELECT id, daily_coins, start_date, expire_date, purchase_amount, transaction_id, created_at
             FROM MonthlyCards
             WHERE user_id = ? AND card_type = 'monthly' AND is_active = 1
               AND (expire_date IS NULL OR expire_date >= ?)
             ORDER BY created_at ASC
             FOR UPDATE`,
            [userId, today]
        );

        if (cards.length <= 1) {
            await conn.rollback();
            result.status = 'skipped';
            result.message = '重新核对时只有<=1张生效卡（可能已被其他流程处理），跳过';
            return result;
        }

        // 统一把 expire_date/start_date 规整为 'YYYY-MM-DD' 字符串，防止 mysql2 返回 Date 对象导致后续解析出错
        for (const c of cards) {
            c.expire_date = toDateStr(c.expire_date);
            c.start_date = toDateStr(c.start_date);
        }

        result.duplicate_card_count = cards.length;
        result.duplicate_card_ids = cards.map((c) => c.id).join('|');
        result.old_expire_dates = cards.map((c) => c.expire_date || 'NULL').join('|');

        // 含到期当天：剩余天数 = DATEDIFF(expire_date, today) + 1
        const todayDate = new Date(`${today}T00:00:00Z`);
        let totalRemainingDays = 0;
        for (const c of cards) {
            if (!c.expire_date) {
                // 理论上月卡不应该是永久卡，出现说明数据异常，保守起见按 0 天算，不吞掉也不瞎猜
                logWarn(`  user_id=${userId} card_id=${c.id} 是月卡但 expire_date=NULL，跳过其天数累加`);
                continue;
            }
            const expDate = new Date(`${c.expire_date}T00:00:00Z`);
            const diffDays = Math.round((expDate.getTime() - todayDate.getTime()) / 86400000) + 1;
            totalRemainingDays += Math.max(diffDays, 0);
        }
        result.total_remaining_days = totalRemainingDays;

        // 保留 created_at 最早的一张
        const keptCard = cards[0];
        const duplicateCards = cards.slice(1);
        result.kept_card_id = keptCard.id;
        result.old_kept_expire = keptCard.expire_date || 'NULL';

        const newExpire = new Date(todayDate.getTime() + (totalRemainingDays - 1) * 86400000);
        const newExpireStr = newExpire.toISOString().slice(0, 10);
        result.new_kept_expire = newExpireStr;

        if (!confirm) {
            await conn.rollback();
            result.status = 'dry-run';
            result.message = `将保留 card_id=${keptCard.id}，到期日 ${keptCard.expire_date} -> ${newExpireStr}；停用 ${duplicateCards.length} 张重复卡`;
            return result;
        }

        // 正式执行：更新保留卡的到期日，停用其余卡
        await conn.execute(
            `UPDATE MonthlyCards SET expire_date = ? WHERE id = ?`,
            [newExpireStr, keptCard.id]
        );

        for (const dup of duplicateCards) {
            await conn.execute(
                `UPDATE MonthlyCards SET is_active = 0 WHERE id = ?`,
                [dup.id]
            );
        }

        await conn.commit();
        result.status = 'success';
        result.message = `已合并：保留 card_id=${keptCard.id}（到期日 ${keptCard.expire_date} -> ${newExpireStr}），停用 ${duplicateCards.length} 张重复卡`;
        return result;
    } catch (e) {
        await conn.rollback();
        result.status = 'error';
        result.message = e.message || '合并失败';
        return result;
    }
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function run() {
    const options = parseArgs();
    const confirm = options.confirm;
    const today = getBeijingDate();

    logInfo(`=== 修复重复月卡任务启动 ===`);
    logInfo(`基准日期（北京时间）: ${today}`);
    logInfo(confirm ? '【正式执行】将写入数据库' : '【模拟运行】只统计不写库，加 --confirm 才真正执行');
    if (options.userId) logInfo(`仅处理 user_id=${options.userId}`);

    let conn;
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const outCsv = path.join(process.cwd(), `fix_duplicate_monthly_cards_${ts}.csv`);
    const header = [
        'user_id', '重复卡数量', '重复卡ID列表', '各卡原到期日', '累加剩余天数',
        '保留卡ID', '保留卡原到期日', '保留卡新到期日', '状态', '说明',
    ];
    const lines = [header.join(',')];

    const summary = { totalUsers: 0, merged: 0, skipped: 0, errors: 0 };

    try {
        // dateStrings: true —— 让 DATE/DATETIME 字段直接以字符串返回，与生产 server/db/index.ts 保持一致，
        // 避免 mysql2 把 DATE 解析成 Date 对象导致后续字符串拼接出现 "Invalid time value"
        conn = await mysql.createConnection({ ...DB_CONFIG, dateStrings: true });
        logInfo(`已连接数据库: ${DB_CONFIG.database}`);

        const userIds = await findDuplicateUsers(conn, today, options.userId);
        summary.totalUsers = userIds.length;

        if (userIds.length === 0) {
            logInfo('✅ 未发现存在重复生效月卡的用户。');
            return;
        }
        logInfo(`🔍 发现 ${userIds.length} 个用户存在重复生效月卡。`);

        for (const userId of userIds) {
            const r = await mergeUserCards(conn, userId, today, confirm);
            lines.push(toCsvLine(r));

            if (r.status === 'success' || r.status === 'dry-run') {
                summary.merged++;
                logInfo(`user_id=${userId}: ${r.message}`);
            } else if (r.status === 'skipped') {
                summary.skipped++;
                logInfo(`user_id=${userId}: ${r.message}`);
            } else {
                summary.errors++;
                logError(`user_id=${userId}: ${r.message}`);
            }
        }

        fs.writeFileSync(outCsv, lines.join('\n'), 'utf8');
        console.log(`\n===================================================`);
        console.log(`📊 处理总览 (${confirm ? '正式执行' : '模拟运行'}):`);
        console.log(`   涉及用户数:     ${summary.totalUsers}`);
        console.log(`   ${confirm ? '已合并' : '待合并'}用户数: ${summary.merged}`);
        console.log(`   跳过用户数:     ${summary.skipped}`);
        console.log(`   错误数:         ${summary.errors}`);
        console.log(`   结果CSV: ${outCsv}`);
        console.log(`===================================================\n`);

        logInfo(confirm
            ? '--- [修复完成] 任务结束 ---'
            : '--- [模拟完成] 请核对上方 CSV 结果，确认无误后加 --confirm 正式执行 ---');
    } finally {
        if (conn) await conn.end();
    }
}

run().catch((e) => {
    logError(e.message || String(e));
    process.exit(1);
});
