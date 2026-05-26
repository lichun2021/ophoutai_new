// Telegram Bot 数据服务层
import { sql } from '../db';
import * as PaymentModel from '../model/payment';

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

import { getChinaDateString } from '../utils/timezone';

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
        FROM PaymentRecords
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
        FROM UserLoginLogs
        WHERE login_time >= ? AND login_time <= ?
    `;

    const loginResult: any = await sql({
        query: loginQuery,
        values: [todayStart, todayEnd]
    });

    // 查询在线人数（最近15分钟有登录记录的）
    const onlineQuery = `
        SELECT COUNT(DISTINCT username) as online_users
        FROM UserLoginLogs
        WHERE login_time >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    `;

    const onlineResult: any = await sql({
        query: onlineQuery,
        values: []
    });

    return {
        dateStr: today,
        recharge: rechargeResult[0],
        login: loginResult[0],
        online: onlineResult[0]
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
        FROM PaymentRecords pr 
        LEFT JOIN Users u ON pr.user_id = u.id 
        WHERE DATE(pr.created_at) = ? AND pr.payment_status = 3
        AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
    `;

    // 现金总订单数（不含平台币）
    const todayCashTotalQuery = `
        SELECT 
            COUNT(*) as count
        FROM PaymentRecords pr 
        WHERE DATE(pr.created_at) = ?
        AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
    `;

    // 平台币订单数
    const todayPtbTotalQuery = `
        SELECT 
            COUNT(*) as count
        FROM PaymentRecords pr 
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
        FROM PaymentRecords
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
        FROM PaymentRecords pr
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
 * 获取在线用户统计（基于 userloginlogs 登录日志，不使用 IDIP）
 * - 近 15 分钟登录过的不重复用户数（当前在线近似）
 * - 近 1 小时 / 今日登录用户数
 */
export const getOnlineStats = async () => {
    try {
        const today = getChinaDateString();

        const result = await sql({
            query: `
                SELECT
                    COUNT(DISTINCT CASE WHEN login_time >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) THEN username END) AS online_15m,
                    COUNT(DISTINCT CASE WHEN login_time >= DATE_SUB(NOW(), INTERVAL 60 MINUTE) THEN username END) AS online_1h,
                    COUNT(DISTINCT CASE WHEN DATE(login_time) = ? THEN username END) AS login_today
                FROM userloginlogs
                WHERE login_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `,
            values: [today],
        }) as any[];

        const row = result[0] || {};
        return {
            online15m:  Number(row.online_15m  || 0),
            online1h:   Number(row.online_1h   || 0),
            loginToday: Number(row.login_today || 0),
        };
    } catch (error) {
        console.error('[Bot在线查询] 失败:', error);
        return { online15m: 0, online1h: 0, loginToday: 0, error: String(error) };
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

