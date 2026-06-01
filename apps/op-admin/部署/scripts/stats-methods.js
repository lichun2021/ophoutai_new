/**
 * 统计计算方法
 */
import { logError, logInfo } from './config.js';

/**
 * 计算完整的日报统计数据
 */
export async function calculateComprehensiveStats(connection, dateStr, channelCode = '', gameCode = '') {
    try {
        // 构建基础查询条件
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

        // 1. 活跃用户数
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
        const [activeUsersResult] = await connection.execute(activeUsersQuery, loginParams);
        const activeUsers = activeUsersResult[0]?.count || 0;

        // 2. 注册数
        const registerUsersQuery = `
            SELECT COUNT(*) as count
            FROM users u
            WHERE DATE(u.created_at) = ? ${whereClause}
        `;
        const [registerUsersResult] = await connection.execute(registerUsersQuery, [dateStr, ...params]);
        const registerUsers = registerUsersResult[0]?.count || 0;

        // 3. 有效注册数
        const validRegisterUsersQuery = `
            SELECT COUNT(DISTINCT u.id) as count
            FROM users u
            JOIN gamecharacters gc ON u.id = gc.user_id
            WHERE DATE(u.created_at) = ? ${whereClause}
        `;
        const [validRegisterUsersResult] = await connection.execute(validRegisterUsersQuery, [dateStr, ...params]);
        const validRegisterUsers = validRegisterUsersResult[0]?.count || 0;

        // 返回基础统计数据
        return {
            active_users: activeUsers,
            new_users: registerUsers,
            register_users: registerUsers,
            valid_register_users: validRegisterUsers,
            character_count: 0,
            yesterday_retention: 0.0,
            pay_users: 0,
            new_pay_users: 0,
            recharge_users: 0,
            recharge_times: 0,
            high_value_users: 0,
            high_value_users_200: 0,
            consume_amount: 0.0,
            real_recharge_amount: 0.0,
            high_value_recharge_amount: 0.0,
            pay_amount: 0.0,
            new_pay_amount: 0.0,
            new_user_recharge: 0.0,
            pay_rate: 0.0,
            new_pay_rate: 0.0,
            active_arpu: 0.0,
            pay_arpu: 0.0,
            new_arpu: 0.0,
            new_pay_arpu: 0.0
        };

    } catch (error) {
        logError(`计算综合统计失败: ${error.message}`);
        return getEmptyStats();
    }
}

/**
 * 计算LTV统计数据
 */
export async function calculateLtvStats(connection, registerDate, channelCode = '', gameCode = '') {
    try {
        const ltvDays = [1, 2, 3, 4, 5, 6, 7, 10, 20, 30];
        const ltvStats = {};

        // 获取注册用户
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
        const [users] = await connection.execute(query, params);

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

        // 计算LTV数据
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
                const [ltvResult] = await connection.execute(ltvQuery, ltvParams);

                const totalAmount = parseFloat(ltvResult[0]?.total_amount || 0);
                const arpu = newUsersCount > 0 ? (totalAmount / newUsersCount) : 0.0;

                ltvStats[`ltv${days}_amount`] = totalAmount;
                ltvStats[`ltv${days}_arpu`] = arpu;
            } else {
                ltvStats[`ltv${days}_amount`] = 0.0;
                ltvStats[`ltv${days}_arpu`] = 0.0;
            }
        }

        ltvStats['new_users'] = newUsersCount;
        return ltvStats;

    } catch (error) {
        logError(`计算LTV统计失败: ${error.message}`);
        const result = { new_users: 0 };
        for (const days of [1, 2, 3, 4, 5, 6, 7, 10, 20, 30]) {
            result[`ltv${days}_amount`] = 0.0;
            result[`ltv${days}_arpu`] = 0.0;
        }
        return result;
    }
}

function getEmptyStats() {
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