import * as PaymentModel from '../model/payment';
import * as ExternalGiftPackageModel from '../model/externalGiftPackage';
import { H3Event, setResponseStatus, getQuery } from 'h3';
import * as crypto from 'crypto';
import { Payment } from '../model/payment';
import { PaymentSetting } from '../model/paymentSettings';
import * as paymentsetting from '../model/paymentSettings';
import * as AdminModel from '../model/admin';
import * as UserModel from '../model/user';
import { sql } from '../db';
import { updateTransactionHasPay, getRedisCluster } from '../utils/redis-cluster';
import { getSystemConfig, getThirdPartyPaymentConfig, getSystemParam } from '../utils/systemConfig';
import { getByWorldId } from '../model/gameServers';
import * as GameCharactersModel from '../model/gameCharacters';

/**
 * 处理IP地址，将IPv6格式转换为IPv4格式
 * @param ip 原始IP地址
 * @returns 处理后的IPv4地址
 */
function normalizeIPAddress(ip: string): string {
    if (!ip) return '127.0.0.1';

    // 处理IPv6格式的IPv4地址 (::ffff:xxx.xxx.xxx.xxx)
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }

    // 处理IPv6本地地址
    if (ip === '::1') {
        return '127.0.0.1';
    }

    // 如果是有效的IPv4地址，直接返回
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
        return ip;
    }

    // 其他情况返回默认地址
    return '127.0.0.1';
}


function getCurrentFormattedTime(): string {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份是从0开始的，所以要加1
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 规整 transaction_id：当传入为 null/undefined/'null'/'undefined' 时，回退到备用ID
function sanitizeTransactionId(input: any, fallback: string = ''): string {
    const v = String(input ?? '').trim();
    if (v && v !== 'null' && v !== 'undefined') return v;
    const f = String(fallback ?? '').trim();
    if (f && f !== 'null' && f !== 'undefined') return f;
    return '';
}

// 规范化拼接通知地址：
// - 若系统参数为绝对URL(http/https)，直接使用
// - 否则将其作为相对路径与 baseUrl 规范化拼接（确保单斜杠）
function resolvePaymentNotifyUrl(paramValue: string | undefined, baseUrl: string): string {
    const fallbackPath = '/api/payment/third-party-notify';
    const raw = String(paramValue || '').trim() || fallbackPath;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = baseUrl.replace(/\/+$/, '');
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${base}${path}`;
}


export const count = async (evt: H3Event) => {
    // 逻辑处理

    const headers = evt.req.headers;

    const page = headers['x-page-number'];
    // 获取特定的请求头，例如 Authorization
    const authorizationHeader = headers['authorization'];

    const token = authorizationHeader ? parseInt(authorizationHeader) : 1;

    const start_data = headers['start_date'];

    const end_data = headers['end_date'];

    const uid = headers['userid'];

    const transaction_id = headers['transaction_id'];

    const channel_id = headers['channel_id'] ? parseInt(Array.isArray(headers['channel_id']) ? headers['channel_id'].join('') : headers['channel_id']) : 0;

    // 权限检查 - 使用持久化的权限数据
    let permissionsJson = null;
    try {
        const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);

        if (!adminWithPermissions) {
            throw createError({
                status: 403,
                message: '管理员不存在',
            });
        }

        // 直接使用持久化的权限数据
        permissionsJson = {
            channel_codes: adminWithPermissions.allowed_channel_codes || []
        };

        console.log(`管理员 ${adminWithPermissions.name} 的支付统计权限:`, permissionsJson);
    } catch (error) {
        console.error('支付统计权限检查失败:', error);
        throw createError({
            status: 403,
            message: '权限验证失败',
        });
    }

    try {
        const result = await PaymentModel.count(permissionsJson, transaction_id, start_data, end_data, uid);
        return result;
    } catch {
        throw createError({
            status: 500,
            message: 'Something went wrong',
        });
    }
};


export const page = async (evt: H3Event) => {
    // 逻辑处理

    const headers = evt.req.headers;

    const page = headers['x-page-number'];
    // 获取特定的请求头，例如 Authorization
    const authorizationHeader = headers['authorization'];

    const token = authorizationHeader ? parseInt(authorizationHeader) : 1;

    const start_data = headers['start_date'];

    const uid = headers['userid'];

    const mch_order_id = headers['mch_order_id'];

    const end_data = headers['end_date'];

    const transaction_id = headers['transaction_id'];

    const payment_status = headers['payment_status'];

    console.log("page:", headers);

    // 权限检查 - 使用持久化的权限数据
    let permissionsJson = null;
    try {
        const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);

        if (!adminWithPermissions) {
            throw createError({
                status: 403,
                message: '管理员不存在',
            });
        }

        // 直接使用持久化的权限数据
        permissionsJson = {
            channel_codes: adminWithPermissions.allowed_channel_codes || []
        };

        console.log(`管理员 ${adminWithPermissions.name} 的支付权限:`, permissionsJson);
    } catch (error) {
        console.error('支付权限检查失败:', error);
        throw createError({
            status: 403,
            message: '权限验证失败',
        });
    }

    try {

        const data = await PaymentModel.readPage(page, permissionsJson, transaction_id, start_data, end_data, uid, mch_order_id, payment_status);
        const total = await PaymentModel.count(permissionsJson, transaction_id, start_data, end_data, uid, mch_order_id, payment_status);
        const successAmount = await PaymentModel.allAmount(permissionsJson, transaction_id, start_data, end_data, uid, mch_order_id, 3, payment_status);
        const allAmount = await PaymentModel.allAmount(permissionsJson, transaction_id, start_data, end_data, uid, mch_order_id, undefined, payment_status);

        return {
            data: data,
            total: total,
            allAmount: allAmount,
            successAmount: successAmount,
        };
    } catch {
        throw createError({
            status: 500,
            message: 'Something went wrong',
        });
    }
};


export const insert = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        console.log("insert:", body)
        const result = await PaymentModel.insert(body);

        return {
            status: result === null ? "fail" : "success",
        };
    } catch (e: any) {
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

export const checkOrder = defineEventHandler(async (event) => {
    try {
        const tranId = event.context.params?.tranId ?? '';
        var _status = await PaymentModel.getOrderStatus(tranId);
        if (_status == 3) {
            const currentTime = getCurrentFormattedTime();
            await PaymentModel.updateOrderStatus(tranId, 3, null, currentTime);
        }
        return _status;
    } catch (e: any) {
        return -1;
    }
});



//获取充值链接
export const paymentNewReps = async (evt: H3Event) => {

    try {
        const body = await readBody(evt);
        console.log("paymentNewReps 请求:", body);

        // 检查是否有 transactionId 并且记录是否存在
        if (body.transactionId) {
            const existingRecord = await PaymentModel.detailByTransId(body.transactionId);

            if (existingRecord) {

                // 获取用户的渠道信息用于更新
                let updateUserChannelCode = '';
                let updateUserGameCode = '';

                if (existingRecord.user_id) {
                    const userResult = await sql({
                        query: 'SELECT channel_code, game_code FROM users WHERE id = ?',
                        values: [existingRecord.user_id],
                    }) as any[];

                    if (userResult.length > 0) {
                        updateUserChannelCode = userResult[0].channel_code || '';
                        updateUserGameCode = userResult[0].game_code || '';
                        console.log("更新时获取用户渠道信息:", {
                            user_id: existingRecord.user_id,
                            updateUserChannelCode,
                            updateUserGameCode
                        });
                    }
                }

                const updatepayrecord: Partial<Payment> = {
                    role_id: body.wuid,
                    wuid: body.uid,
                    //   payment_way: updatePaymentWay, // 更新支付方式
                    //   payment_id: body.iid,
                    product_name: body.descname,
                    ip: body.ip,
                    server_url: body.server_url,
                    channel_code: updateUserChannelCode, // 设置渠道代码
                    game_code: updateUserGameCode,       // 设置游戏代码
                    payment_status: 1,
                };

                await PaymentModel.updateByTransactionId(body.transactionId, updatepayrecord);
                console.log("支付记录已更新:", body.transactionId);

                return {
                    code: 200,
                    message: 'update success'
                };
            }
        }

        // 记录不存在或没有 transactionId，执行插入
        const newTransactionId = body.transactionId || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 通过 body.uid 查找 SubUsers 表获取真正的 user_id 和 sub_user_id
        let realUserId = null;
        let realSubUserId = null;
        let userChannelCode = '';
        let userGameCode = '';

        if (body.uid) {
            const subUserResult = await sql({
                query: 'SELECT id, parent_user_id FROM subusers WHERE wuid = ?',
                values: [body.uid],
            }) as any[];

            if (subUserResult.length > 0) {
                realUserId = subUserResult[0].parent_user_id; // Users 表的 ID
                realSubUserId = subUserResult[0].id;          // SubUsers 表的 ID
                console.log("找到子用户:", { realUserId, realSubUserId, uid: body.uid });

                // 获取用户的 channel_code 和 game_code
                if (realUserId) {
                    const userResult = await sql({
                        query: 'SELECT channel_code, game_code FROM users WHERE id = ?',
                        values: [realUserId],
                    }) as any[];

                    if (userResult.length > 0) {
                        userChannelCode = userResult[0].channel_code || '';
                        userGameCode = userResult[0].game_code || '';
                        console.log("获取用户渠道信息:", { realUserId, userChannelCode, userGameCode });
                    } else {
                        console.log("未找到用户信息:", realUserId);
                    }
                }
            } else {
                console.log("未找到子用户:", body.uid);
            }
        }

        // 根据 payment_id 或其他参数确定支付方式
        let paymentWay = '未知';
        const paymentId = body.iid || 0;

        // 根据支付ID或其他信息判断支付方式
        if (paymentId === 1) {
            paymentWay = '平台币';
        } else if (paymentId === 2) {
            paymentWay = '支付宝';
        } else if (paymentId === 3) {
            paymentWay = '微信';
        } else if (body.payment_method) {
            const methodMap: Record<string, string> = {
                'ptb': '平台币',
                'zfb': '支付宝',
                'wx': '微信',
                'kf': '客服'
            };
            paymentWay = methodMap[body.payment_method] || body.payment_method;
        } else {
            console.warn('[支付方式判断] 无法确定支付方式:', {
                paymentId,
                hasPaymentMethod: !!body.payment_method,
                paymentMethodValue: body.payment_method
            });
        }

        console.log('📝 [支付方式判断] 最终确定的支付方式:', paymentWay);

        // 预先获取渠道ID
        const { channelId: sdkChannelId } = await selectProviderBySystemParam(body.price || 0, body.payment_method, newTransactionId);

        const insertRecord: Omit<Payment, 'id' | 'created_at'> = {
            user_id: realUserId,
            sub_user_id: realSubUserId,
            role_id: body.wuid || '',
            transaction_id: newTransactionId,
            wuid: body.uid || '',
            payment_way: paymentWay, // 使用正确的支付方式
            payment_id: parseInt(sdkChannelId) || body.iid || 0,  // 保存渠道ID到payment_id
            world_id: body.worldId || 1,
            product_name: body.descname || '',
            product_des: '',
            ip: body.ip || '',
            amount: body.price || 0,
            mch_order_id: newTransactionId,//不能为空 数据库会报错
            msg: '',
            server_url: body.server_url || '',
            device: '',
            channel_code: userChannelCode, // 使用从用户表获取的渠道代码
            game_code: userGameCode,       // 使用从用户表获取的游戏代码
            payment_status: 0
        };

        await PaymentModel.insert(insertRecord);
        console.log(`支付记录已插入: ${newTransactionId}, 渠道ID: ${sdkChannelId}`);

        return {
            code: 200,
            message: 'insert success',
            transaction_id: newTransactionId
        }

    } catch (e: any) {
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}


/**
 * 通知游戏服到账方法
 * @param transactionId 交易ID
 * @param wuid 外部用户ID
 * @param serverUrl 服务器URL（可从中提取端口号）或端口号
 * @param gameServerUrl 游戏服地址（可选，默认使用主服务器）
 * @returns 通知结果
 */
async function notifyGameServer(
    transactionId: string,
    wuid: string | number,
    serverUrl: string | number,
    gameServerUrl?: string,
    worldId?: number
) {
    try {
        // 提取端口：优先从 serverUrl，若未提供且可从 webhost 获取则使用 webhost 端口
        let port = '';
        let preferredBaseUrl = '';
        if (typeof serverUrl === 'string' && (serverUrl.startsWith('http://') || serverUrl.startsWith('https://'))) {
            try {
                const urlObj = new URL(serverUrl);
                port = urlObj.port || '';
            } catch (error) {
                console.error('URL 解析失败:', serverUrl, error);
            }
        } else if (serverUrl) {
            port = String(serverUrl || '');
        }

        const requestData = {
            transactionId: transactionId,
            uid: wuid,
            port: port
        };

        // 计算目标地址：优先使用 GameServers.webhost，其次显式传入 gameServerUrl，再次系统默认
        const systemConfig = await getSystemConfig();
        if (worldId && Number(worldId) > 0) {
            try {
                const serverCfg = await getByWorldId(Number(worldId));
                if (serverCfg && serverCfg.webhost) {
                    const base = serverCfg.webhost.replace(/\/$/, '');
                    preferredBaseUrl = `${base}/update_pay_status`;
                    // 若端口为空且 webhost 带端口，则从 webhost 提取
                    try {
                        const u = new URL(serverCfg.webhost);
                        if (!port) port = u.port || '';
                    } catch { }
                }
            } catch (e) {
                console.warn('按 worldId 查询 GameServers 失败，退回默认:', e);
            }
        }
        const targetGameServerUrl = preferredBaseUrl || gameServerUrl || systemConfig.notify_game_url || 'http://160.202.240.19:8888/update_pay_status';
        console.log('准备调用游戏服接口:', requestData, '地址:', targetGameServerUrl);

        const response = await fetch(targetGameServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(30000)
        });

        if (response.ok) {
            console.log('游戏服通知成功:', transactionId);
            return {
                success: true,
                message: '游戏服通知成功'
            };
        } else {
            console.error('游戏服通知失败:', response.status, response.statusText);
            return {
                success: false,
                message: `游戏服返回错误: ${response.status}`
            };
        }

    } catch (fetchError: any) {
        console.error('游戏服通知异常:', fetchError);

        if (fetchError.name === 'AbortError') {
            return {
                success: false,
                message: '游戏服响应超时'
            };
        } else {
            return {
                success: false,
                message: `游戏服连接失败: ${fetchError.message}`
            };
        }
    }
}

/**
 * 生成用户登录链接（带用户名和密码参数）
 * @param userId 用户ID
 * @returns 登录链接
 */
export async function generateUserLoginUrl(userId: number, redirectPath: string = '/user/home'): Promise<string | null> {
    try {
        // 获取用户信息
        const userResult = await sql({
            query: 'SELECT username, password FROM users WHERE id = ?',
            values: [userId],
        }) as any[];

        if (userResult.length === 0) {
            console.error('用户不存在:', userId);
            return null;
        }

        const { username, password } = userResult[0];

        // 获取系统配置中的登录URL
        const systemConfig = await getSystemConfig();
        const baseLoginUrl = systemConfig.user_login_url;

        // 构建带参数的登录链接
        // 优先采用签名免密方式，避免明文密码
        const ts = Math.floor(Date.now() / 1000).toString();
        const secret = await getSystemParam('user_auto_login_secret', '12w12rdf43r43t564y7');
        const sig = crypto.createHash('md5').update(`${username}${ts}${secret}`).digest('hex');

        // console.log('生成签名详情:', {
        //     username,
        //     ts,
        //     secret,
        //     signString: `${username}${ts}${secret}`,
        //     generatedSig: sig
        // });

        const loginParams = new URLSearchParams({ username, ts, sig, auto_login: 'true', redirect: redirectPath } as any);

        const fullLoginUrl = `${baseLoginUrl}?${loginParams.toString()}`;



        return fullLoginUrl;
    } catch (error) {
        console.error('生成用户登录链接失败:', error);
        return null;
    }
}

/**
 * 平台币扣款方法
 * @param userId 用户ID
 * @param amount 扣款金额
 * @param transactionId 交易ID
 * @param orderData 订单数据
 * @param wuid 外部用户ID
 * @returns 扣款结果
 */
async function deductPlatformCoinsForPayment(
    userId: number,
    amount: number,
    transactionId: string,
    orderData: any,
    wuid: string
) {
    const currentTime = getCurrentFormattedTime();

    try {
        // 🔒 第一步：读取用户余额（不加锁，快速检查）
        const userResult = await sql({
            query: 'SELECT platform_coins FROM users WHERE id = ?',
            values: [userId],
        }) as any[];

        if (userResult.length === 0) {
            return {
                success: false,
                code: -2,
                msg: "用户不存在"
            };
        }

        const currentBalance = parseFloat(userResult[0].platform_coins) || 0;

        // 💰 第二步：检查余额是否足够
        if (currentBalance < amount) {
            // 余额不足，标记订单并引导充值
            try {
                await PaymentModel.updateByTransactionId(transactionId, { msg: 'INSUFFICIENT_PTB' });
            } catch { }

            // 引导用户充值
            let redirectPath = '/user/cashier';
            try {
                let worldIdForRedirect: string = '';
                try {
                    const w = Number(orderData?.world_id);
                    if (Number.isFinite(w) && w > 0) worldIdForRedirect = String(w);
                } catch { }
                if (!worldIdForRedirect && transactionId) {
                    try {
                        const ord = await PaymentModel.detailByTransId(transactionId);
                        if (ord && ord.world_id) worldIdForRedirect = String(ord.world_id);
                    } catch { }
                }
                const qs = new URLSearchParams({
                    sub_user_id: String(orderData?.sub_user_id ?? ''),
                    wuid: String(wuid || ''),
                    world_id: worldIdForRedirect || ''
                }).toString();
                redirectPath = `/user/cashier?${qs}`;
            } catch { }
            const autoLoginUrl = await generateUserLoginUrl(userId, redirectPath);

            return {
                success: false,
                code: -6,
                msg: "余额不足",
                data: autoLoginUrl || ''
            };
        }

        // 🔐 第三步：严格安全检查 - 当前余额必须与上一笔“平台币消费”的 after 一致
        // 若没有找到上一次的平台币消费记录，则默认允许购买
        let securityCheckPassed = false;
        try {
            const lastOrder = await sql({
                query: `SELECT ptb_after, transaction_id, created_at, ptb_change 
                        FROM paymentrecords 
                        WHERE user_id = ? 
                        AND payment_status = 3 
                        AND ptb_after IS NOT NULL
                        ORDER BY created_at DESC 
                        LIMIT 1`,
                values: [userId]
            }) as any[];

            if (lastOrder.length > 0) {
                const lastPtbAfter = parseFloat(lastOrder[0].ptb_after) || 0;

                // 检查条件：当前余额必须等于上一笔的 ptb_after，或者上一笔是 0
                const isBalanceValid = (
                    Math.abs(currentBalance - lastPtbAfter) < 0.01 || // 当前余额 = 上一笔的 after
                    lastPtbAfter === 0  // 或者上一笔是 0（允许）
                );

                if (!isBalanceValid) {
                    // 🔍 进一步检查：如果余额不一致，但数据库里已经没有任何“平台币消费”记录了，
                    // 说明可能是手动清理了消费记录，这种情况下允许通过。
                    const hasAnyPtbConsumption = await sql({
                        query: `SELECT id FROM paymentrecords 
                                WHERE user_id = ? 
                                AND payment_status = 3 
                                AND payment_way LIKE '%平台币%'
                                LIMIT 1`,
                        values: [userId]
                    }) as any[];

                    if (hasAnyPtbConsumption.length === 0) {
                        console.warn('🔍 [平台币校验跳过] 余额不一致但未找到任何消费记录，允许交易', {
                            userId,
                            currentBalance,
                            lastPtbAfter
                        });
                    } else {
                        // ⚠️ 余额异常且存在消费记录！拒绝交易
                        securityCheckPassed = true;

                        console.error('🚨 [平台币异常拒绝] 余额数据异常，交易被拒绝！', {
                            userId,
                            transactionId,
                            currentBalance,
                            lastPtbAfter,
                            diff: currentBalance - lastPtbAfter,
                            lastTransaction: lastOrder[0].transaction_id,
                            lastTransactionTime: lastOrder[0].created_at
                        });

                        // 标记订单为异常
                        try {
                            await PaymentModel.updateByTransactionId(transactionId, {
                                msg: `BALANCE_ANOMALY:当前余额${currentBalance},上次结余${lastPtbAfter}`
                            });
                        } catch { }

                        return {
                            success: false,
                            code: -11,
                            msg: "账户异常，请联系管理员处理(1)",
                            data: null
                        };
                    }
                }
            }
            // 如果没有历史平台币消费记录，直接通过

        } catch (checkError) {
            return {
                success: false,
                code: -12,
                msg: "账户异常，请联系管理员处理(2)",
                data: null
            };
        }


        if (securityCheckPassed) {
            return {
                success: false,
                code: -11,
                msg: "账户异常，请联系管理员处理(3)",
                data: null
            };
        }

        // ✅ 通过所有检查，执行扣款和到账（不使用事务，失败时手动退款）
        try {
            // 1. 扣除用户平台币（使用统一方法）
            const updateResult = await UserModel.updatePlatformCoinsUnified(userId, -amount, 1);
            if (!updateResult.success) {
                console.error('[平台币支付] 扣款失败:', updateResult.message);
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 2,
                    msg: updateResult.message || '扣款失败'
                } as any);
                return { success: false, message: updateResult.message || '扣款失败' };
            }

            const newBalance = updateResult.newBalance!;
            const oldBalance = updateResult.oldBalance!;

            // 2. 更新订单记录（先标记为处理中）
            // 注意：ptb_before 在创建订单时已经设置，这里只更新 ptb_change 和 ptb_after
            await PaymentModel.updateByTransactionId(transactionId, {
                payment_status: 1, // 处理中
                amount: amount,
                ptb_change: -amount,
                ptb_after: newBalance
            } as any);

            console.log('[平台币支付] 扣款完成，开始到账处理:', { transactionId, amount, newBalance });

            let giftHandled = false;
            let apiDeliveryHandled = false;
            const orderDetail = await PaymentModel.detailByTransId(transactionId);
            const isGiftOrder = orderDetail && String(orderDetail.server_url || '').startsWith('gift://');
            // 处理礼包订单
            if (orderDetail && isGiftOrder) {
                giftHandled = await processGiftOrder(orderDetail as Payment, `ptb_deduct_${transactionId}`);
                if (giftHandled) {
                    console.log('[平台币支付] 礼包到账成功:', transactionId);
                    // 礼包发放成功，更新订单为成功状态
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 3
                    } as any);
                } else {
                    // 礼包发放失败，退款
                    console.error('[平台币支付] 礼包到账失败，退还平台币:', transactionId);
                    const { getPaymentRefundEnabled } = await import('../model/systemParams');
                    const refundEnabled = await getPaymentRefundEnabled();
                    if (refundEnabled) {
                        const refundResult = await UserModel.updatePlatformCoinsUnified(userId, amount, 6);
                        await PaymentModel.updateByTransactionId(transactionId, {
                            payment_status: 2,
                            ptb_change: 0,
                            ptb_after: refundResult.newBalance || oldBalance,
                            msg: 'GIFT_DELIVERY_FAILED:礼包发放失败，已退款'
                        });
                        return {
                            success: false,
                            code: -12,
                            msg: "礼包发放失败，已退还平台币",
                            data: null
                        };
                    }
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 1,
                        msg: 'GIFT_DELIVERY_FAILED_NO_REFUND:礼包发放失败（退款关闭）'
                    } as any);
                    return {
                        success: false,
                        code: -12,
                        msg: "礼包发放失败（退款关闭）",
                        data: null
                    };
                }
            } else if (orderDetail && !isGiftOrder) {
                // ========== API到账功能：游戏内购计费点到账 ==========

                try {
                    const { getApiDeliveryEnabled, getApiDeliveryTestRoleId } = await import('../model/systemParams');
                    const { getRechargeConfig } = await import('../utils/rechargeConfig');

                    const apiDeliveryEnabled = await getApiDeliveryEnabled();
                    const testRoleId = await getApiDeliveryTestRoleId();
                    const playerRoleId = orderDetail.role_id || wuid;
                    const isTestRole = testRoleId && playerRoleId && String(playerRoleId).trim() === String(testRoleId).trim();
                    const shouldProcessApiDelivery = (apiDeliveryEnabled || isTestRole) && orderDetail.product_name && orderDetail.world_id;

                    console.log('API到账--检查配置:', {
                        apiDeliveryEnabled,
                        testRoleId,
                        playerRoleId,
                        isTestRole,
                        shouldProcessApiDelivery,
                        productName: orderDetail.product_des,
                        worldId: orderDetail.world_id
                    });

                    if (shouldProcessApiDelivery) {
                        const config = orderDetail.product_des ? getRechargeConfig(orderDetail.product_des) : null;

                        console.log('API到账--商品配置:', config ? `找到配置:${config.id}` : '未找到配置');

                        if (config) {
                            // 确定使用的 goodsId：iOS 使用 id，非 iOS 使用 andid
                            let finalGoodsId = config.andid;
                            try {

                                const character = await GameCharactersModel.findByUuid(playerRoleId);
                                if (character && character.ext) {
                                    let extObj: any = {};
                                    try {
                                        extObj = typeof character.ext === 'string' ? JSON.parse(character.ext) : character.ext;
                                    } catch (e) {
                                        extObj = { value: character.ext };
                                    }

                                    if (extObj && extObj.value === 'ios') {
                                        finalGoodsId = config.id;
                                        console.log(`API到账--平台判定: iOS, 使用 id=${finalGoodsId}, 角色UUID=${playerRoleId}`);
                                    } else {
                                        finalGoodsId = config.andid || config.id;
                                        console.log(`API到账--平台判定: 非iOS, 使用 andid=${finalGoodsId}, 角色UUID=${playerRoleId}`);
                                    }
                                } else {
                                    finalGoodsId = config.andid || config.id;
                                    console.log(`API到账--平台判定: 未找到角色或ext为空, 默认使用 andid=${finalGoodsId}, 角色UUID=${playerRoleId}`);
                                }
                            } catch (charError) {
                                console.error('API到账--平台判定异常:', charError);
                                finalGoodsId = config.andid || config.id;
                            }

                            // 查询服务器 webhost
                            const serverCfg = await getByWorldId(Number(orderDetail.world_id));
                            console.log('API到账--服务器配置:', serverCfg ? `找到服务器:${serverCfg.webhost}` : `未找到world_id=${orderDetail.world_id}`);
                            if (serverCfg && serverCfg.webhost) {
                                const webhost = serverCfg.webhost.replace(/\/$/, '');
                                const playerId = String(wuid);
                                const rechargeUrl = `${webhost}/script/gmRecharge?playerId=${playerId}&rechargeType=${config.rechargeType}&goodsId=${finalGoodsId}&billno=${orderDetail.mch_order_id}`;

                                const response = await fetch(rechargeUrl, {
                                    method: 'GET',
                                    signal: AbortSignal.timeout(10000)
                                });

                                console.log('API到账--rechargeUrl:', rechargeUrl);
                                const responseText = await response.text();
                                const currentTime = getCurrentFormattedTime();
                                if (response.ok) {
                                    try {
                                        const result = JSON.parse(responseText);

                                        // 兼容多种成功响应格式：
                                        // 1. { code: 0 } - 游戏充值接口
                                        // 2. { msg: 'success' } - 通用接口
                                        // 3. { result: 'buy gift success!' } - 礼包接口
                                        const isSuccess = result.code === 0 ||
                                            result.msg === 'success' ||
                                            (result.result && String(result.result).toLowerCase().includes('success'));

                                        if (isSuccess) {
                                            console.log('API到账--Success:', { transactionId, playerId, product: finalGoodsId, response: result });
                                            apiDeliveryHandled = true;
                                            // 记录成功日志到订单

                                            await PaymentModel.updateByTransactionId(transactionId, {
                                                payment_status: 3,
                                                notify_at: currentTime,
                                                msg: `API到账成功:${JSON.stringify(result).substring(0, 500)}`
                                            });
                                        } else {
                                            console.error('API到账--Failed:', result);
                                            // 记录失败日志到订单
                                            await PaymentModel.updateByTransactionId(transactionId, {

                                                msg: `API到账失败:${JSON.stringify(result).substring(0, 500)}`
                                            });
                                        }
                                    } catch (parseError) {
                                        // 兼容纯文本 "success" 响应
                                        if (responseText.trim().toLowerCase() === 'success') {
                                            console.log('API到账--Success:', { transactionId, playerId });
                                            apiDeliveryHandled = true;
                                            // 记录成功日志到订单
                                            await PaymentModel.updateByTransactionId(transactionId, {
                                                payment_status: 3,
                                                notify_at: currentTime,
                                                msg: 'API到账成功:纯文本success响应'
                                            });
                                        } else {
                                            const errorMsg = `API到账响应解析失败:${responseText.substring(0, 200)}`;
                                            console.error('API到账--响应解析失败:', {
                                                transactionId,
                                                playerId,
                                                responseText: responseText.substring(0, 200),
                                                parseError: parseError instanceof Error ? parseError.message : 'Unknown error'
                                            });
                                            // 记录错误日志到订单
                                            await PaymentModel.updateByTransactionId(transactionId, {
                                                msg: errorMsg
                                            });
                                        }
                                    }
                                } else {
                                    // HTTP 请求失败
                                    const errorMsg = `API到账HTTP错误:${response.status} ${response.statusText}`;
                                    console.error('API到账--HTTP错误:', { status: response.status, statusText: response.statusText });
                                    await PaymentModel.updateByTransactionId(transactionId, {
                                        msg: errorMsg
                                    });
                                }
                            } else {
                                const errorMsg = `API到账未找到服务器配置:world_id=${orderDetail.world_id}`;
                                console.warn('API到账--未找到服务器配置:', orderDetail.world_id);
                                // 记录错误日志到订单
                                await PaymentModel.updateByTransactionId(transactionId, {
                                    msg: errorMsg
                                });
                            }
                        } else {
                            // 找不到商品配置
                            const errorMsg = `API到账找不到商品配置:${orderDetail.product_name}`;
                            console.warn('API到账--找不到商品配置:', orderDetail.product_name);
                            await PaymentModel.updateByTransactionId(transactionId, {
                                msg: errorMsg
                            });
                        }
                    } else {
                        // 不需要API到账，直接标记为成功
                        console.log('API到账--无需处理:', {
                            reason: !apiDeliveryEnabled && !isTestRole ? 'API到账开关未开启' :
                                !orderDetail.product_name ? '缺少商品名称' :
                                    !orderDetail.world_id ? '缺少服务器ID' : '未知'
                        });
                        await PaymentModel.updateByTransactionId(transactionId, {
                            payment_status: 3
                        } as any);
                        apiDeliveryHandled = true; // 标记为已处理（无需处理）
                    }
                } catch (apiError: any) {
                    const errorMsg = `API到账异常:${apiError.message}`;
                    console.error('API到账--异常:', apiError.message);
                    // 记录异常日志到订单
                    await PaymentModel.updateByTransactionId(transactionId, {
                        msg: errorMsg
                    });
                }

                // 根据API到账结果决定成功或退款
                if (apiDeliveryHandled) {
                    // API到账成功
                    console.log('[平台币支付] API到账成功:', transactionId);
                } else {
                    // API到账失败，退款
                    console.error('[平台币支付] API到账失败，退还平台币:', transactionId);
                    const { getPaymentRefundEnabled } = await import('../model/systemParams');
                    const refundEnabled = await getPaymentRefundEnabled();
                    if (refundEnabled) {
                        const refundResult = await UserModel.updatePlatformCoinsUnified(userId, amount, 6);
                        await PaymentModel.updateByTransactionId(transactionId, {
                            payment_status: 2, // 失败
                            ptb_change: 0,
                            ptb_after: refundResult.newBalance || oldBalance,
                            msg: 'API_DELIVERY_FAILED:API到账失败，已退款'
                        });
                        return {
                            success: false,
                            code: -13,
                            msg: "到账失败，已退还平台币",
                            data: null
                        };
                    }
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 1,
                        msg: 'API_DELIVERY_FAILED_NO_REFUND:API到账失败（退款关闭）'
                    } as any);
                    return {
                        success: false,
                        code: -13,
                        msg: "到账失败（退款关闭）",
                        data: null
                    };
                }
            }

            // 返回成功结果
            return {
                success: true,
                code: 1,
                msg: "支付成功",
                data: {
                    transactionId,
                    newBalance,
                    amount
                }
            };

        } catch (transactionError: any) {
            // 处理异常，退款
            console.error('[平台币支付] 处理异常，退还平台币:', transactionError);
            try {
                const { getPaymentRefundEnabled } = await import('../model/systemParams');
                const refundEnabled = await getPaymentRefundEnabled();
                if (refundEnabled) {
                    const refundResult = await UserModel.updatePlatformCoinsUnified(userId, amount, 7);
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 2,
                        ptb_change: 0,
                        ptb_after: refundResult.newBalance || (await UserModel.getPlatformCoins(userId)),
                        msg: `EXCEPTION:处理异常，已退款 - ${transactionError.message}`
                    });
                } else {
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 1,
                        msg: `EXCEPTION_NO_REFUND:处理异常（退款关闭） - ${transactionError.message}`
                    } as any);
                }
            } catch (refundError) {
                console.error('[平台币支付] 退款失败:', refundError);
            }
            return {
                success: false,
                code: -14,
                msg: "支付处理异常，已退还平台币",
                data: null
            };
        }

    } catch (dbError: any) {
        // 外层异常捕获（余额检查阶段的错误）
        console.error('[平台币支付] 数据库操作失败:', dbError);
        return {
            success: false,
            code: -9,
            msg: "支付处理失败"
        };
    }
}




function generateSign(params: Record<string, string>, key: string): string {
    // 1. 过滤掉空值参数，并按照参数名ASCII码从小到大排序
    const sortedParams = Object.keys(params)
        .filter(k => params[k] !== '') // 过滤掉空值参数
        .sort() // 按ASCII码排序
        .map(k => `${k}=${params[k]}`) // 转换为URL键值对格式
        .join('&'); // 使用 & 连接

    // 2. 拼接 key
    const stringSignTemp = sortedParams + "&key=" + key;

    // 3. 进行 MD5 运算，并将结果转换为大写
    const signValue = crypto.createHash('md5')
        .update(stringSignTemp)
        .digest('hex')
        .toUpperCase();

    return signValue;
}

function netSign(params: Record<string, string>, key: string): string {
    // 1. 过滤掉空值参数，并按照参数名ASCII码从小到大排序
    const sortedParams = Object.keys(params)
        .filter(k => params[k] !== '') // 过滤掉空值参数
        .sort() // 按ASCII码排序
        .map(k => `${k}=${params[k]}`) // 转换为URL键值对格式
        .join('&'); // 使用 & 连接

    // 2. 拼接 key
    const stringSignTemp = sortedParams + key;

    const signValue = crypto.createHash('md5')
        .update(stringSignTemp)
        .digest('hex')

    return signValue;
}

// === UZEPAY V2 (RSA) 支持 ===
function buildSignString(params: Record<string, any>): string {
    const filtered = Object.keys(params)
        .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== '' && params[k] !== null && params[k] !== undefined)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&');
    return filtered;
}

function toPem(key: string, type: 'PUBLIC' | 'PRIVATE'): string {
    const trimmed = (key || '').trim();
    if (!trimmed) return '';
    const hasHeader = trimmed.includes('BEGIN') && trimmed.includes('END');
    if (hasHeader) return trimmed;
    // 将单行Base64包装为PEM，按64列换行
    const wrap64 = (s: string) => s.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
    if (type === 'PUBLIC') {
        return `-----BEGIN PUBLIC KEY-----\n${wrap64(trimmed)}\n-----END PUBLIC KEY-----`;
    }
    return `-----BEGIN PRIVATE KEY-----\n${wrap64(trimmed)}\n-----END PRIVATE KEY-----`;
}

function rsaSignSHA256(privateKey: string, content: string): string {
    const pem = toPem(privateKey, 'PRIVATE');
    if (!pem) throw new Error('缺少商户RSA私钥');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(content, 'utf8');
    signer.end();
    return signer.sign(pem, 'base64');
}

function rsaVerifySHA256(publicKey: string, content: string, signatureBase64: string): boolean {
    const pem = toPem(publicKey, 'PUBLIC');
    if (!pem) return false;
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content, 'utf8');
    verifier.end();
    try {
        return verifier.verify(pem, signatureBase64, 'base64');
    } catch (e) {
        return false;
    }
}

export const getPaymentByTransId = defineEventHandler(async (event) => {
    // 逻辑处理
    const transaction_id = event.context.params?.transaction_id ?? '';
    try {
        const result = await PaymentModel.detailByTransId(transaction_id);

        return {
            code: result === null ? 404 : 200,
            data: result,
        };
    } catch (e: any) {
        throw createError({
            status: 500,
            message: e.message,
        });
    }
});

/**
 * SDK游戏订单查询接口
 * @route GET/POST /sdkapi/game/order
 * @query {oid: string} - 商户订单ID (mch_order_id) [GET方式]
 * @body {oid: string} - 商户订单ID (mch_order_id) [POST方式]
 * @returns {Object} SDK格式的订单信息
 */
export const getGameOrder = defineEventHandler(async (event) => {
    // 同时支持GET查询参数和POST请求体参数
    const query = getQuery(event);
    let oid = query.oid as string || '';

    // 如果GET参数中没有oid，尝试从POST请求体中获取
    if (!oid && event.node.req.method === 'POST') {
        try {
            const body = await readBody(event);
            oid = body.oid || '';
        } catch (error) {
            console.error('读取POST请求体失败:', error);
        }
    }

    try {
        if (!oid) {
            return {
                code: -1,
                msg: "缺少订单号参数",
                amount: "0"
            };
        }

        const result = await PaymentModel.detailByMchOrderId(oid);

        if (!result) {
            return {
                code: 0,
                msg: "订单不存在:" + oid,
                amount: "0"
            };
        }

        // 根据订单状态返回相应的信息
        let code = 0;
        let msg = "订单未知状态";

        switch (result.payment_status) {
            case 0:
                code = 0;
                msg = "订单未完成";
                break;
            case 1:
                code = 0;
                msg = "订单处理中";
                break;
            case 2:
                code = 0;
                msg = "订单失败";
                break;
            case 3:
            case 4:
                code = 1;
                msg = "订单成功";
                break;
            default:
                code = 0;
                msg = "订单状态异常";
                break;
        }

        return {
            code,
            msg,
            amount: (result.amount || 0).toString()
        };

    } catch (e: any) {
        console.error('SDK游戏订单查询失败:', e);
        return {
            code: -1,
            msg: "系统错误",
            amount: "0"
        };
    }
});

export const getPaymentByUserID = defineEventHandler(async (event) => {
    // 逻辑处理
    var user_id = event.context.params?.user_id ?? 0;

    try {
        const result = await PaymentModel.detailByUserId(user_id);

        return {
            code: result === null ? 404 : 200,
            data: result,
        };
    } catch (e: any) {
        throw createError({
            status: 500,
            message: e.message,
        });
    }
});


// 手动到账功能已注释 - 不能随意使用
/* export const confirmPayment = async(evt:H3Event) => {
    try {
        console.log('开始处理支付确认请求');
        const body = await readBody(evt);
        const { transaction_id } = body;
        
        console.log('支付确认参数:', { transaction_id });
        
        if (!transaction_id) {
            return {
                success: false,
                message: '缺少交易ID'
            };
        }
        
        // 检查订单当前状态
        console.log('检查订单当前状态:', transaction_id);
        const currentStatus = await PaymentModel.getOrderStatus(transaction_id);
        console.log('订单当前状态:', currentStatus);
        
        if (currentStatus === 3) {
            return {
                success: false,
                message: '订单已成功！'
            };
        }
        
        // 获取订单详情
        console.log('获取订单详情:', transaction_id);
        const orderDetail = await PaymentModel.detailByTransId(transaction_id);
        console.log('订单详情:', {
            exists: !!orderDetail,
            payment_way: orderDetail?.payment_way,
            product_name: orderDetail?.product_name,
            wuid: orderDetail?.wuid,
            server_url: orderDetail?.server_url,
            user_id: orderDetail?.user_id,
            amount: orderDetail?.amount
        });
        
        if (!orderDetail) {
            return {
                success: false,
                message: '订单不存在'
            };
        }
        
        const currentTime = getCurrentFormattedTime();
        
        // 判断订单类型
        const productName = String(orderDetail.product_name || '').toLowerCase();
        const serverUrl = String(orderDetail.server_url || '');
        
        // 1. 平台币充值订单
        const isPlatformCoinRecharge = productName.includes('平台币') || productName.includes('充值') || productName.includes('ptb') || serverUrl.includes('cashier');
        
        // 2. 礼包购买订单（通过 server_url 以 gift:// 开头判断）
        const isGiftOrder = serverUrl.startsWith('gift://');
        
        if (isPlatformCoinRecharge && !isGiftOrder) {
            // 平台币充值订单：直接给用户加平台币
            console.log('检测到平台币充值订单，开始处理平台币到账...');
            
            try {
                // 计算应该到账的平台币数量（按SystemParams系数，默认1:10）
                const rateStr = await getSystemParam('ptb_exchange_rate', '10');
                const rate = Math.max(1, parseFloat(rateStr) || 10);
                const orderAmount = parseFloat(String(orderDetail.amount || 0));
                const platformCoinsToAdd = orderAmount * rate;
                
                console.log(`计算平台币到账数量: ${orderAmount}元 × ${rate} = ${platformCoinsToAdd}平台币`);
                
                // 获取用户当前平台币余额
                const user = await sql({
                    query: 'SELECT id, platform_coins FROM users WHERE id = ?',
                    values: [orderDetail.user_id],
                }) as any[];
                
                if (user.length === 0) {
                    console.error('用户不存在:', orderDetail.user_id);
                    return {
                        success: false,
                        message: '用户不存在'
                    };
                }
                
                const currentPlatformCoins = parseFloat(user[0].platform_coins) || 0;
                
                console.log(`平台币余额更新: ${currentPlatformCoins} + ${platformCoinsToAdd}`);
                
                // 更新用户平台币余额（使用统一方法）
                const updateResult = await UserModel.updatePlatformCoinsUnified(orderDetail.user_id, platformCoinsToAdd, 2);
                if (!updateResult.success) {
                    console.error('平台币余额更新失败:', updateResult.message);
                    return {
                        success: false,
                        message: updateResult.message || '平台币余额更新失败'
                    };
                }
                
                const newPlatformCoins = updateResult.newBalance!;
                console.log('平台币余额更新成功!');
                
                // 更新订单状态为支付成功(3)，并记录平台币变化
                await sql({
                    query: `UPDATE paymentrecords 
                            SET payment_status = 3, 
                                notify_at = ?,
                                ptb_before = ?,
                                ptb_change = ?,
                                ptb_after = ?
                            WHERE transaction_id = ?`,
                    values: [currentTime, currentPlatformCoins, platformCoinsToAdd, newPlatformCoins, transaction_id],
                });
                
                console.log('订单状态更新为支付成功:', transaction_id);
                
                return {
                    success: true,
                    message: '支付确认成功，平台币已到账',
                    data: {
                        transaction_id,
                        payment_status: 3,
                        platform_coins_added: platformCoinsToAdd,
                        new_balance: newPlatformCoins
                    }
                };
            } catch (ptbError: any) {
                console.error('平台币到账处理失败:', ptbError);
                return {
                    success: false,
                    message: `平台币到账失败: ${ptbError.message}`
                };
            }
        } else if (isGiftOrder) {
            // 礼包购买订单：走礼包发放逻辑（IDIP）
            console.log('检测到礼包购买订单，开始处理礼包发放...');
            
            try {
                // 解析 server_url 中的元数据
                const encoded = serverUrl.slice('gift://'.length);
                const decoded = decodeURIComponent(encoded);
                const meta = JSON.parse(decoded || '{}');
                
                // 支持简化字段名（pid/cid/sid）和完整字段名
                const packageId = Number(meta.pid || meta.package_id || meta.packageId);
                const characterUuid = String(meta.cid || meta.character_uuid || meta.characterUuid || '');
                // 🔒 安全限制：强制购买数量为1，防止刷单
                const quantity = 1;
                const serverId = String(meta.sid || meta.server_id || meta.serverId || orderDetail.world_id || 1);
                
                console.log('礼包订单元数据:', { packageId, characterUuid, quantity, serverId });
                
                if (!packageId || !characterUuid) {
                    console.error('礼包订单参数缺失:', meta);
                    return {
                        success: false,
                        message: '礼包订单参数缺失'
                    };
                }
                
                // 获取礼包信息
                const giftPackage = await ExternalGiftPackageModel.getGiftPackageById(packageId);
                if (!giftPackage) {
                    console.error('礼包不存在, package_id=', packageId);
                    return {
                        success: false,
                        message: '礼包不存在'
                    };
                }
                
                // 检查用户是否可以购买该礼包（使用角色UUID进行限购检查）
                const checkResult = await ExternalGiftPackageModel.checkUserCanPurchase(characterUuid, packageId, quantity);
                if (!checkResult.canPurchase) {
                    console.error('礼包限购检查失败:', checkResult.reason);
                    return {
                        success: false,
                        message: checkResult.reason
                    };
                }
                
                // 创建礼包购买记录
                const purchaseRecord = {
                    user_id: orderDetail.user_id || 0,
                    thirdparty_uid: characterUuid,
                    package_id: packageId,
                    package_code: giftPackage.package_code,
                    package_name: giftPackage.package_name,
                    quantity,
                    unit_price: Number(giftPackage.price_real_money || 0),
                    total_amount: Number(giftPackage.price_real_money || 0) * quantity,
                    balance_before: 0,
                    balance_after: 0,
                    gift_items: giftPackage.gift_items,
                    status: 'paid' as const,
                    remark: `手动到账(交易:${transaction_id}) - 服务器${serverId}`,
                    game_delivery_status: 'waiting' as const
                };
                
                const insertResult = await ExternalGiftPackageModel.createPurchaseRecord(purchaseRecord);
                const purchaseRecordId = (insertResult as any)?.insertId;
                console.log('礼包购买记录已创建, 记录ID=', purchaseRecordId);
                
                // 更新支付记录的 role_id 为角色 UUID
                await PaymentModel.updateByTransactionId(transaction_id, {
                    role_id: characterUuid
                });
                
                // 如果是限量礼包，更新已售数量
                if (giftPackage.is_limited) {
                    await ExternalGiftPackageModel.updatePackageSoldQuantity(packageId, quantity);
                }
                
                // 发放礼包到游戏内（使用 IDIP）
                if (purchaseRecordId) {
                    const deliveryResult = await ExternalGiftPackageModel.deliverPackageToGameViaIDIP(
                        purchaseRecordId,
                        serverId,
                        characterUuid
                    );
                    
                    if (deliveryResult.success) {
                        console.log('礼包已成功发放, 交易ID=', transaction_id);
                        
                        // 更新订单状态为支付成功(3)
                        await PaymentModel.updateOrderStatus(transaction_id, 3, currentTime, currentTime);
                        
                        return {
                            success: true,
                            message: '支付确认成功，礼包已发放',
                            data: {
                                transaction_id,
                                payment_status: 3,
                                purchase_record_id: purchaseRecordId
                            }
                        };
                    } else {
                        console.error('礼包发放失败:', deliveryResult.message);
                        return {
                            success: false,
                            message: `礼包发放失败: ${deliveryResult.message}`
                        };
                    }
                } else {
                    return {
                        success: false,
                        message: '创建礼包购买记录失败'
                    };
                }
            } catch (giftError: any) {
                console.error('礼包订单处理失败:', giftError);
                return {
                    success: false,
                    message: `礼包订单处理失败: ${giftError.message}`
                };
            }
        } else {
            // 游戏充值订单：通知游戏服
            // 检查游戏服通知必要参数
            const hasNotifyParams = orderDetail.wuid && orderDetail.server_url;
            
            if (!hasNotifyParams) {
                // 缺少通知参数，无法通知游戏服，确认失败
                console.log('缺少通知参数，无法确认订单:', transaction_id, {
                    hasWuid: !!orderDetail.wuid,
                    hasServerUrl: !!orderDetail.server_url
                });
                
                return {
                    success: false,
                    message: '订单缺少游戏服通知必要参数，无法确认'
                };
            }
            
            try {
                // 调用游戏服通知，直接传入 server_url，函数内部会自动提取端口
                console.log('开始通知游戏服:', transaction_id);
                const notifyResult = await notifyGameServer(
                    String(orderDetail.transaction_id || ''),
                    String(orderDetail.wuid || ''),
                    String(orderDetail.server_url || ''),
                    undefined,
                    Number(orderDetail.world_id || 0)
                );
                
                console.log('游戏服通知结果:', notifyResult);
                
                if (notifyResult.success) {
                    // 游戏服通知成功，更新订单状态为支付成功(3)
                    await PaymentModel.updateOrderStatus(transaction_id, 3, currentTime, currentTime);
                    console.log('游戏服通知成功，订单状态更新为支付成功:', transaction_id);
                    
                    return {
                        success: true,
                        message: '支付确认成功',
                        data: {
                            transaction_id,
                            payment_status: 3
                        }
                    };
                } else {
                    // 游戏服通知失败，不设置订单为成功状态
                    console.error('游戏服通知失败，订单确认失败:', notifyResult.message);
                    
                    // 记录错误信息但不更新状态
                    await PaymentModel.updateOrderErrorMsg(transaction_id, `游戏服通知失败: ${notifyResult.message}`);
                    
                    return {
                        success: false,
                        message: `游戏服通知失败: ${notifyResult.message}`
                    };
                }
            } catch (notifyError: any) {
                // 通知异常，不设置订单为成功状态
                console.error('调用游戏服通知异常，订单确认失败:', notifyError);
                
                // 记录错误信息但不更新状态
                await PaymentModel.updateOrderErrorMsg(transaction_id, `游戏服通知异常: ${notifyError.message}`);
                
                return {
                    success: false,
                    message: `游戏服通知异常: ${notifyError.message}`
                };
            }
        }
    } catch (e: any) {
        console.error('确认支付异常:', e);
        throw createError({
            status: e.status || 500,
            message: e.message || '确认支付失败',
        });
    }
}; */

/**
 * SDK支付请求接口（代理到 op-admin）
 * user-center 不直接处理支付，将请求转发到 op-admin 的 /sdkapi/Unipay/pay
 */
export const doPayment = async (evt: H3Event) => {
    try {
        const { getSystemParam } = await import('../utils/systemConfig');
        const opAdminUrl = await getSystemParam('op_admin_url', 'https://pay.kccyei.cn');
        const targetUrl = `${opAdminUrl.replace(/\/+$/, '')}/sdkapi/Unipay/pay`;

        let body: any = {};
        const method = evt.node.req.method?.toUpperCase() || 'GET';
        if (method !== 'GET') {
            try { body = await readBody(evt); } catch { body = {}; }
        }
        const query = getQuery(evt) || {};
        const params = { ...query, ...(body && typeof body === 'object' ? body : {}) };

        // 清除前端签名（MD5），用 SDK 密钥（HMAC-SHA256）重新签名
        delete params.sign;
        delete params.__signed;
        const { computeSdkSign } = await import('../utils/sdkSign');
        const sdkSecret = await getSystemParam('sdk_sign_secret', 'AQE!@#a123JNJKO$@#fg1');
        params.sign = computeSdkSign(params, sdkSecret);

        const debugFields = Object.keys(params).filter(k => k !== 'sign' && k !== '__signed').sort();
        console.log(`[PaymentProxy] re-sign=${params.sign}, fields=[${debugFields.join(',')}]`);
        console.log(`[PaymentProxy] -> ${targetUrl}`);

        const resp = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': evt.node.req.headers['x-forwarded-for'] as string || '',
                'x-real-ip': evt.node.req.headers['x-real-ip'] as string || '',
                'user-agent': evt.node.req.headers['user-agent'] as string || '',
            },
            body: JSON.stringify(params),
        });

        const text = await resp.text();
        if (!text || !text.trim()) {
            console.error('[PaymentProxy] op-admin empty response');
            return { code: -1, msg: 'payment service unavailable', data: null };
        }

        try {
            const result = JSON.parse(text);
            console.log(`[PaymentProxy] <- code=${result.code}`);
            return result;
        } catch {
            console.error('[PaymentProxy] non-JSON response:', text.slice(0, 200));
            return { code: -1, msg: 'payment service error', data: null };
        }
    } catch (err: any) {
        console.error('[PaymentProxy] error:', err?.message || err);
        return { code: -1, msg: 'payment service unreachable', data: null };
    }
};

/**
 * 第三方支付通知处理
 */
export const handleThirdPartyNotify = async (evt: H3Event) => {
    const startTime = Date.now();
    const requestId = `notify_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        console.log(`[${requestId}] === 开始处理第三方支付回调 ===`);
        console.log(`[${requestId}] 时间: ${new Date().toISOString()}`);
        console.log(`[${requestId}] 请求方法: ${evt.node.req.method}`);
        console.log(`[${requestId}] 请求URL: ${evt.node.req.url}`);
        console.log(`[${requestId}] 请求头:`, evt.node.req.headers);

        // 获取请求参数 - 支持GET和POST方式
        const query = getQuery(evt);
        const requestMethod = evt.node.req.method?.toUpperCase();
        console.log(`[${requestId}] GET查询参数:`, query);

        let body: any = {};

        // 根据请求方法选择参数来源，避免在GET请求上调用readBody产生错误日志
        if (requestMethod === 'POST') {
            try {
                body = await readBody(evt);
                console.log(`[${requestId}] POST请求体读取成功:`, body);
            } catch (e) {
                console.log(`[${requestId}] POST body读取失败，回退到GET参数`);
                body = query;
            }
        } else {
            // GET请求直接使用query参数
            console.log(`[${requestId}] 检测到GET请求，使用query参数`);
            body = query;
        }

        console.log(`[${requestId}] 最终使用的通知参数:`, body);
        console.log(`[${requestId}] 参数类型:`, typeof body);
        console.log(`[${requestId}] 参数键值对:`, Object.keys(body));

        // 检查订单状态（先检查，避免查询不必要的订单）
        console.log(`[${requestId}] 订单状态:`, body.trade_status);
        if (body.trade_status !== 'TRADE_SUCCESS') {
            console.log(`[${requestId}] 订单状态不是成功:`, body.trade_status);
            setResponseStatus(evt, 200);
            return 'success'; // 即使不是成功状态也返回success避免重复通知
        }

        console.log(`[${requestId}] 订单状态验证成功!`);

        // 查找本地订单 - 使用 trade_no 匹配 mch_order_id
        console.log(`[${requestId}] 使用 trade_no 查找订单:`, body.trade_no);

        const result = await sql({
            query: 'SELECT * FROM paymentrecords WHERE mch_order_id = ? LIMIT 1',
            values: [body.trade_no]
        }) as any[];

        const localOrder = result.length > 0 ? result[0] : null;

        if (!localOrder) {
            console.error(`[${requestId}] 订单不存在, trade_no:`, body.trade_no);
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 订单查找成功!`, { transaction_id: localOrder.transaction_id, mch_order_id: localOrder.mch_order_id });

        // 验签：根据订单 the payment_id（渠道ID）选择对应的网关
        const dbChannelId = localOrder.payment_id;
        const channelId = String(dbChannelId || '1');
        console.log(`[${requestId}] [回调追踪] 订单号:${localOrder.transaction_id}, 数据库存的渠道ID:${dbChannelId}, 最终采用ID:${channelId}`);

        const { getProviderByChannelId } = await import('../utils/paymentGateways');
        let provider, credentials;
        try {
            const result = getProviderByChannelId(channelId);
            provider = result.provider;
            credentials = result.credentials;
            console.log(`[${requestId}] 使用渠道 ${channelId} 的配置进行验签`);
        } catch (error) {
            console.error(`[${requestId}] 获取支付渠道配置失败:`, error);
            // 降级到系统默认配置
            const { selectProviderBySystemParam } = await import('../utils/paymentGateways');
            const result = await selectProviderBySystemParam();
            provider = result.provider;
            credentials = result.credentials;
            console.log(`[${requestId}] 降级使用系统默认配置进行验签`);
        }

        const verified = provider.verify ? provider.verify(body, credentials) : true;
        if (!verified) {
            console.error(`[${requestId}] 签名验证失败! 渠道ID: ${channelId}`);
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 签名验证成功!`);

        // 检查订单是否已经处理过
        console.log(`[${requestId}] 检查订单处理状态:`, localOrder.payment_status);
        if (localOrder.payment_status === 3) {
            console.log(`[${requestId}] 订单已处理过:`, body.out_trade_no);
            setResponseStatus(evt, 200);
            return 'success';
        }

        // 验证金额
        console.log(`[${requestId}] 开始验证金额...`);
        const notifyAmount = parseFloat(body.money);
        const orderAmount = parseFloat(String(localOrder.amount || 0));
        console.log(`[${requestId}] 通知金额:`, notifyAmount, '订单金额:', orderAmount);

        if (Math.abs(notifyAmount - orderAmount) > 0.01) {
            console.error(`[${requestId}] 金额不匹配:`, { notify: notifyAmount, order: orderAmount });
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 金额验证成功!`);

        // 更新订单状态
        console.log(`[${requestId}] 开始更新订单状态为成功...`);
        console.log(`🔍 [第三方回调] 当前订单支付方式状态:`, {
            transactionId: localOrder.transaction_id,
            currentPaymentWay: localOrder.payment_way,
            isPaymentWayEmpty: !localOrder.payment_way,
            isPaymentWayUnknown: localOrder.payment_way === '未知',
            callbackType: body.type || 'unknown',
            callbackParams: body
        });

        // 修复支付方式字段
        await fixPaymentWay(localOrder, body, requestId);

        const currentTime = getCurrentFormattedTime();
        console.log(`[${requestId}] 更新参数:`, {
            transaction_id: localOrder.transaction_id,
            status: 3,
            currentTime,
            trade_no: body.trade_no
        });

        await PaymentModel.updateOrderStatus(localOrder.transaction_id || '', 3, currentTime, currentTime, body.trade_no);
        console.log(`[${requestId}] 订单状态更新完成!`);

        // --- 支付路由 Redis 额度累加 ---
        try {

            const isRoutingEnabled = await getSystemParam('payment_routing_enabled', 'false');
            if (isRoutingEnabled === 'true') {
                const { getOrderRuleMapping, incrementRedisUsedQuota } = await import('../model/paymentRouting');
                const ruleId = await getOrderRuleMapping(localOrder.transaction_id || '');
                if (ruleId) {
                    await incrementRedisUsedQuota(ruleId, notifyAmount);
                    console.log(`[${requestId}] 支付路由 Redis 额度已累加: 规则ID=${ruleId}, 金额=${notifyAmount}`);
                }
            }
        } catch (redisErr) {
            console.error(`[${requestId}] 支付路由 Redis 额度累加失败:`, redisErr);
        }
        // --- End ---

        const giftHandled = await processGiftOrder(localOrder, requestId, body.trade_no);

        if (!giftHandled) {
            // 延迟通知游戏服
            console.log(`[${requestId}] 设置延迟游戏服通知...`);
            setTimeout(async () => {
                try {
                    console.log(`[${requestId}] 开始执行延迟游戏服通知`);
                    await notifyGameServer(
                        String(localOrder.transaction_id || ''),
                        String(localOrder.wuid || ''),
                        String(localOrder.server_url || ''),
                        undefined,
                        Number(localOrder.world_id || 0)
                    );
                    console.log(`[${requestId}] 延迟游戏服通知完成`);
                } catch (error) {
                    console.error(`[${requestId}] 延迟通知游戏服失败:`, error);
                }
            }, 120000); // 120秒延迟
        } else {
            console.log(`[${requestId}] 礼包订单已处理，跳过游戏服通知`);
        }

        const endTime = Date.now();
        const processingTime = endTime - startTime;
        console.log(`[${requestId}] === 第三方支付回调处理完成，返回success ===`);
        console.log(`[${requestId}] 总处理时间: ${processingTime}ms`);
        setResponseStatus(evt, 200);
        return 'success';

    } catch (error: any) {
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        console.error(`[${requestId}] 处理第三方支付通知失败:`, error);
        console.error(`[${requestId}] 错误堆栈:`, error.stack);
        console.error(`[${requestId}] 处理时间: ${processingTime}ms`);
        setResponseStatus(evt, 200);
        return 'fail';
    }
};

/**
 * 收银台支付回调通知处理 - 专门处理平台币充值
 * 与普通支付回调不同，这里需要特殊的平台币到账逻辑
 */
export const handleCashierPaymentNotify = async (evt: H3Event) => {
    const startTime = Date.now();
    const requestId = `cashier_notify_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        console.log(`[${requestId}] === 开始处理收银台支付回调 ===`);
        console.log(`[${requestId}] 时间: ${new Date().toISOString()}`);
        console.log(`[${requestId}] 请求方法: ${evt.node.req.method}`);
        console.log(`[${requestId}] 请求URL: ${evt.node.req.url}`);
        console.log(`[${requestId}] 请求头:`, evt.node.req.headers);

        // 获取请求参数 - 支持GET和POST方式
        const query = getQuery(evt);
        const requestMethod = evt.node.req.method?.toUpperCase();
        console.log(`[${requestId}] GET查询参数:`, query);

        let body: any = {};

        // 根据请求方法选择参数来源，避免在GET请求上调用readBody产生错误日志
        if (requestMethod === 'POST') {
            try {
                body = await readBody(evt);
                console.log(`[${requestId}] POST请求体读取成功:`, body);
            } catch (e) {
                console.log(`[${requestId}] POST body读取失败，回退到GET参数`);
                body = query;
            }
        } else {
            // GET请求直接使用query参数
            console.log(`[${requestId}] 检测到GET请求，使用query参数`);
            body = query;
        }

        console.log(`[${requestId}] 最终使用的通知参数:`, body);
        console.log(`[${requestId}] 参数类型:`, typeof body);
        console.log(`[${requestId}] 参数键值对:`, Object.keys(body));

        // 检查订单状态（先检查，避免查询不必要的订单）
        console.log(`[${requestId}] 订单状态:`, body.trade_status);
        if (body.trade_status !== 'TRADE_SUCCESS') {
            console.log(`[${requestId}] 订单状态不是成功:`, body.trade_status);
            setResponseStatus(evt, 200);
            return 'success'; // 即使不是成功状态也返回success避免重复通知
        }

        console.log(`[${requestId}] 订单状态验证成功!`);

        // 查找本地订单 - 使用 trade_no 匹配 mch_order_id
        console.log(`[${requestId}] 使用 trade_no 查找订单:`, body.trade_no);

        const result = await sql({
            query: 'SELECT * FROM paymentrecords WHERE mch_order_id = ? LIMIT 1',
            values: [body.trade_no]
        }) as any[];

        const localOrder = result.length > 0 ? result[0] : null;

        if (!localOrder) {
            console.error(`[${requestId}] 订单不存在, trade_no:`, body.trade_no);
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 订单查找成功!`, { transaction_id: localOrder.transaction_id, mch_order_id: localOrder.mch_order_id });

        // 验签：根据订单 the payment_id（渠道ID）选择对应的网关
        const dbChannelId = localOrder.payment_id;
        const channelId = String(dbChannelId || '1');
        console.log(`[${requestId}] [回调追踪] 订单号:${localOrder.transaction_id}, 数据库存的渠道ID:${dbChannelId}, 最终采用ID:${channelId}`);

        const { getProviderByChannelId } = await import('../utils/paymentGateways');
        let provider, credentials;
        try {
            const result = getProviderByChannelId(channelId);
            provider = result.provider;
            credentials = result.credentials;
            console.log(`[${requestId}] 使用渠道 ${channelId} 的配置进行验签`);
        } catch (error) {
            console.error(`[${requestId}] 获取支付渠道配置失败:`, error);
            // 降级到系统默认配置
            const { selectProviderBySystemParam } = await import('../utils/paymentGateways');
            const result = await selectProviderBySystemParam();
            provider = result.provider;
            credentials = result.credentials;
            console.log(`[${requestId}] 降级使用系统默认配置进行验签`);
        }

        const verified = provider.verify ? provider.verify(body, credentials) : true;
        if (!verified) {
            console.error(`[${requestId}] 签名验证失败! 渠道ID: ${channelId}`);
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 签名验证成功!`);

        // 检查订单是否已经处理过
        console.log(`[${requestId}] 检查订单处理状态:`, localOrder.payment_status);
        if (localOrder.payment_status === 3) {
            console.log(`[${requestId}] 订单已处理过:`, body.out_trade_no);
            setResponseStatus(evt, 200);
            return 'success';
        }

        // 验证金额
        console.log(`[${requestId}] 开始验证金额...`);
        const notifyAmount = parseFloat(body.money);
        const orderAmount = parseFloat(String(localOrder.amount || 0));
        console.log(`[${requestId}] 通知金额:`, notifyAmount, '订单金额:', orderAmount);

        if (Math.abs(notifyAmount - orderAmount) > 0.01) {
            console.error(`[${requestId}] 金额不匹配:`, { notify: notifyAmount, order: orderAmount });
            setResponseStatus(evt, 200);
            return 'fail';
        }

        console.log(`[${requestId}] 金额验证成功!`);

        // 更新订单状态
        console.log(`[${requestId}] 开始更新订单状态为成功...`);
        console.log(`🔍 [第三方回调] 当前订单支付方式状态:`, {
            transactionId: localOrder.transaction_id,
            currentPaymentWay: localOrder.payment_way,
            isPaymentWayEmpty: !localOrder.payment_way,
            isPaymentWayUnknown: localOrder.payment_way === '未知',
            callbackType: body.type || 'unknown',
            callbackParams: body
        });

        // 修复支付方式字段
        await fixPaymentWay(localOrder, body, requestId);

        const currentTime = getCurrentFormattedTime();
        console.log(`[${requestId}] 更新参数:`, {
            transaction_id: localOrder.transaction_id,
            status: 3,
            currentTime,
            trade_no: body.trade_no
        });

        await PaymentModel.updateOrderStatus(localOrder.transaction_id || '', 3, currentTime, currentTime, body.trade_no);
        console.log(`[${requestId}] 订单状态更新完成!`);

        // --- 支付路由 Redis 额度累加 ---
        try {
            const { getSystemParam } = await import('../utils/systemConfig');
            const isRoutingEnabled = await getSystemParam('payment_routing_enabled', 'false');
            if (isRoutingEnabled === 'true') {
                const { getOrderRuleMapping, incrementRedisUsedQuota } = await import('../model/paymentRouting');
                const ruleId = await getOrderRuleMapping(localOrder.transaction_id || '');
                if (ruleId) {
                    await incrementRedisUsedQuota(ruleId, orderAmount);
                    console.log(`[${requestId}] 支付路由 Redis 额度已累加: 规则ID=${ruleId}, 金额=${orderAmount}`);
                }
            }
        } catch (redisErr) {
            console.error(`[${requestId}] 支付路由 Redis 额度累加失败:`, redisErr);
        }
        // --- End ---

        // ========== 收银台支付特殊处理：平台币到账逻辑 ==========
        console.log(`[${requestId}] 开始处理平台币到账...`);

        try {
            // 计算应该到账的平台币数量（按SystemParams系数，默认1:10）
            const rateStr = await getSystemParam('ptb_exchange_rate', '10');
            const rate = Math.max(1, parseFloat(rateStr) || 10);
            const platformCoinsToAdd = orderAmount * rate;
            console.log(`[${requestId}] 计算平台币到账数量: ${orderAmount}元 = ${platformCoinsToAdd}平台币`);

            // 获取用户当前平台币余额
            const user = await sql({
                query: 'SELECT id, platform_coins FROM users WHERE id = ?',
                values: [localOrder.user_id],
            }) as any[];

            if (user.length === 0) {
                console.error(`[${requestId}] 用户不存在:`, localOrder.user_id);
                setResponseStatus(evt, 200);
                return 'fail';
            }

            const currentPlatformCoins = parseFloat(user[0].platform_coins) || 0;

            console.log(`[${requestId}] 平台币余额更新: ${currentPlatformCoins} + ${platformCoinsToAdd}`);

            // 更新用户平台币余额（使用统一方法）
            const updateResult = await UserModel.updatePlatformCoinsUnified(localOrder.user_id, platformCoinsToAdd, 3);
            if (!updateResult.success) {
                console.error(`[${requestId}] 平台币余额更新失败:`, updateResult.message);
                setResponseStatus(evt, 200);
                return 'fail';
            }

            const newPlatformCoins = updateResult.newBalance!;
            console.log(`[${requestId}] 平台币余额更新成功!`);

            // 同步记录到 PaymentRecords（平台币充值的余额变化）
            try {
                await PaymentModel.updateByTransactionId(localOrder.transaction_id || '', {
                    ptb_before: currentPlatformCoins,
                    ptb_change: platformCoinsToAdd,
                    ptb_after: newPlatformCoins
                } as any);
                console.log(`[${requestId}] PaymentRecords 平台币变化已记录`, {
                    before: currentPlatformCoins,
                    change: platformCoinsToAdd,
                    after: newPlatformCoins
                });
            } catch (e: any) {
                console.warn(`[${requestId}] PaymentRecords 平台币变化记录失败(不影响到账):`, e?.message || e);
            }

            // 记录平台币充值日志
            await sql({
                query: 'INSERT INTO logs (log_type, log_content) VALUES (?, ?)',
                values: [
                    'platform_coin_recharge',
                    `用户ID: ${localOrder.user_id}, 用户名: ${localOrder.wuid}, 充值金额: ${orderAmount}元, 到账平台币: ${platformCoinsToAdd}, 交易ID: ${localOrder.transaction_id}`
                ],
            });

            console.log(`[${requestId}] 平台币充值日志记录成功!`);


        } catch (platformCoinError: any) {
            console.error(`[${requestId}] 平台币到账处理失败:`, platformCoinError);
            // 平台币到账失败不影响支付回调的成功响应，但需要记录错误
            await sql({
                query: 'INSERT INTO logs (log_type, log_content) VALUES (?, ?)',
                values: [
                    'platform_coin_recharge_error',
                    `用户ID: ${localOrder.user_id}, 交易ID: ${localOrder.transaction_id}, 错误: ${platformCoinError.message}`
                ],
            });
        }


        const endTime = Date.now();
        const processingTime = endTime - startTime;
        console.log(`[${requestId}] === 收银台支付回调处理完成，返回success ===`);
        console.log(`[${requestId}] 总处理时间: ${processingTime}ms`);
        setResponseStatus(evt, 200);
        return 'success';

    } catch (error: any) {
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        console.error(`[${requestId}] 处理收银台支付通知失败:`, error);
        console.error(`[${requestId}] 错误堆栈:`, error.stack);
        console.error(`[${requestId}] 处理时间: ${processingTime}ms`);
        setResponseStatus(evt, 200);
        return 'fail';
    }
};

// ========== 管理端辅助接口占位实现，避免路由引用为 undefined ==========
/**
 * 批量修复支付方式字段（占位实现）
 * @route POST /api/admin/payment/fix-payment-way
 */
export const fixPaymentWayBatch = async (evt: H3Event) => {
    try {
        const body = await readBody(evt).catch(() => ({}));
        console.log('[Admin] fixPaymentWayBatch 请求:', body);
        // 这里可根据需要实现实际修复逻辑；当前先返回占位响应
        return {
            success: true,
            message: '已接收指令（占位接口），当前未执行批量修复。'
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message || 'fixPaymentWayBatch 失败'
        };
    }
};

/**
 * 分析支付方式数据分布（占位实现）
 * @route GET /api/admin/payment/analyze-payment-way
 */
export const analyzePaymentWay = async (evt: H3Event) => {
    try {
        const query = getQuery(evt);
        console.log('[Admin] analyzePaymentWay 查询:', query);
        // 返回简单统计占位数据，避免路由报错
        return {
            success: true,
            data: {
                total: 0,
                byMethod: {}
            },
            message: '占位数据，未开启真实分析逻辑'
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message || 'analyzePaymentWay 失败'
        };
    }
};

/**
 * 询单接口 - 用于查询第三方支付订单状态
 * @route POST /api/user/payment/query
 */
export const queryPaymentOrder = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { transaction_id } = body;

        console.log('[PaymentQuery] 开始询单:', { transaction_id });

        if (!transaction_id) {
            return {
                code: 400,
                msg: '缺少订单号'
            };
        }

        // 查询本地订单
        const orderDetail = await PaymentModel.detailByTransId(transaction_id);
        if (!orderDetail) {
            return {
                code: 404,
                msg: '订单不存在:' + transaction_id
            };
        }

        console.log('[PaymentQuery] 订单详情:', {
            transaction_id,
            mch_order_id: orderDetail.mch_order_id,
            payment_status: orderDetail.payment_status,
            payment_way: orderDetail.payment_way
        });

        // 如果订单已经支付成功，直接返回成功状态
        if (orderDetail.payment_status === 3) {
            return {
                code: 200,
                msg: '订单已支付',
                data: {
                    status: 1,  // 已支付
                    transaction_id,
                    local_status: orderDetail.payment_status
                }
            };
        }

        // 动态导入询单工具函数
        const { executeQueryBySystemParam, isSupportQueryBySystemParam } = await import('../utils/paymentGateways');

        // 检查当前支付渠道是否支持询单
        const supportQuery = await isSupportQueryBySystemParam();
        if (!supportQuery) {
            return {
                code: 400,
                msg: '当前支付渠道不支持询单功能'
            };
        }

        // 调用第三方询单接口
        const queryResult = await executeQueryBySystemParam({
            out_trade_no: orderDetail.mch_order_id,
            trade_no: orderDetail.mch_order_id
        });

        console.log('[PaymentQuery] 询单结果:', queryResult);

        if (queryResult.code === 0) {
            // 询单成功
            const thirdPartyStatus = queryResult.status || 0;

            // 如果第三方返回已支付(status=1)，但本地状态不是3，需要处理到账逻辑
            if (thirdPartyStatus === 1 && orderDetail.payment_status !== 3) {
                console.log('[PaymentQuery] 检测到支付成功但本地未到账，触发到账逻辑');

                // 调用到账逻辑
                await processSuccessfulPayment(orderDetail, queryResult);

                return {
                    code: 200,
                    msg: '订单已支付并完成到账',
                    data: {
                        status: thirdPartyStatus,
                        transaction_id,
                        processed: true
                    }
                };
            }

            return {
                code: 200,
                msg: '询单成功',
                data: {
                    status: thirdPartyStatus,
                    transaction_id,
                    trade_no: queryResult.trade_no,
                    out_trade_no: queryResult.out_trade_no,
                    money: queryResult.money
                }
            };
        }

        return {
            code: queryResult.code,
            msg: queryResult.msg || '询单失败'
        };

    } catch (error: any) {
        console.error('[PaymentQuery] 询单异常:', error);
        return {
            code: 500,
            msg: error.message || '询单请求失败'
        };
    }
};

/**
 * 处理支付成功后的到账逻辑（从注释的confirmPayment提取）
 */
async function processSuccessfulPayment(orderDetail: any, queryResult: any) {
    try {
        const currentTime = getCurrentFormattedTime();
        const productName = String(orderDetail.product_name || '').toLowerCase();
        const serverUrl = String(orderDetail.server_url || '');

        // 1. 平台币充值订单
        const isPlatformCoinRecharge = productName.includes('平台币') || productName.includes('充值') || productName.includes('ptb') || serverUrl.includes('cashier');

        // 2. 礼包购买订单（通过 server_url 以 gift:// 开头判断）
        const isGiftOrder = serverUrl.startsWith('gift://');

        if (isPlatformCoinRecharge && !isGiftOrder) {
            console.log('[PaymentQuery] 处理平台币充值到账...');

            // 计算应该到账的平台币数量
            const rateStr = await getSystemParam('ptb_exchange_rate', '10');
            const rate = Math.max(1, parseFloat(rateStr) || 10);
            const orderAmount = parseFloat(String(orderDetail.amount || 0));
            const platformCoinsToAdd = orderAmount * rate;

            console.log(`[PaymentQuery] 计算平台币: ${orderAmount}元 × ${rate} = ${platformCoinsToAdd}平台币`);

            // 获取用户当前平台币余额
            const user = await sql({
                query: 'SELECT id, platform_coins FROM users WHERE id = ?',
                values: [orderDetail.user_id],
            }) as any[];

            if (user.length === 0) {
                console.error('[PaymentQuery] 用户不存在:', orderDetail.user_id);
                throw new Error('用户不存在');
            }

            const currentPlatformCoins = parseFloat(user[0].platform_coins) || 0;

            console.log(`[PaymentQuery] 平台币余额更新: ${currentPlatformCoins} + ${platformCoinsToAdd}`);

            // 更新用户平台币余额（使用统一方法）
            const updateResult = await UserModel.updatePlatformCoinsUnified(orderDetail.user_id, platformCoinsToAdd, 4);
            if (!updateResult.success) {
                console.error('[PaymentQuery] 平台币余额更新失败:', updateResult.message);
                throw new Error(updateResult.message || '平台币余额更新失败');
            }

            const newPlatformCoins = updateResult.newBalance!;

            // 更新订单状态为成功
            await PaymentModel.updateByTransactionId(orderDetail.transaction_id, {
                payment_status: 3,
                ptb_before: currentPlatformCoins,
                ptb_change: platformCoinsToAdd,
                ptb_after: newPlatformCoins
            });

            console.log('[PaymentQuery] 平台币充值到账完成');

        } else if (isGiftOrder) {
            console.log('[PaymentQuery] 处理礼包订单到账...');

            // 解析礼包元数据
            const metaStr = serverUrl.replace('gift://', '');
            let meta: any = {};
            try {
                meta = JSON.parse(decodeURIComponent(metaStr));
            } catch (e) {
                console.error('[PaymentQuery] 礼包元数据解析失败:', e);
            }

            const packageId = meta.pid;
            const characterUuid = meta.cid;
            const serverId = meta.sid || 1;

            console.log('[PaymentQuery] 礼包元数据:', { packageId, characterUuid, serverId });

            // 获取礼包信息（注意：表名是 externalgiftpackages）
            console.log('[PaymentQuery] 查询礼包信息, packageId:', packageId);
            const packageInfo: any = await sql({
                query: 'SELECT * FROM externalgiftpackages WHERE id = ?',
                values: [packageId]
            });

            console.log('[PaymentQuery] 礼包查询结果:', packageInfo.length > 0 ? '找到' : '未找到');

            if (packageInfo.length === 0) {
                console.error('[PaymentQuery] 礼包不存在:', packageId);
                throw new Error(`礼包不存在: id=${packageId}`);
            }

            const pkg = packageInfo[0];
            console.log('[PaymentQuery] 礼包信息:', {
                id: pkg.id,
                package_name: pkg.package_name,
                price_real_money: pkg.price_real_money
            });

            // 解析 gift_items
            let giftItems;
            try {
                giftItems = typeof pkg.gift_items === 'string' ? JSON.parse(pkg.gift_items) : pkg.gift_items;
                console.log('[PaymentQuery] gift_items 解析成功');
            } catch (parseError: any) {
                console.error('[PaymentQuery] gift_items 解析失败:', parseError.message);
                throw new Error(`礼包物品配置解析失败: ${parseError.message}`);
            }

            // 创建礼包购买记录（如果不存在）
            console.log('[PaymentQuery] 创建礼包购买记录...');
            const purchaseRecord = {
                user_id: orderDetail.user_id,
                thirdparty_uid: characterUuid,
                package_id: packageId,
                package_code: pkg.package_code || '',
                package_name: pkg.package_name,
                quantity: 1,
                unit_price: parseFloat(orderDetail.amount || 0),
                total_amount: parseFloat(orderDetail.amount || 0),
                balance_before: 0,
                balance_after: 0,
                gift_items: pkg.gift_items,
                status: 'paid' as const,
                remark: `第三方支付购买 - 询单补偿发放`
            };

            console.log('[PaymentQuery] 导入 ExternalGiftPackageModel...');
            const ExternalGiftPackageModel = await import('../model/externalGiftPackage');

            console.log('[PaymentQuery] 调用 createPurchaseRecord, 参数:', {
                user_id: purchaseRecord.user_id,
                package_id: purchaseRecord.package_id,
                package_name: purchaseRecord.package_name,
                total_amount: purchaseRecord.total_amount
            });
            const createResult: any = await ExternalGiftPackageModel.createPurchaseRecord(purchaseRecord);
            const purchaseRecordId = createResult.insertId;

            console.log('[PaymentQuery] 购买记录创建成功, 记录ID:', purchaseRecordId);

            // 使用 IDIP 方式发放礼包到游戏内
            console.log('[PaymentQuery] 开始发放礼包到游戏内, 参数:', {
                purchaseRecordId,
                serverId: serverId.toString(),
                characterUuid
            });

            try {
                const deliveryResult = await ExternalGiftPackageModel.deliverPackageToGameViaIDIP(
                    purchaseRecordId,
                    serverId.toString(),
                    characterUuid
                );

                console.log('[PaymentQuery] IDIP 发放返回结果:', JSON.stringify(deliveryResult));

                if (deliveryResult.success) {
                    console.log('[PaymentQuery] ✅ 礼包发放成功!');
                    // 记录到账时间
                    const currentTime = getCurrentFormattedTime();
                    await PaymentModel.updateByTransactionId(orderDetail.transaction_id, {
                        notify_at: currentTime,
                        msg: '礼包发放成功'
                    });
                } else {
                    console.error('[PaymentQuery] ❌ 礼包发放失败:', deliveryResult.message);
                    throw new Error(deliveryResult.message || '礼包发放失败');
                }
            } catch (deliveryError: any) {
                console.error('[PaymentQuery] ❌ 礼包发放异常:', deliveryError.message || deliveryError);
                console.error('[PaymentQuery] 异常堆栈:', deliveryError.stack);
                throw deliveryError;
            }

            // 更新订单状态
            console.log('[PaymentQuery] 更新订单状态为成功, transaction_id:', orderDetail.transaction_id);
            await PaymentModel.updateOrderStatus(orderDetail.transaction_id, 3);
            console.log('[PaymentQuery] 订单状态更新完成');

            console.log('[PaymentQuery] ✅ 礼包订单处理完成');
        }

        console.log('[PaymentQuery] ✅ 到账逻辑处理完成');

    } catch (error: any) {
        console.error('[PaymentQuery] ❌ 到账逻辑处理失败');
        console.error('[PaymentQuery] 错误类型:', error.constructor.name);
        console.error('[PaymentQuery] 错误消息:', error.message);
        console.error('[PaymentQuery] 错误堆栈:', error.stack);
        if (error.sql) {
            console.error('[PaymentQuery] SQL错误:', error.sql);
            console.error('[PaymentQuery] SQL参数:', error.sqlParameters);
        }
        throw error;
    }
}



// 已移除重复的 getSystemParam 函数，统一使用 systemConfig.ts 中的
// import { getSystemParam } from '../utils/systemConfig' (应该在文件顶部导入)