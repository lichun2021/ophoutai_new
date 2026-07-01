// Telegram Bot 数据服务层
import { sql } from '../db';
import * as PaymentModel from '../model/payment';
import { listActive, extractWorldIdFromBName } from '../model/gameServers';
import { createGameServerClient } from '../controller/gameServerClient';

// 获取今天的日期范围（中国时区）
const getTodayRange = () => {
    const now = new Date();
    const offset = 8 * 60; // 中国时区 UTC+8
    const chinaTime = new Date(now.getTime() + offset * 60 * 1000);

    const year = chinaTime.getUTCFullYear();
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(chinaTime.getUTCDate()).padStart(2, '0');

    const todayStart = `${year}-${month}-${day} 00:00:00`;
    const todayEnd = `${year}-${month}-${day} 23:59:59`;

    return { todayStart, todayEnd, dateStr: `${year}-${month}-${day}` };
};

import { getChinaDateString, getChinaYesterdayString } from '../utils/timezone';

/**
 * 获取今日综合统计数据
 */
export const getTodayStats = async () => {
    const today = getChinaDateString();

    // 查询今日充值数据（与后台逻辑一致：payment_status = 3 表示成功，排除平台币支付）
    const rechargeQuery = `
        SELECT 
            COUNT(*) as total_orders,
            COUNT(DISTINCT user_id) as unique_users,
            SUM(CASE WHEN payment_status = 3 THEN amount ELSE 0 END) as success_amount,
            SUM(CASE WHEN payment_status = 3 THEN 1 ELSE 0 END) as success_orders
        FROM paymentrecords
        WHERE DATE(created_at) = ?
        AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
    `;

    const rechargeResult: any = await sql({
        query: rechargeQuery,
        values: [today]
    });

    // 查询今日登录数据
    const { todayStart, todayEnd } = getTodayRange();
    const loginQuery = `
        SELECT 
            COUNT(*) as total_logins,
            COUNT(DISTINCT username) as unique_users
        FROM userloginlogs
        WHERE login_time >= ? AND login_time <= ?
    `;

    const loginResult: any = await sql({
        query: loginQuery,
        values: [todayStart, todayEnd]
    });

    // 查询在线人数（最近15分钟有登录记录的）
    const onlineQuery = `
        SELECT COUNT(DISTINCT username) as online_users
        FROM userloginlogs
        WHERE login_time >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    `;

    const onlineResult: any = await sql({
        query: onlineQuery,
        values: []
    });

    // 昨日留存率：昨日注册用户中，今日有登录的占比（D1 留存）
    const yesterday = getChinaYesterdayString();
    const retentionQuery = `
        SELECT
            COUNT(DISTINCT u.id) AS reg,
            COUNT(DISTINCT CASE WHEN ull.username IS NOT NULL THEN u.id END) AS retained
        FROM users u
        LEFT JOIN userloginlogs ull
            ON u.username = ull.username AND DATE(ull.login_time) = ?
        WHERE DATE(u.created_at) = ?
    `;
    const retentionResult: any = await sql({
        query: retentionQuery,
        values: [today, yesterday]
    });
    const regUsers = retentionResult[0]?.reg || 0;
    const retainedUsers = retentionResult[0]?.retained || 0;
    const retentionRate = regUsers > 0
        ? Math.min(100, (retainedUsers / regUsers) * 100)
        : 0;

    // 新增付费用户数：首次付费日 = 今日（排除平台币）
    const newPayQuery = `
        SELECT COUNT(*) AS new_pay_users
        FROM (
            SELECT user_id, DATE(MIN(created_at)) AS first_pay_date
            FROM paymentrecords
            WHERE payment_status = 3
              AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
            GROUP BY user_id
            HAVING first_pay_date = ?
        ) t
    `;
    const newPayResult: any = await sql({
        query: newPayQuery,
        values: [today]
    });
    const newPayUsers = newPayResult[0]?.new_pay_users || 0;

    // 充值超100用户数：今日累计充值 > 100（排除平台币）
    const highValueQuery = `
        SELECT COUNT(*) AS high_value_users
        FROM (
            SELECT user_id, SUM(amount) AS day_amount
            FROM paymentrecords
            WHERE payment_status = 3
              AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
              AND DATE(created_at) = ?
            GROUP BY user_id
            HAVING day_amount > 100
        ) t
    `;
    const highValueResult: any = await sql({
        query: highValueQuery,
        values: [today]
    });
    const highValueUsers = highValueResult[0]?.high_value_users || 0;

    return {
        dateStr: today,
        recharge: rechargeResult[0],
        login: loginResult[0],
        online: onlineResult[0],
        retention: {
            reg_users: regUsers,
            retained_users: retainedUsers,
            rate: Math.round(retentionRate * 100) / 100
        },
        newPayUsers,
        highValueUsers
    };
};

/**
 * 获取今日充值详细数据（按支付方式和渠道）
 * 复用后台支付数据页面的统计逻辑
 */
export const getTodayRechargeDetails = async () => {
    const today = getChinaDateString();

    // 1. 今日总体统计（与后台卡片一致）
    const todaySuccessQuery = `
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(pr.amount), 0) as amount 
        FROM paymentrecords pr 
        LEFT JOIN users u ON pr.user_id = u.id 
        WHERE DATE(pr.created_at) = ? AND pr.payment_status = 3
        AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
    `;

    // 现金总订单数（不含平台币）
    const todayCashTotalQuery = `
        SELECT 
            COUNT(*) as count
        FROM paymentrecords pr 
        WHERE DATE(pr.created_at) = ?
        AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
    `;

    // 平台币订单数
    const todayPtbTotalQuery = `
        SELECT 
            COUNT(*) as count
        FROM paymentrecords pr 
        WHERE DATE(pr.created_at) = ?
        AND pr.payment_way LIKE '%平台币%'
    `;

    const [todaySuccessResult, todayCashTotalResult, todayPtbTotalResult]: any = await Promise.all([
        sql({ query: todaySuccessQuery, values: [today] }),
        sql({ query: todayCashTotalQuery, values: [today] }),
        sql({ query: todayPtbTotalQuery, values: [today] })
    ]);

    // 2. 按支付方式统计
    const paymentWayQuery = `
        SELECT 
            payment_way,
            COUNT(*) as order_count,
            SUM(CASE WHEN payment_status = 3 THEN amount ELSE 0 END) as success_amount,
            SUM(CASE WHEN payment_status = 3 THEN 1 ELSE 0 END) as success_count
        FROM paymentrecords
        WHERE DATE(created_at) = ?
        AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
        GROUP BY payment_way
        ORDER BY success_amount DESC
    `;

    const paymentWayResult: any = await sql({
        query: paymentWayQuery,
        values: [today]
    });

    // 3. 按渠道统计 TOP5
    const channelQuery = `
        SELECT 
            pr.channel_code,
            COUNT(*) as order_count,
            SUM(CASE WHEN pr.payment_status = 3 THEN pr.amount ELSE 0 END) as success_amount,
            SUM(CASE WHEN pr.payment_status = 3 THEN 1 ELSE 0 END) as success_count
        FROM paymentrecords pr
        WHERE DATE(pr.created_at) = ?
        AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
        GROUP BY pr.channel_code
        ORDER BY success_amount DESC
        LIMIT 5
    `;

    const channelResult: any = await sql({
        query: channelQuery,
        values: [today]
    });

    return {
        dateStr: today,
        // 总体统计（与后台卡片一致）
        todaySuccessCount: todaySuccessResult[0].count,
        todaySuccessAmount: parseFloat(todaySuccessResult[0].amount).toFixed(2),
        todayCashTotalCount: todayCashTotalResult[0].count,   // 现金订单总数
        todayPtbTotalCount: todayPtbTotalResult[0].count,     // 平台币订单总数
        // 详细分组
        byPaymentWay: paymentWayResult,
        byChannel: channelResult
    };
};

/**
 * 获取在线用户统计
 * 复用后台"在线玩家"页面的 REST 查询逻辑，结果与页面一致
 */
export const getOnlineStats = async () => {
    try {
        const allServers = await listActive();
        const servers = allServers.filter(s => (s as any).count_online !== 0);

        if (servers.length === 0) {
            return { totalOnline: 0, totalRegister: 0, servers: [], error: '没有启用的游戏服' };
        }

        const results = await Promise.allSettled(servers.map(async (s) => {
            const worldId = ((s as any).server_id ?? extractWorldIdFromBName(s.bname || '')) || s.id || 1;
            const areaId = Number(worldId);
            const webhost = (s.webhost || '').replace(/\/$/, '');

            try {
                const client = createGameServerClient(webhost, 'rest', 3000);
                const resp = await client.getServerStatus({ serverId: String(worldId), areaId });
                const data = resp.data || {} as any;
                return {
                    id: s.id,
                    name: s.name,
                    register: data.registerCount || 0,
                    online: data.onlineCount || 0,
                    onlineAndroid: data.onlineAndroid || 0,
                    onlineIOS: data.onlineIOS || 0,
                };
            } catch (err: any) {
                console.error(`[Bot在线查询] ${s.name} 失败:`, err.message);
                return { id: s.id, name: s.name, register: 0, online: 0, onlineAndroid: 0, onlineIOS: 0, error: err.message };
            }
        }));

        let totalOnline = 0;
        let totalRegister = 0;
        const serverStats: any[] = [];
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                totalOnline += r.value.online;
                totalRegister += r.value.register;
                serverStats.push(r.value);
            }
        });

        return { totalOnline, totalRegister, servers: serverStats };
    } catch (error) {
        console.error('[Bot在线查询] 失败:', error);
        return { totalOnline: 0, totalRegister: 0, servers: [], error: String(error) };
    }
};


/**
 * 查询订单详情
 * 方式1：直接调用 Model（当前使用）
 */
export const getOrderDetail = async (orderId: string) => {
    // 使用 PaymentModel 的方法查询
    let order = await PaymentModel.detailByTransId(orderId);

    // 如果按交易ID没找到，尝试按第三方订单号查找
    if (!order) {
        order = await PaymentModel.detailByMchOrderId(orderId);
    }

    return order;
};

