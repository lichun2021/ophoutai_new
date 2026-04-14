// Telegram Bot 数据服务层
import { sql } from '../db';
import * as PaymentModel from '../model/payment';
import * as GameServersModel from '../model/gameServers';

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
    
    const todayTotalQuery = `
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(pr.amount), 0) as amount 
        FROM PaymentRecords pr 
        LEFT JOIN Users u ON pr.user_id = u.id 
        WHERE DATE(pr.created_at) = ?
    `;
    
    const [todaySuccessResult, todayTotalResult]: any = await Promise.all([
        sql({ query: todaySuccessQuery, values: [today] }),
        sql({ query: todayTotalQuery, values: [today] })
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
        todayTotalCount: todayTotalResult[0].count,
        todayTotalAmount: parseFloat(todayTotalResult[0].amount).toFixed(2),
        // 详细分组
        byPaymentWay: paymentWayResult,
        byChannel: channelResult
    };
};

/**
 * 获取在线用户统计（从游戏服查询）
 */
export const getOnlineStats = async () => {
    try {
        // 获取所有启用的游戏服，count_online=0 的服不统计
        const servers = (await GameServersModel.listActive()).filter(s => (s as any).count_online !== 0);
        
        if (servers.length === 0) {
            return {
                totalOnline: 0,
                totalRegister: 0,
                servers: [],
                error: '没有启用的游戏服'
            };
        }

        const now = new Date();
        const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
        const sendTime = `${pad(now.getSeconds())}`;

        // 并行查询所有游戏服的在线数据
        const results = await Promise.allSettled(
            servers.map(async (server) => {
                const worldId = ((server as any).server_id ?? GameServersModel.extractWorldIdFromBName(server.bname || '')) || server.id || 1;
                const areaId = Number(worldId);
                const partition = 10000 + Number(worldId);
                const url = `${(server.webhost || '').replace(/\/$/, '')}/script/idip/4295`;

                try {
                    console.log(`[Bot在线查询] ${server.name} - 请求在线数据`);
                    
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            head: {
                                Cmdid: 10282085,
                                Seqid: 1,
                                ServiceName: 'idip',
                                SendTime: sendTime,
                                PlatId: 1, // 不区分平台，返回总在线数
                                AreaId: areaId,
                                Partition: partition
                            },
                            body: {}
                        }),
                        signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
                    });

                    const json = await res.json().catch(() => ({}));
                    const body: any = (json && json.body) || {};

                    const registerNum = Number(body.RegisterNum || 0);
                    const onlineNum = Number(body.OnlineNum || 0);
                    const onlineIOS = Number(body.IosOnlineNum || 0);
                    const onlineAndroid = Number(body.AndroidOnlineNum || 0);

                    console.log(`[Bot在线查询] ${server.name} - 在线: ${onlineNum}, 注册: ${registerNum}`);

                    return {
                        id: server.id,
                        name: server.name,
                        register: registerNum,
                        online: onlineNum,
                        onlineAndroid: onlineAndroid,
                        onlineIOS: onlineIOS
                    };
                } catch (err: any) {
                    console.error(`[Bot在线查询] ${server.name} - 失败:`, err.message);
                    return {
                        id: server.id,
                        name: server.name,
                        register: 0,
                        online: 0,
                        onlineAndroid: 0,
                        onlineIOS: 0,
                        error: err.message
                    };
                }
            })
        );

        // 统计总在线数和注册数
        let totalOnline = 0;
        let totalRegister = 0;
        const serverStats: any[] = [];

        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
                const data = result.value;
                totalOnline += data.online;
                totalRegister += data.register;
                serverStats.push(data);
            }
        });

        return {
            totalOnline,
            totalRegister,
            servers: serverStats
        };
    } catch (error) {
        console.error('[Bot在线查询] 失败:', error);
        return {
            totalOnline: 0,
            totalRegister: 0,
            servers: [],
            error: String(error)
        };
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

