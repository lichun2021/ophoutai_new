#!/usr/bin/env node
/**
 * 每日平台币发放脚本
 * 功能：给 Users 表中所有 status=0（正常）的用户增加平台币
 *
 * ⚠️  重要：每次发放同时向 PaymentRecords 写入流水记录
 *     避免触发支付系统的"余额凭空增加"安全检测，导致用户购买被拒绝
 *
 * Usage:
 * node scripts/daily-coins-grant.js          # 执行发放
 * node scripts/daily-coins-grant.js --dry-run # 试运行，只统计不修改
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ========================
// 配置
// ========================
const COINS_TO_GRANT = 5;     // 每次发放的平台币数量
const BATCH_SIZE = 50;       // 每批并发数
const DRY_RUN = process.argv.includes('--dry-run');

// ========================
// 主流程
// ========================
async function run() {
    logInfo(`=== 每日平台币发放任务启动 ===`);
    logInfo(`发放金额: ${COINS_TO_GRANT} 平台币 / 用户`);
    if (DRY_RUN) logWarn('【试运行模式】不会写入数据库');

    const pool = mysql.createPool({
        ...DB_CONFIG,
        connectionLimit: 10,
        connectTimeout: 30000,
        waitForConnections: true,
    });

    try {
        // 1. 查询所有正常用户
        logInfo('查询有效用户列表...');
        const [users] = await pool.execute(
            `SELECT id, platform_coins, channel_code, game_code FROM users WHERE status = 0 ORDER BY id ASC`
        );

        const total = users.length;
        logInfo(`共找到 ${total} 个有效用户`);

        if (total === 0) {
            logWarn('没有需要发放的用户，退出');
            return;
        }

        if (DRY_RUN) {
            logInfo(`[试运行] 将向 ${total} 个用户各发放 ${COINS_TO_GRANT} 平台币`);
            logInfo(`[试运行] 总计发放: ${total * COINS_TO_GRANT} 平台币`);
            return;
        }

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        // ★ 关键优化：一次性查出今日已发的所有用户 ID，存入 Set
        //   避免每用户做一次全表扫描导致卡住
        logInfo('预取今日已发记录...');
        const prefix = `daily_grant_${today}_uid`;
        // ⚠️ SQL LIKE 中 `_` 是单字符通配符，用 ! 作转义符替代反斜杠，避免 MySQL 语法冲突
        const prefixEscaped = prefix.replace(/_/g, '!_');
        const [doneRows] = await pool.execute(
            `SELECT transaction_id FROM paymentrecords WHERE transaction_id LIKE ? ESCAPE '!' LIMIT 100000`,
            [`${prefixEscaped}%`]
        );
        const doneSet = new Set(doneRows.map(r => r.transaction_id));
        logInfo(`今日已发: ${doneSet.size} 人`);

        // ★ 全局幂等：今日已全部发完，直接退出，无需再逐个处理
        if (doneSet.size >= total) {
            logInfo('今日已全部发放完成，无需重复执行，退出。');
            return;
        }

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        // 2. 分批并发处理（每批 BATCH_SIZE 个，避免单连接超时）
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (user) => {
                const userId = user.id;
                const oldBalance = parseFloat(user.platform_coins) || 0;
                const newBalance = oldBalance + COINS_TO_GRANT;
                const transactionId = `${prefix}${userId}`;

                // 内存幂等检查，不查数据库
                if (doneSet.has(transactionId)) {
                    skipCount++;
                    return;
                }

                try {
                    const conn = await pool.getConnection();
                    try {
                        // a. 更新余额
                        await conn.execute(
                            `UPDATE users SET platform_coins = ? WHERE id = ?`,
                            [newBalance, userId]
                        );

                        // b. 写流水记录
                        await conn.execute(
                            `INSERT INTO paymentrecords
                                (user_id, transaction_id, payment_way, payment_id, amount,
                                 mch_order_id, product_name, product_des, payment_status,
                                 ptb_before, ptb_change, ptb_after,
                                 channel_code, game_code, wuid, created_at)
                             VALUES (?, ?, '每日赠送', 0, 0, ?, '每日平台币赠送', '内测奖励', 3, ?, ?, ?, ?, ?, '', NOW())`,
                            [
                                userId,
                                transactionId,
                                transactionId,
                                oldBalance,
                                COINS_TO_GRANT,
                                newBalance,
                                user.channel_code || '',
                                user.game_code || ''
                            ]
                        );

                        successCount++;
                    } finally {
                        conn.release();
                    }
                } catch (err) {
                    failCount++;
                    logError(`用户 ${userId} 处理失败: ${err.message}`);
                }
            }));

            // 进度日志
            const done = Math.min(i + BATCH_SIZE, total);
            logInfo(`进度: ${done} / ${total}  成功=${successCount} 跳过=${skipCount} 失败=${failCount}`);
        }

        // 3. 汇总
        logInfo('=== 发放完成 ===');
        logInfo(`成功: ${successCount} 用户`);
        if (skipCount > 0) logInfo(`跳过(已发): ${skipCount} 用户`);
        if (failCount > 0) logWarn(`失败: ${failCount} 用户`);
        logInfo(`本次总计发放: ${successCount * COINS_TO_GRANT} 平台币`);

    } catch (err) {
        logError(`任务异常: ${err.message}`);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
