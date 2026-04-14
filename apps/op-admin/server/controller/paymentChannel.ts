import { H3Event, readBody, createError } from 'h3';
import { getSystemParam, getSystemConfig } from '../utils/systemConfig';
import { sql } from '../db';
import * as PaymentModel from '../model/payment';
import { executePaymentByChannelId, gatewayParamSets } from '../utils/paymentGateways';

// 获取所有支付渠道配置
export const getAllPaymentChannels = async (evt: H3Event) => {
    try {
        // 从 paymentGateways.ts 导入配置
        const { gatewayParamSets } = await import('../utils/paymentGateways');
        
        // 获取当前默认使用的渠道
        const currentChannel = await getSystemParam('payment', '1');
        
        // 转换为数组格式，方便前端使用
        const channels = Object.entries(gatewayParamSets).map(([id, config]) => ({
            id,
            name: (config as any).name ||  `渠道${id}`, // 优先显示备注/名称
            provider: config.providerKey,
            supportQuery: config.supportQuery || false,
            isOpen: config.isOpen !== false,  // 默认为启用
            isDefault: id === currentChannel,
            credentials: {
                baseUrl: config.credentials.baseUrl,
                pid: config.credentials.pid,
                // 不返回敏感信息（密钥）
                hasMd5Key: !!config.credentials.md5Key,
                hasRsaKey: !!config.credentials.rsaPrivateKey,
                merchantId: config.credentials.merchantId || null,
                defaultMethod: config.credentials.defaultMethod || null
            }
        }));
        
        return {
            code: 200,
            data: {
                channels,
                currentChannel,
                totalChannels: channels.length
            },
            message: '获取成功'
        };
    } catch (error: any) {
        console.error('获取支付渠道失败:', error);
        throw error;
    }
};

// 切换默认支付渠道
export const switchPaymentChannel = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { channel_id } = body;
        
        if (!channel_id) {
            throw createError({
                statusCode: 400,
                message: '缺少渠道ID'
            });
        }
        
        // 验证渠道是否存在
        const { gatewayParamSets } = await import('../utils/paymentGateways');
        if (!gatewayParamSets[channel_id]) {
            throw createError({
                statusCode: 404,
                message: '渠道不存在'
            });
        }
        
        // 更新系统参数
        const { sql } = await import('../db');
        await sql({
            query: 'UPDATE SystemParams SET content = ? WHERE `key` = ?',
            values: [channel_id, 'payment']
        });
        
        return {
            code: 200,
            data: { channel_id },
            message: `已切换到渠道 ${channel_id}`
        };
    } catch (error: any) {
        console.error('切换支付渠道失败:', error);
        throw error;
    }
};

// 获取支付渠道统计信息
export const getPaymentChannelStats = async (evt: H3Event) => {
    try {
        // 统计各渠道的订单数量和金额（最近30天）
        const stats: any = await sql({
            query: `
                SELECT 
                    payment_way,
                    COUNT(*) as order_count,
                    SUM(CASE WHEN payment_status = 3 THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN payment_status = 3 THEN amount ELSE 0 END) as success_amount,
                    SUM(amount) as total_amount
                FROM Payment
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY payment_way
            `
        });
        
        return {
            code: 200,
            data: stats,
            message: '获取成功'
        };
    } catch (error: any) {
        console.error('获取统计信息失败:', error);
        throw error;
    }
};

function getClientIp(evt: H3Event): string {
    const headers = evt.node.req.headers;
    const xff = headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim().length > 0) {
        return xff.split(',')[0].trim();
    }
    const xReal = headers['x-real-ip'];
    if (typeof xReal === 'string' && xReal.trim().length > 0) {
        return xReal.trim();
    }
    return evt.node.req.socket.remoteAddress || '127.0.0.1';
}

const PAYMENT_WAY_LABEL: Record<string, string> = {
    alipay: '支付宝',
    wxpay: '微信',
    bank: '银联'
};

export const createPlatformCoinOrder = async (evt: H3Event) => {
    let transactionId: string | null = null;
    try {
        const body = await readBody(evt);
        const channelIdRaw = body?.channel_id ?? body?.channelId;
        const userIdRaw = body?.user_id ?? body?.userId;
        const amountRaw = body?.amount;
        const payTypeRaw = (body?.pay_type ?? body?.payType ?? 'alipay').toString().toLowerCase();

        if (!channelIdRaw) {
            throw createError({ statusCode: 400, message: '缺少渠道ID' });
        }
        if (userIdRaw === undefined || userIdRaw === null || userIdRaw === '') {
            throw createError({ statusCode: 400, message: '缺少用户ID' });
        }
        if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
            throw createError({ statusCode: 400, message: '缺少充值金额' });
        }

        const channelId = String(channelIdRaw);
        const amountNum = Number(amountRaw);
        const userId = Number(userIdRaw);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw createError({ statusCode: 400, message: '用户ID必须为正整数' });
        }
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            throw createError({ statusCode: 400, message: '充值金额必须大于0' });
        }

        const channelConfig = gatewayParamSets[channelId];
        if (!channelConfig) {
            throw createError({ statusCode: 404, message: '渠道不存在' });
        }
        if (channelConfig.isOpen === false) {
            throw createError({ statusCode: 400, message: '渠道已关闭，无法创建订单' });
        }

        const payType = ['alipay', 'wxpay', 'bank'].includes(payTypeRaw) ? payTypeRaw : 'alipay';
        const paymentWay = PAYMENT_WAY_LABEL[payType] || payType;

        const userRows = await sql({
            query: 'SELECT id, username, channel_code, game_code FROM Users WHERE id = ? LIMIT 1',
            values: [userId]
        }) as Array<{ id: number; username: string; channel_code?: string; game_code?: string }>;

        if (userRows.length === 0) {
            throw createError({ statusCode: 404, message: '用户不存在' });
        }

        const user = userRows[0];
        const amountFixed = Number(amountNum.toFixed(2));
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        const prefix = payType === 'wxpay' ? 'wx' : payType === 'bank' ? 'yl' : 'zfb';
        transactionId = `${prefix}_manual_${channelId}_${Date.now()}_${randomSuffix}`;
        const mchOrderId = transactionId;

        await PaymentModel.insert({
            user_id: user.id,
            sub_user_id: null,
            role_id: '',
            transaction_id: transactionId,
            wuid: '',
            payment_way: paymentWay,
            payment_id: parseInt(channelId, 10) || 0,
            world_id: 1,
            product_name: '平台币充值',
            product_des: `管理员通过渠道${channelId}手动创建的平台币充值`,
            ip: '',
            amount: amountFixed,
            mch_order_id: mchOrderId,
            msg: 'MANUAL_CHANNEL_PLATFORM_COIN',
            server_url: 'cashier://manual-platform-coin',
            device: 'admin',
            channel_code: user.channel_code || '',
            game_code: user.game_code || '',
            payment_status: 0
        });

        const systemConfig = await getSystemConfig();
        const notifyBase = (systemConfig.notify_url || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const notifyUrl = `${notifyBase}/api/payment/third-party-notify`;
        const returnUrl = `${systemConfig.pay_suc_url}?transaction_id=${transactionId}`;
        const clientIp = getClientIp(evt);

        const thirdPartyResult = await executePaymentByChannelId(channelId, {
            type: payType,
            out_trade_no: mchOrderId,
            name: '平台币充值',
            money: amountFixed.toFixed(2),
            notify_url: notifyUrl,
            return_url: returnUrl,
            clientip: clientIp,
            device: 'pc',
            param: transactionId
        });

        if (thirdPartyResult.code === 1) {
            await PaymentModel.updateOrderStatus(transactionId, 1);
            if (thirdPartyResult.trade_no) {
                await PaymentModel.updateByTransactionId(transactionId, { mch_order_id: thirdPartyResult.trade_no });
            }

            const qrBase = systemConfig.qrcode_url || `${process.env.BASE_URL || 'http://localhost:3000'}/user/qrcode`;
            const qrPage = thirdPartyResult.qrcode
                ? `${qrBase}?transaction_id=${transactionId}&qrcode=${encodeURIComponent(thirdPartyResult.qrcode)}`
                : null;

            return {
                code: 200,
                message: '订单创建成功',
                data: {
                    transaction_id: transactionId,
                    mch_order_id: thirdPartyResult.trade_no || mchOrderId,
                    pay_url: thirdPartyResult.payurl || thirdPartyResult.urlscheme || null,
                    qrcode: thirdPartyResult.qrcode || null,
                    qr_page: qrPage,
                    html: thirdPartyResult.html || null
                }
            };
        }

        console.error('[Manual Platform Coin] 第三方返回失败:', thirdPartyResult);
        await PaymentModel.updateOrderStatus(transactionId, 2);
        await PaymentModel.updateOrderErrorMsg(transactionId, thirdPartyResult.msg || JSON.stringify(thirdPartyResult));
        throw createError({ statusCode: 502, message: thirdPartyResult.msg || '第三方返回失败', data: thirdPartyResult });
    } catch (error: any) {
        if (transactionId) {
            try {
                await PaymentModel.updateOrderStatus(transactionId, 2);
                if (error?.message) {
                    await PaymentModel.updateOrderErrorMsg(transactionId, error.message);
                }
            } catch (updateError) {
                console.error('更新手动订单状态失败:', updateError);
            }
        }
        console.error('创建平台币手动订单失败:', error);
        throw createError({
            statusCode: error?.statusCode || 500,
            message: error?.message || '创建订单失败'
        });
    }
};

