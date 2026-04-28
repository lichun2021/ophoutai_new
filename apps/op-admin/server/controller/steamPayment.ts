/**
 * Steam 支付控制器
 * 
 * 独立于现有支付网关系统的 Steam 官方 Microtransaction 支付接口。
 * 
 * 流程：
 *   1. 客户端调用 POST /sdkapi/steam/initpay
 *   2. 后端调 InitTxn → 得到 Steam 支付URL → 生成 token 存 Redis → 返回带 return_url 的支付地址
 *   3. 用户在 Steam 界面直接确认支付
 *   4. Steam 回调 POST /api/payment/steam-notify → 验证 + FinalizeTxn + 通知游戏服
 * 
 * 路由：
 *   POST /sdkapi/steam/initpay     - 发起购买，返回 Steam 支付地址
 *   POST /sdkapi/steam/userinfo    - 获取 Steam 用户信息
 *   POST /api/payment/steam-notify - Steam 回调（放在后台回调路由中）
 */

import { H3Event, readBody, getHeaders, getQuery } from 'h3';
import { sql } from '../db';
import * as PaymentModel from '../model/payment';
import { Payment } from '../model/payment';
import {
    initTxn,
    finalizeTxn,
    queryTxn,
    getUserInfo,
    type SteamInitTxnRequest
} from '../utils/steamPayment';
import { getRedisCluster } from '../utils/redis-cluster';
import crypto from 'crypto';

// ========== 辅助函数 ==========

/**
 * 生成 Steam 订单号（64-bit unsigned，纯数字字符串）
 */
function generateSteamOrderId(): string {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
    return ts + rand;
}

/**
 * 生成随机 token
 */
function generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 将订单信息存入 Redis（token 映射订单）
 */
async function saveSteamOrderToRedis(token: string, orderData: Record<string, any>, ttlSeconds: number = 7200) {
    const redis = getRedisCluster();
    await redis.set(`steam_order:${token}`, JSON.stringify(orderData), 'EX', ttlSeconds);
}

/**
 * 从 Redis 读取订单信息
 */
async function getSteamOrderFromRedis(token: string): Promise<Record<string, any> | null> {
    const redis = getRedisCluster();
    const data = await redis.get(`steam_order:${token}`);
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * 通知游戏服到账
 */
async function notifyGameServerForSteam(orderDetail: any, orderId: string) {
    try {
        if (!orderDetail.wuid) {
            console.log('[Steam Pay] 无 wuid，跳过游戏服通知');
            return;
        }

        const { getSystemConfig } = await import('../utils/systemConfig');
        const { getByWorldId } = await import('../model/gameServers');
        const systemConfig = await getSystemConfig();

        let targetUrl = '';
        if (orderDetail.world_id && Number(orderDetail.world_id) > 0) {
            try {
                const serverCfg = await getByWorldId(Number(orderDetail.world_id));
                if (serverCfg && serverCfg.webhost) {
                    targetUrl = `${serverCfg.webhost.replace(/\/$/, '')}/update_pay_status`;
                }
            } catch { }
        }
        if (!targetUrl) {
            targetUrl = systemConfig.notify_game_url || 'http://160.202.240.19:8888/update_pay_status';
        }

        let port = '';
        if (orderDetail.server_url) {
            try {
                const urlObj = new URL(String(orderDetail.server_url));
                port = urlObj.port || '';
            } catch {
                port = String(orderDetail.server_url);
            }
        }

        console.log('[Steam Pay] 通知游戏服:', { targetUrl, orderId, wuid: orderDetail.wuid });

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionId: `steam_${orderId}`,
                uid: orderDetail.wuid,
                port: port
            }),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        console.log('[Steam Pay] 游戏服通知结果:', res.status);
    } catch (err: any) {
        console.error('[Steam Pay] 游戏服通知失败:', err.message);
    }
}

// ========== 控制器方法 ==========

/**
 * 发起 Steam 购买
 * 
 * 调用后返回 Steam 支付地址（带 return_url），客户端直接跳转/打开该地址。
 * 用户在 Steam 界面完成支付，支付结果通过 Steam 回调通知我们。
 * 
 * 请求体：
 * {
 *   steam_id: string,          // Steam 64-bit ID
 *   item_id: number,           // 商品ID
 *   item_name: string,         // 商品名称/描述
 *   amount: number,            // 金额（分），如 999 = ¥9.99
 *   currency: string,          // 货币 ("CNY"/"USD")，默认CNY
 *   qty: number,               // 数量，默认1
 *   language: string,          // 语言，默认 "zh"
 *   category: string,          // 分类（可选）
 *   // 以下为平台内部字段
 *   user_id: number,           // 平台用户ID（可选）
 *   sub_user_id: number,       // 子账号ID（可选）
 *   world_id: number,          // 游戏服ID（可选）
 *   server_url: string,        // 游戏服地址（可选）
 *   wuid: string,              // 游戏角色UID（可选）
 * }
 * 
 * 返回：
 * {
 *   code: 1,
 *   msg: 'success',
 *   data: {
 *     order_id: string,        // 平台订单号
 *     payurl: string,          // Steam 支付地址（客户端直接跳转）
 *     token: string            // 订单 token（可用于查询）
 *   }
 * }
 */
export const steamInitPay = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log('[Steam Pay] initpay 请求:', body);

        const {
            steam_id,
            item_id,
            item_name,
            amount,
            currency = 'CNY',
            qty = 1,
            language = 'zh',
            category,
            // 平台内部字段
            user_id,
            sub_user_id,
            world_id,
            server_url,
            wuid
        } = body;

        // 参数校验
        if (!steam_id) {
            return { code: -1, msg: '缺少 steam_id' };
        }
        if (!item_id || !amount) {
            return { code: -1, msg: '缺少 item_id 或 amount' };
        }

        // 生成订单号和 token
        const orderId = generateSteamOrderId();
        const token = generateToken();
        const amountInCents = parseInt(String(amount));
        const amountInYuan = (amountInCents / 100).toFixed(2);

        // 获取用户渠道信息
        let userChannelCode = '';
        let userGameCode = '';
        if (user_id) {
            const userResult = await sql({
                query: 'SELECT channel_code, game_code FROM Users WHERE id = ?',
                values: [user_id],
            }) as any[];
            if (userResult.length > 0) {
                userChannelCode = userResult[0].channel_code || '';
                userGameCode = userResult[0].game_code || '';
            }
        }

        // 获取客户端 IP
        let clientIp = '';
        try {
            const headers = getHeaders(evt);
            clientIp = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || '';
        } catch { }

        // 构建回调地址（steam-notify 放在后台 /api 路由下）
        const { getSystemConfig } = await import('../utils/systemConfig');
        const systemConfig = await getSystemConfig();
        const baseUrl = (systemConfig.base_url || '').replace(/\/+$/, '');
        const returnUrl = `${baseUrl}/api/payment/steam-notify?token=${token}`;

        // 1. 创建平台内部支付记录
        const paymentRecord: Omit<Payment, 'id' | 'created_at'> = {
            user_id: user_id || null,
            sub_user_id: sub_user_id || null,
            role_id: wuid || '',
            transaction_id: `steam_${orderId}`,
            wuid: wuid || '',
            payment_way: 'Steam',
            payment_id: 0,
            world_id: world_id || 0,
            product_name: item_name || `商品${item_id}`,
            product_des: `Steam购买 - SteamID:${steam_id}`,
            ip: clientIp,
            amount: parseFloat(amountInYuan),
            mch_order_id: orderId,
            msg: '',
            server_url: server_url || '',
            device: 'steam',
            channel_code: userChannelCode,
            game_code: userGameCode,
            payment_status: 0
        };

        await PaymentModel.insert(paymentRecord);
        console.log('[Steam Pay] 支付记录已创建:', orderId);

        // 2. 将订单信息存入 Redis（token → 订单映射，2小时过期）
        await saveSteamOrderToRedis(token, {
            order_id: orderId,
            steam_id: steam_id,
            item_id: item_id,
            amount: amountInCents,
            user_id: user_id || null,
            world_id: world_id || 0,
            wuid: wuid || '',
            server_url: server_url || '',
            created_at: Date.now()
        });

        console.log('[Steam Pay] 订单已存入 Redis, token:', token);

        // 3. 调用 Steam InitTxn（使用 web 模式，Steam 返回支付 URL）
        const initRequest: SteamInitTxnRequest = {
            steamId: steam_id,
            orderId: orderId,
            itemId: parseInt(String(item_id)),
            qty: parseInt(String(qty)) || 1,
            amount: amountInCents,
            description: item_name || `Item ${item_id}`,
            currency: currency,
            language: language,
            userSession: 'web',   // web 模式才有支付跳转 URL
            category: category
        };

        const result = await initTxn(initRequest);

        if (result.success) {
            // Steam 返回的支付 URL
            let payurl = result.steamurl || '';

            // 如果 Steam 返回了 URL，追加 return_url 参数
            if (payurl) {
                const separator = payurl.includes('?') ? '&' : '?';
                payurl = `${payurl}${separator}return_url=${encodeURIComponent(returnUrl)}`;
            }

            // 更新订单状态
            await PaymentModel.updateByTransactionId(`steam_${orderId}`, {
                payment_status: 1,
                msg: `等待Steam支付 - transid: ${result.transid || ''}, token: ${token}`
            } as any);

            return {
                code: 1,
                msg: 'success',
                data: {
                    order_id: orderId,
                    payurl: payurl,
                    token: token,
                    trans_id: result.transid || '',
                    transaction_id: `steam_${orderId}`
                }
            };
        } else {
            await PaymentModel.updateByTransactionId(`steam_${orderId}`, {
                payment_status: 2,
                msg: `InitTxn 失败: ${result.error || 'unknown'}`
            } as any);

            return {
                code: -1,
                msg: result.error || 'Steam InitTxn 失败',
                data: { order_id: orderId, errorCode: result.errorCode }
            };
        }
    } catch (e: any) {
        console.error('[Steam Pay] initpay 异常:', e);
        return { code: -1, msg: `系统错误: ${e.message}` };
    }
};

/**
 * 获取 Steam 用户信息（国家、货币、是否可购买）
 */
export const steamUserInfo = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { steam_id } = body;

        if (!steam_id) {
            return { code: -1, msg: '缺少 steam_id' };
        }

        const result = await getUserInfo(steam_id);

        if (result.success) {
            return {
                code: 1,
                msg: 'success',
                data: {
                    steam_id: result.steamid,
                    country: result.country,
                    currency: result.currency,
                    status: result.status
                }
            };
        } else {
            return { code: -1, msg: result.error || '获取用户信息失败' };
        }
    } catch (e: any) {
        console.error('[Steam Pay] userinfo 异常:', e);
        return { code: -1, msg: `系统错误: ${e.message}` };
    }
};

/**
 * Steam 支付回调通知
 * 
 * 放在 /api/payment/steam-notify 路由下（和 third-party-notify 平级）。
 * Steam 支付完成后会带着 token 回调到这个地址。
 * 
 * 流程：
 *   1. 从 query 参数读取 token
 *   2. 从 Redis 读取订单信息
 *   3. 调用 QueryTxn 验证交易状态
 *   4. 调用 FinalizeTxn 完成扣款
 *   5. 更新本地订单
 *   6. 通知游戏服到账
 *   7. 返回 success
 */
export const handleSteamNotify = async (evt: H3Event) => {
    try {
        // 支持 GET query 和 POST body 两种方式
        const query = getQuery(evt) || {};
        let body: any = {};
        try { body = await readBody(evt); } catch { }

        const token = String(query.token || body.token || '').trim();
        const orderid = String(query.orderid || body.orderid || '').trim();

        console.log('[Steam Pay] 收到回调:', { token, orderid, query, body });

        // 优先使用 token 从 Redis 查订单
        let orderId = orderid;
        let orderData: Record<string, any> | null = null;

        if (token) {
            orderData = await getSteamOrderFromRedis(token);
            if (orderData) {
                orderId = orderData.order_id;
                console.log('[Steam Pay] 从 Redis 获取订单:', orderId);
            }
        }

        if (!orderId) {
            console.error('[Steam Pay] 回调缺少订单信息');
            return 'FAIL';
        }

        // 1. 查询本地订单
        const orderDetail = await PaymentModel.detailByTransId(`steam_${orderId}`);
        if (!orderDetail) {
            console.error('[Steam Pay] 回调：订单不存在', orderId);
            return 'FAIL';
        }

        // 已完成不重复处理
        if (orderDetail.payment_status === 3) {
            console.log('[Steam Pay] 订单已完成，跳过:', orderId);
            return 'success';
        }

        // 2. 通过 QueryTxn 验证交易状态
        const queryResult = await queryTxn(orderId);
        if (!queryResult.success) {
            console.error('[Steam Pay] QueryTxn 失败:', queryResult.error);
            return 'FAIL';
        }

        const verifiedStatus = queryResult.status || '';
        console.log('[Steam Pay] 交易验证状态:', { orderId, verifiedStatus });

        // 3. 处理不同状态
        if (verifiedStatus === 'Approved') {
            // 用户已确认，调用 FinalizeTxn 完成扣款
            const finalResult = await finalizeTxn(orderId);
            if (!finalResult.success) {
                console.error('[Steam Pay] FinalizeTxn 失败:', finalResult.error);
                await PaymentModel.updateByTransactionId(`steam_${orderId}`, {
                    msg: `FinalizeTxn 失败: ${finalResult.error}`
                } as any);
                return 'FAIL';
            }
            console.log('[Steam Pay] FinalizeTxn 成功:', orderId);
        } else if (verifiedStatus === 'Failed' || verifiedStatus === 'Refunded') {
            // 失败或退款
            await PaymentModel.updateByTransactionId(`steam_${orderId}`, {
                payment_status: 2,
                msg: `Steam 状态: ${verifiedStatus}`
            } as any);
            return 'success';
        } else if (verifiedStatus === 'Init') {
            // 还没确认，正常返回等待
            console.log('[Steam Pay] 交易还在 Init 状态，等待用户确认');
            return 'success';
        }

        // verifiedStatus === 'Approved' || 'Succeeded' → 更新为成功
        if (verifiedStatus === 'Approved' || verifiedStatus === 'Succeeded') {
            // 4. 更新订单为成功
            await PaymentModel.updateByTransactionId(`steam_${orderId}`, {
                payment_status: 3,
                msg: `Steam 支付成功 - transid: ${queryResult.transid || ''}`
            } as any);

            // 5. 通知游戏服到账
            const freshOrder = orderData || orderDetail;
            await notifyGameServerForSteam(freshOrder, orderId);

            console.log('[Steam Pay] 订单完成:', orderId);
        }

        return 'success';
    } catch (e: any) {
        console.error('[Steam Pay] 回调处理异常:', e);
        return 'FAIL';
    }
};
