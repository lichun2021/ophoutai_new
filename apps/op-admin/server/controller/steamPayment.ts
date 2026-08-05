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
import * as GameCharactersModel from '../model/gameCharacters';
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
 * 通知游戏服到账（API 到账，和普通充値逻辑相同）
 */
async function notifyGameServerForSteam(orderDetail: any, orderId: string) {
    const transactionId = `steam_${orderId}`;
    try {
        if (!orderDetail.wuid) {
            console.log('[Steam Pay] 无 wuid，跳过游戏服通知');
            return;
        }

        const { getRechargeConfig } = await import('../utils/rechargeConfig');
        const { getByWorldId } = await import('../model/gameServers');

        // item_id 存在 product_des 里（如 com.tencent.tmgp.hjol.diamond_60）
        const itemId = orderDetail.product_des || orderDetail.item_id || '';
        const config = itemId ? getRechargeConfig(String(itemId)) : null;

        if (!config) {
            console.warn('[Steam Pay] 找不到商品配置，item_id:', itemId);
            await PaymentModel.updateByTransactionId(transactionId, {
                msg: `API到账找不到商品配置:${itemId}`
            } as any);
            return;
        }

        // 判断 iOS / Android，并获取真实的游戏角色 uuid（游戏服认识的 playerId）
        let finalGoodsId = config.andid || config.id;
        const wuid = String(orderDetail.wuid);  // 系统内部的子账号 ID
        let playerId = wuid;                     // 默认兜底用 wuid

        try {
            // orderDetail.wuid 实际上是 SubUsers.id（主键），不是 wuid 字段
            const subuserId = Number(wuid);
            const charRows = await sql({
                query: 'SELECT uuid, ext FROM GameCharacters WHERE subuser_id = ? ORDER BY last_login_at DESC LIMIT 1',
                values: [subuserId]
            }) as any[];

            if (charRows.length > 0) {
                playerId = charRows[0].uuid;
                console.log('[Steam Pay] 角色 uuid:', playerId, '(subuser_id:', subuserId, ')');

                // 判断 iOS/Android
                const extRaw = charRows[0].ext;
                let extObj: any = {};
                try { extObj = typeof extRaw === 'string' ? JSON.parse(extRaw) : (extRaw || {}); } catch { }
                if (extObj?.value === 'ios') {
                    finalGoodsId = config.id;
                    console.log('[Steam Pay] API到账--iOS, goodsId:', finalGoodsId);
                } else {
                    finalGoodsId = config.andid || config.id;
                    console.log('[Steam Pay] API到账--Android, goodsId:', finalGoodsId);
                }
            } else {
                console.warn('[Steam Pay] subuser_id=', subuserId, '无 GameCharacters 记录，使用 wuid 兜底');
            }

        } catch (e: any) {
            console.error('[Steam Pay] 查角色 uuid 失败:', e.message);
        }

        // 查询服务器 webhost
        const worldId = Number(orderDetail.world_id);
        if (!worldId) {
            console.warn('[Steam Pay] 无 world_id，无法确定游戏服');
            await PaymentModel.updateByTransactionId(transactionId, { msg: 'API到账失败:无world_id' } as any);
            return;
        }
        const serverCfg = await getByWorldId(worldId);
        if (!serverCfg || !serverCfg.webhost) {
            console.warn('[Steam Pay] 未找到服务器配置, world_id:', worldId);
            await PaymentModel.updateByTransactionId(transactionId, { msg: `API到账失败:未找到服务器world_id=${worldId}` } as any);
            return;
        }

        const webhost = serverCfg.webhost.replace(/\/$/, '');
        const billno = orderDetail.order_id || orderId;
        const rechargeUrl = `${webhost}/script/gmRecharge?playerId=${playerId}&rechargeType=${config.rechargeType}&goodsId=${finalGoodsId}&billno=${billno}`;

        console.log('[Steam Pay] API到账请求2:', rechargeUrl);

        const res = await fetch(rechargeUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
        });
        const responseText = await res.text();

        let isSuccess = false;
        try {
            const result = JSON.parse(responseText);
            isSuccess = result.code === 0 || result.msg === 'success' ||
                (result.result && String(result.result).toLowerCase().includes('success'));
            if (isSuccess) {
                console.log('[Steam Pay] API到账成功:', { orderId, playerRoleId, finalGoodsId, result });
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 3,
                    msg: `API到账成功:${JSON.stringify(result).substring(0, 500)}`
                } as any);
            } else {
                console.error('[Steam Pay] API到账失败:', result);
                await PaymentModel.updateByTransactionId(transactionId, {
                    msg: `API到账失败:${JSON.stringify(result).substring(0, 500)}`
                } as any);
            }
        } catch {
            if (responseText.trim().toLowerCase() === 'success') {
                isSuccess = true;
                console.log('[Steam Pay] API到账成功(纯文本):', { orderId });
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 3,
                    msg: 'API到账成功:纯文本响应'
                } as any);
            } else {
                console.error('[Steam Pay] API到账响应解析失败:', responseText.substring(0, 200));
                await PaymentModel.updateByTransactionId(transactionId, {
                    msg: `API到账响应解析失败:${responseText.substring(0, 200)}`
                } as any);
            }
        }
    } catch (err: any) {
        console.error('[Steam Pay] API到账异常:', err.message);
        await PaymentModel.updateByTransactionId(transactionId, {
            msg: `API到账异常:${err.message}`
        } as any);
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
            steam_id: _steam_id,
            item_id: _item_id,
            item_name: _item_name,
            amount: _amount,
            currency = 'CNY',
            qty = 1,
            language = 'zh',
            category,
            // 平台内部字段
            user_id,
            sub_user_id,
            world_id: _world_id,
            server_url,
            wuid: _wuid,
            // 兼容通用 SDK 参数格式
            k, p, c, x, h, y, f
        } = body;

        // 参数兼容映射：优先用专用字段，回退到通用 SDK 参数
        const steam_id = _steam_id || c || '';   // steam_id 或 c(设备/steamid)
        const item_id = _item_id || k || y || ''; // item_id 或 k(商品名) 或 y(attachInfo)
        const item_name = _item_name || k || '';
        const world_id = _world_id || (h ? parseInt(String(h)) : 0);
        const wuid = _wuid || x || '';
        // p 单位为分（如 600 = 6元 = 600分），_amount 同
        const amount = _amount || p || 0;

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

        // 获取用户渠道信息：优先直接传入的 user_id，否则通过用户名(f)查询
        let resolvedUserId: number | null = user_id ? parseInt(String(user_id)) : null;
        let userChannelCode = '';
        let userGameCode = '';
        const username = f || '';  // f 参数为用户名（如 steam_76561199819350897）

        if (resolvedUserId) {
            // 直接用 user_id 查询
            const userResult = await sql({
                query: 'SELECT id, channel_code, game_code FROM Users WHERE id = ?',
                values: [resolvedUserId],
            }) as any[];
            if (userResult.length > 0) {
                userChannelCode = userResult[0].channel_code || '';
                userGameCode = userResult[0].game_code || '';
            }
        } else if (username) {
            // 通过用户名或 thirdparty_uid 查询（兼容 steam_xxx 格式）
            const userResult = await sql({
                query: 'SELECT id, channel_code, game_code FROM Users WHERE username = ? OR thirdparty_uid = ? LIMIT 1',
                values: [username, username],
            }) as any[];
            if (userResult.length > 0) {
                resolvedUserId = userResult[0].id;
                userChannelCode = userResult[0].channel_code || '';
                userGameCode = userResult[0].game_code || '';
            }
        }

        if (!resolvedUserId) {
            return { code: -1, msg: '用户不存在或未登录' };
        }


        // 获取客户端 IP
        let clientIp = '';
        try {
            const headers = getHeaders(evt);
            clientIp = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || '';
        } catch { }

        // 构建回调地址（优先读取系统参数 steam_notify_url）
        const { getOrCreate } = await import('../model/systemParams');
        const defaultNotifyUrl = 'https://shop.ymumel.cn/api/payment/steam-notify';
        let baseNotifyUrl = defaultNotifyUrl;
        try {
            const param = await getOrCreate('steam_notify_url', defaultNotifyUrl);
            if (param && param.content) {
                baseNotifyUrl = param.content;
            }
        } catch (e) {
            console.warn('[Steam Pay] 读取 steam_notify_url 参数失败', e);
        }
        baseNotifyUrl = baseNotifyUrl.replace(/\/+$/, ''); // 去除末尾斜杠

        // 追加 token 参数
        const separator = baseNotifyUrl.includes('?') ? '&' : '?';
        const returnUrl = `${baseNotifyUrl}${separator}token=${token}`;

        // 1. 创建平台内部支付记录
        const paymentRecord: Omit<Payment, 'id' | 'created_at'> = {
            user_id: resolvedUserId,
            sub_user_id: sub_user_id || null,
            role_id: wuid || '',
            transaction_id: `steam_${orderId}`,
            wuid: wuid || '',
            payment_way: 'Steam',
            payment_id: 0,
            world_id: world_id || 0,
            product_name: item_name || `商品${item_id}`,
            product_des: String(item_id),   // 存储 item_id，回调时用于查 rechargeConfig（如 com.tencent.tmgp.hjol.diamond_60）
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
            user_id: resolvedUserId,
            world_id: world_id || 0,
            wuid: wuid || '',
            server_url: server_url || '',
            created_at: Date.now()
        });

        console.log('[Steam Pay] 订单已存入 Redis, token:', token);

        // 3. 调用 Steam InitTxn（使用 web 模式，Steam 返回支付 URL）
        // itemId 必须是 Steamworks 后台登记的数字 ID
        // 用 item_id（商品 key，如 com.tencent.tmgp.hjol.diamond_60）查 rechargeConfig 得到注册的数字 ID
        let steamItemId = parseInt(String(item_id));  // 先尝试直接 parseInt
        let steamDescription = item_name || String(item_id);
        try {
            const { getRechargeConfig } = await import('../utils/rechargeConfig');
            const cfg = getRechargeConfig(String(item_id));
            if (cfg && cfg.id) {
                steamItemId = parseInt(String(cfg.id));
                console.log(`[Steam Pay] 商品映射: ${item_id} → itemId=${steamItemId}, price=${cfg.price}`);
            } else {
                console.warn(`[Steam Pay] 未找到商品配置: ${item_id}, 直接使用 item_id=${steamItemId}`);
            }
        } catch (cfgErr) {
            console.warn('[Steam Pay] 读取商品配置失败:', cfgErr);
        }

        if (!steamItemId || isNaN(steamItemId)) {
            return { code: -1, msg: `无效的商品 ID: ${item_id}，请检查商品配置` };
        }

        const initRequest: SteamInitTxnRequest = {
            steamId: steam_id,
            orderId: orderId,
            itemId: steamItemId,
            qty: parseInt(String(qty)) || 1,
            amount: amountInCents,
            description: steamDescription,
            currency: currency,
            language: language,
            userSession: 'client',   // web 模式才有支付跳转 URL
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
