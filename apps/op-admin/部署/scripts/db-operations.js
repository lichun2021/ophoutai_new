/**
 * 数据库保存操作
 */
import { logError, logInfo } from './config.js';

/**
 * 保存每日统计数据
 */
export async function saveDailyStats(connection, dateStr, channelCode, gameCode, stats) {
    try {
        const insertSql = `
            INSERT INTO dailystats (
                stat_date, channel_code, game_code, 
                active_users, new_users, register_users, valid_register_users, character_count, yesterday_retention,
                pay_users, new_pay_users, recharge_users, recharge_times, high_value_users, high_value_users_200,
                consume_amount, real_recharge_amount, high_value_recharge_amount, pay_amount, new_pay_amount, new_user_recharge,
                pay_rate, new_pay_rate, active_arpu, pay_arpu, new_arpu, new_pay_arpu
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                active_users = VALUES(active_users),
                new_users = VALUES(new_users),
                register_users = VALUES(register_users),
                valid_register_users = VALUES(valid_register_users),
                character_count = VALUES(character_count),
                yesterday_retention = VALUES(yesterday_retention),
                pay_users = VALUES(pay_users),
                new_pay_users = VALUES(new_pay_users),
                recharge_users = VALUES(recharge_users),
                recharge_times = VALUES(recharge_times),
                high_value_users = VALUES(high_value_users),
                high_value_users_200 = VALUES(high_value_users_200),
                consume_amount = VALUES(consume_amount),
                real_recharge_amount = VALUES(real_recharge_amount),
                high_value_recharge_amount = VALUES(high_value_recharge_amount),
                pay_amount = VALUES(pay_amount),
                new_pay_amount = VALUES(new_pay_amount),
                new_user_recharge = VALUES(new_user_recharge),
                pay_rate = VALUES(pay_rate),
                new_pay_rate = VALUES(new_pay_rate),
                active_arpu = VALUES(active_arpu),
                pay_arpu = VALUES(pay_arpu),
                new_arpu = VALUES(new_arpu),
                new_pay_arpu = VALUES(new_pay_arpu),
                updated_at = CURRENT_TIMESTAMP
        `;

        const params = [
            dateStr, channelCode || 'all', gameCode || 'all',
            stats.active_users, stats.new_users, stats.register_users, stats.valid_register_users,
            stats.character_count, stats.yesterday_retention, stats.pay_users, stats.new_pay_users,
            stats.recharge_users, stats.recharge_times, stats.high_value_users, stats.high_value_users_200,
            stats.consume_amount, stats.real_recharge_amount, stats.high_value_recharge_amount,
            stats.pay_amount, stats.new_pay_amount, stats.new_user_recharge,
            stats.pay_rate, stats.new_pay_rate, stats.active_arpu, stats.pay_arpu,
            stats.new_arpu, stats.new_pay_arpu
        ];

        await connection.execute(insertSql, params);
        logInfo(`保存每日统计数据成功: ${dateStr} - ${channelCode || 'all'} - ${gameCode || 'all'}`);

    } catch (error) {
        logError(`保存每日统计数据失败: ${error.message}`);
        throw error;
    }
}

/**
 * 保存LTV统计数据
 */
export async function saveLtvStats(connection, dateStr, channelCode, gameCode, ltvStats) {
    try {
        const insertSql = `
            INSERT INTO ltvstats (
                stat_date, channel_code, game_code, new_users,
                ltv1_amount, ltv1_arpu, ltv2_amount, ltv2_arpu, ltv3_amount, ltv3_arpu,
                ltv4_amount, ltv4_arpu, ltv5_amount, ltv5_arpu, ltv6_amount, ltv6_arpu,
                ltv7_amount, ltv7_arpu, ltv10_amount, ltv10_arpu, ltv20_amount, ltv20_arpu,
                ltv30_amount, ltv30_arpu
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                new_users = VALUES(new_users),
                ltv1_amount = VALUES(ltv1_amount), ltv1_arpu = VALUES(ltv1_arpu),
                ltv2_amount = VALUES(ltv2_amount), ltv2_arpu = VALUES(ltv2_arpu),
                ltv3_amount = VALUES(ltv3_amount), ltv3_arpu = VALUES(ltv3_arpu),
                ltv4_amount = VALUES(ltv4_amount), ltv4_arpu = VALUES(ltv4_arpu),
                ltv5_amount = VALUES(ltv5_amount), ltv5_arpu = VALUES(ltv5_arpu),
                ltv6_amount = VALUES(ltv6_amount), ltv6_arpu = VALUES(ltv6_arpu),
                ltv7_amount = VALUES(ltv7_amount), ltv7_arpu = VALUES(ltv7_arpu),
                ltv10_amount = VALUES(ltv10_amount), ltv10_arpu = VALUES(ltv10_arpu),
                ltv20_amount = VALUES(ltv20_amount), ltv20_arpu = VALUES(ltv20_arpu),
                ltv30_amount = VALUES(ltv30_amount), ltv30_arpu = VALUES(ltv30_arpu),
                updated_at = CURRENT_TIMESTAMP
        `;

        const params = [
            dateStr, channelCode || 'all', gameCode || 'all', ltvStats.new_users,
            ltvStats.ltv1_amount, ltvStats.ltv1_arpu, ltvStats.ltv2_amount, ltvStats.ltv2_arpu,
            ltvStats.ltv3_amount, ltvStats.ltv3_arpu, ltvStats.ltv4_amount, ltvStats.ltv4_arpu,
            ltvStats.ltv5_amount, ltvStats.ltv5_arpu, ltvStats.ltv6_amount, ltvStats.ltv6_arpu,
            ltvStats.ltv7_amount, ltvStats.ltv7_arpu, ltvStats.ltv10_amount, ltvStats.ltv10_arpu,
            ltvStats.ltv20_amount, ltvStats.ltv20_arpu, ltvStats.ltv30_amount, ltvStats.ltv30_arpu
        ];

        await connection.execute(insertSql, params);
        logInfo(`保存LTV统计数据成功: ${dateStr} - ${channelCode || 'all'} - ${gameCode || 'all'}`);

    } catch (error) {
        logError(`保存LTV统计数据失败: ${error.message}`);
        throw error;
    }
} 