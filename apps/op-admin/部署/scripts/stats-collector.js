import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError } from './config.js';

class StatsCollector {
    constructor() {
        this.connection = null;
    }

    async connectDB() {
        try {
            this.connection = await mysql.createConnection(DB_CONFIG);
            logInfo('Database connected successfully');
        } catch (error) {
            logError(`Database connection failed: ${error.message}`);
            throw error;
        }
    }

    async getChannels() {
        try {
            const [rows] = await this.connection.execute(
                "SELECT DISTINCT channel_code FROM paymentrecords WHERE channel_code != '' AND channel_code IS NOT NULL " +
                "UNION " +
                "SELECT DISTINCT channel_code FROM users WHERE channel_code != '' AND channel_code IS NOT NULL"
            );
            return rows.map(row => row.channel_code);
        } catch (error) {
            logError(`Failed to get channels: ${error.message}`);
            return [];
        }
    }

    async getGames() {
        try {
            const [rows] = await this.connection.execute(
                "SELECT game_code, game_name FROM games WHERE is_active = 1 ORDER BY game_code"
            );
            const games = rows.filter(row => row.game_code).map(row => ({
                code: row.game_code,
                name: row.game_name
            }));
            logInfo(`Found ${games.length} active games`);
            return games;
        } catch (error) {
            logError(`Failed to get games: ${error.message}`);
            return [];
        }
    }

    async calculateBasicStats(dateStr, channelCode = '', gameCode = '') {
        try {
            const conditions = [];
            const params = [];

            if (channelCode && channelCode !== 'all') {
                conditions.push("u.channel_code = ?");
                params.push(channelCode);
            }

            if (gameCode && gameCode !== 'all') {
                conditions.push("u.game_code = ?");
                params.push(gameCode);
            }

            const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

            // Active users
            const loginConditions = ["DATE(ull.login_time) = ?"];
            const loginParams = [dateStr];

            if (channelCode && channelCode !== 'all') {
                loginConditions.push("ull.channel_code = ?");
                loginParams.push(channelCode);
            }

            if (gameCode && gameCode !== 'all') {
                loginConditions.push("ull.game_code = ?");
                loginParams.push(gameCode);
            }

            const activeUsersQuery = `
                SELECT COUNT(DISTINCT ull.username) as count
                FROM userloginlogs ull
                WHERE ${loginConditions.join(' AND ')}
            `;
            const [activeUsersResult] = await this.connection.execute(activeUsersQuery, loginParams);
            const activeUsers = activeUsersResult[0]?.count || 0;

            // New users
            const registerUsersQuery = `
                SELECT COUNT(*) as count
                FROM users u
                WHERE DATE(u.created_at) = ? ${whereClause}
            `;
            const [registerUsersResult] = await this.connection.execute(registerUsersQuery, [dateStr, ...params]);
            const registerUsers = registerUsersResult[0]?.count || 0;

            // Valid register users
            const validRegisterUsersQuery = `
                SELECT COUNT(DISTINCT u.id) as count
                FROM users u
                JOIN gamecharacters gc ON u.id = gc.user_id
                WHERE DATE(u.created_at) = ? ${whereClause}
            `;
            const [validRegisterUsersResult] = await this.connection.execute(validRegisterUsersQuery, [dateStr, ...params]);
            const validRegisterUsers = validRegisterUsersResult[0]?.count || 0;

            // Character count
            const characterCountQuery = `
                SELECT COUNT(gc.id) as count
                FROM gamecharacters gc
                JOIN users u ON gc.user_id = u.id
                WHERE DATE(u.created_at) = ? ${whereClause}
            `;
            const [characterCountResult] = await this.connection.execute(characterCountQuery, [dateStr, ...params]);
            const characterCount = characterCountResult[0]?.count || 0;

            // Payment stats - 更新查询以适配新表结构
            const paymentConditions = ["pr.payment_status = 3", "DATE(pr.created_at) = ?"];
            const paymentParams = [dateStr];

            // 排除平台币支付（只统计真实充值，客服支付算真实充值）
            paymentConditions.push("pr.payment_way NOT LIKE '%平台币%'");
            paymentConditions.push("pr.payment_way NOT LIKE '%platform%'");

            if (channelCode && channelCode !== 'all') {
                paymentConditions.push("pr.channel_code = ?");
                paymentParams.push(channelCode);
            }

            if (gameCode && gameCode !== 'all') {
                paymentConditions.push("pr.game_code = ?");
                paymentParams.push(gameCode);
            }

            const realPayStatsQuery = `
                SELECT 
                    COUNT(DISTINCT pr.user_id) as pay_users,
                    COUNT(pr.id) as recharge_times,
                    COALESCE(SUM(pr.amount), 0) as real_recharge_amount
                FROM paymentrecords pr
                WHERE ${paymentConditions.join(' AND ')}
            `;
            const [realPayResult] = await this.connection.execute(realPayStatsQuery, paymentParams);
            const payUsers = realPayResult[0]?.pay_users || 0;
            const rechargeTimes = realPayResult[0]?.recharge_times || 0;
            const realRechargeAmount = parseFloat(realPayResult[0]?.real_recharge_amount || 0);

            // Calculate rates and ARPU
            let payRate = activeUsers > 0 ? (payUsers / activeUsers * 100) : 0.0;
            
            // 限制 payRate 在合理范围内 (0-100%)
            if (payRate > 100) {
                console.warn(`[${channelCode}] [${gameCode}] ${dateStr} 付费率异常: ${payRate.toFixed(2)}% (付费用户${payUsers}/活跃用户${activeUsers}), 限制为100%`);
                payRate = 100.0;
            }
            if (payRate < 0) {
                console.warn(`[${channelCode}] [${gameCode}] ${dateStr} 付费率为负: ${payRate.toFixed(2)}%, 设置为0%`);
                payRate = 0.0;
            }
            
            const activeArpu = activeUsers > 0 ? (realRechargeAmount / activeUsers) : 0.0;
            const payArpu = payUsers > 0 ? (realRechargeAmount / payUsers) : 0.0;

            return {
                active_users: activeUsers,
                new_users: registerUsers,
                register_users: registerUsers,
                valid_register_users: validRegisterUsers,
                character_count: characterCount,
                yesterday_retention: 0.0,
                pay_users: payUsers,
                new_pay_users: 0,
                recharge_users: payUsers,
                recharge_times: rechargeTimes,
                high_value_users: 0,
                high_value_users_200: 0,
                consume_amount: Math.round(realRechargeAmount * 100) / 100,
                real_recharge_amount: Math.round(realRechargeAmount * 100) / 100,
                high_value_recharge_amount: 0.0,
                pay_amount: Math.round(realRechargeAmount * 100) / 100,
                new_pay_amount: 0.0,
                new_user_recharge: 0.0,
                pay_rate: Math.round(payRate * 100) / 100,
                new_pay_rate: 0.0,
                active_arpu: Math.round(activeArpu * 100) / 100,
                pay_arpu: Math.round(payArpu * 100) / 100,
                new_arpu: 0.0,
                new_pay_arpu: 0.0
            };

        } catch (error) {
            logError(`Calculate basic stats failed: ${error.message}`);
            return this.getEmptyStats();
        }
    }

    async calculateLtvStats(registerDate, channelCode = '', gameCode = '') {
        try {
            const ltvDays = [1, 2, 3, 4, 5, 6, 7, 10, 20, 30];
            const ltvStats = {};

            // Get registered users for the date
            const conditions = ["DATE(created_at) = ?"];
            const params = [registerDate];

            if (channelCode && channelCode !== 'all') {
                conditions.push("channel_code = ?");
                params.push(channelCode);
            }

            if (gameCode && gameCode !== 'all') {
                conditions.push("game_code = ?");
                params.push(gameCode);
            }

            const query = `SELECT id FROM users WHERE ${conditions.join(' AND ')}`;
            const [users] = await this.connection.execute(query, params);

            const userIds = users.map(row => row.id);
            const newUsersCount = userIds.length;

            if (newUsersCount === 0) {
                const result = { new_users: 0 };
                for (const days of ltvDays) {
                    result[`ltv${days}_amount`] = 0.0;
                    result[`ltv${days}_arpu`] = 0.0;
                }
                return result;
            }

            // Calculate LTV for each period
            for (const days of ltvDays) {
                const ltvEndDate = new Date(registerDate);
                ltvEndDate.setDate(ltvEndDate.getDate() + days - 1);
                const ltvEndDateStr = ltvEndDate.toISOString().split('T')[0];

                if (userIds.length > 0) {
                    const placeholders = userIds.map(() => '?').join(',');
                    const ltvQuery = `
                        SELECT COALESCE(SUM(amount), 0) as total_amount
                        FROM paymentrecords 
                        WHERE payment_status = 3 
                        AND payment_way NOT LIKE '%平台币%'
                        AND payment_way NOT LIKE '%platform%'
                        AND user_id IN (${placeholders})
                        AND DATE(created_at) BETWEEN ? AND ?
                    `;
                    const ltvParams = [...userIds, registerDate, ltvEndDateStr];
                    const [ltvResult] = await this.connection.execute(ltvQuery, ltvParams);

                    const totalAmount = parseFloat(ltvResult[0]?.total_amount || 0);
                    const arpu = newUsersCount > 0 ? (totalAmount / newUsersCount) : 0.0;

                    ltvStats[`ltv${days}_amount`] = Math.round(totalAmount * 100) / 100;
                    ltvStats[`ltv${days}_arpu`] = Math.round(arpu * 100) / 100;
                } else {
                    ltvStats[`ltv${days}_amount`] = 0.0;
                    ltvStats[`ltv${days}_arpu`] = 0.0;
                }
            }

            ltvStats['new_users'] = newUsersCount;
            return ltvStats;

        } catch (error) {
            logError(`Calculate LTV stats failed: ${error.message}`);
            const result = { new_users: 0 };
            for (const days of [1, 2, 3, 4, 5, 6, 7, 10, 20, 30]) {
                result[`ltv${days}_amount`] = 0.0;
                result[`ltv${days}_arpu`] = 0.0;
            }
            return result;
        }
    }

    async saveDailyStats(dateStr, channelCode, gameCode, stats) {
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
                dateStr, channelCode, gameCode,
                stats.active_users, stats.new_users, stats.register_users, stats.valid_register_users,
                stats.character_count, stats.yesterday_retention, stats.pay_users, stats.new_pay_users,
                stats.recharge_users, stats.recharge_times, stats.high_value_users, stats.high_value_users_200,
                stats.consume_amount, stats.real_recharge_amount, stats.high_value_recharge_amount,
                stats.pay_amount, stats.new_pay_amount, stats.new_user_recharge,
                stats.pay_rate, stats.new_pay_rate, stats.active_arpu, stats.pay_arpu,
                stats.new_arpu, stats.new_pay_arpu
            ];

            await this.connection.execute(insertSql, params);
            logInfo(`Daily stats saved: ${dateStr} - ${channelCode} - ${gameCode}`);

        } catch (error) {
            logError(`Save daily stats failed: ${error.message}`);
            throw error;
        }
    }

    async saveLtvStats(dateStr, channelCode, gameCode, ltvStats) {
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
                dateStr, channelCode, gameCode, ltvStats.new_users,
                ltvStats.ltv1_amount, ltvStats.ltv1_arpu, ltvStats.ltv2_amount, ltvStats.ltv2_arpu,
                ltvStats.ltv3_amount, ltvStats.ltv3_arpu, ltvStats.ltv4_amount, ltvStats.ltv4_arpu,
                ltvStats.ltv5_amount, ltvStats.ltv5_arpu, ltvStats.ltv6_amount, ltvStats.ltv6_arpu,
                ltvStats.ltv7_amount, ltvStats.ltv7_arpu, ltvStats.ltv10_amount, ltvStats.ltv10_arpu,
                ltvStats.ltv20_amount, ltvStats.ltv20_arpu, ltvStats.ltv30_amount, ltvStats.ltv30_arpu
            ];

            await this.connection.execute(insertSql, params);
            logInfo(`LTV stats saved: ${dateStr} - ${channelCode} - ${gameCode}`);

        } catch (error) {
            logError(`Save LTV stats failed: ${error.message}`);
            throw error;
        }
    }

    async collectDailyStats(targetDate = null) {
        const dateStr = targetDate || new Date().toISOString().split('T')[0];
        logInfo(`Starting daily stats collection: ${dateStr}`);

        try {
            const channels = await this.getChannels();

            // 1. 各渠道单独统计（game_code 传 '' 表示不过滤）
            for (const channel of channels) {
                await this.collectChannelGameDailyStats(dateStr, channel, '');
            }

            // 2. 全渠道汇总（channel_code = 'all'）
            await this.collectChannelGameDailyStats(dateStr, 'all', '');

            logInfo(`Daily stats collection completed: ${dateStr}`);
        } catch (error) {
            logError(`Daily stats collection failed: ${error.message}`);
            throw error;
        }
    }

    async collectLtvStats(targetDate = null) {
        const dateStr = targetDate || new Date().toISOString().split('T')[0];
        logInfo(`Starting LTV stats collection: ${dateStr}`);

        try {
            const channels = await this.getChannels();

            // 各渠道单独统计
            for (const channel of channels) {
                await this.collectChannelGameLtvStats(dateStr, channel, '');
            }

            // 全渠道汇总
            await this.collectChannelGameLtvStats(dateStr, 'all', '');

            logInfo(`LTV stats collection completed: ${dateStr}`);
        } catch (error) {
            logError(`LTV stats collection failed: ${error.message}`);
            throw error;
        }
    }

    async collectChannelGameDailyStats(dateStr, channelCode, gameCode) {
        try {
            const stats = await this.calculateBasicStats(dateStr, channelCode, gameCode);
            await this.saveDailyStats(dateStr, channelCode, gameCode, stats);
        } catch (error) {
            logError(`Channel game stats failed: ${channelCode}-${gameCode} ${dateStr}: ${error.message}`);
        }
    }

    async collectChannelGameLtvStats(dateStr, channelCode, gameCode) {
        try {
            const ltvStats = await this.calculateLtvStats(dateStr, channelCode, gameCode);
            await this.saveLtvStats(dateStr, channelCode, gameCode, ltvStats);
        } catch (error) {
            logError(`Channel game LTV stats failed: ${channelCode}-${gameCode} ${dateStr}: ${error.message}`);
        }
    }

    getEmptyStats() {
        return {
            active_users: 0, new_users: 0, register_users: 0, valid_register_users: 0,
            character_count: 0, yesterday_retention: 0.0, pay_users: 0, new_pay_users: 0,
            recharge_users: 0, recharge_times: 0, high_value_users: 0, high_value_users_200: 0,
            consume_amount: 0.0, real_recharge_amount: 0.0, high_value_recharge_amount: 0.0,
            pay_amount: 0.0, new_pay_amount: 0.0, new_user_recharge: 0.0,
            pay_rate: 0.0, new_pay_rate: 0.0, active_arpu: 0.0, pay_arpu: 0.0,
            new_arpu: 0.0, new_pay_arpu: 0.0
        };
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            logInfo('Database connection closed');
        }
    }
}

export default StatsCollector;