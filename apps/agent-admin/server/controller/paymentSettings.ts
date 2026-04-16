import * as PaymentSettingsModel from '../model/paymentSettings';
import { H3Event } from 'h3';
import { sql } from '../db';
import { sdkMessages } from '../utils/i18n';

// 获取所有支付设置
export const getAllPaymentSettings = async (evt: H3Event) => {
    try {
        const paymentSettings = await PaymentSettingsModel.read();
        
        return {
            code: 200,
            data: paymentSettings,
            message: '获取支付设置成功'
        };
    } catch (error: any) {
        console.error('获取支付设置失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取支付设置失败',
        });
    }
};

// 获取启用的支付设置
export const getActivePaymentSettings = async (evt: H3Event) => {
    try {
        const paymentSettings = await PaymentSettingsModel.GetOpenPaySetting();
        
        return {
            code: 200,
            data: paymentSettings,
            message: '获取启用支付设置成功'
        };
    } catch (error: any) {
        console.error('获取启用支付设置失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取启用支付设置失败',
        });
    }
};

// 用户侧：获取启用且客户端可用的支付方式（需用户登录，非管理员）
export const getActivePaymentSettingsForUser = async (evt: H3Event) => {
    try {
        // 用户中心：按 isClose=1 返回启用方式，不再使用 clientIsClose 过滤（clientIsClose 仅用于 SDK/客户端）
        const paymentSettings = await PaymentSettingsModel.GetOpenPaySetting();
        const clientEnabled = paymentSettings || [];
        return {
            code: 200,
            data: clientEnabled,
            message: '获取启用支付方式成功'
        };
    } catch (error: any) {
        console.error('获取启用支付方式失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取启用支付方式失败',
        });
    }
};

// 创建支付设置
export const createPaymentSetting = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        // 验证必需字段
        if (!body.payment_method || !body.payment_channel) {
            throw createError({
                status: 400,
                message: '支付方式和支付渠道为必填项',
            });
        }

        // 验证金额
        if (body.MaxPrice <= body.MinPrice) {
            throw createError({
                status: 400,
                message: '最大金额必须大于最小金额',
            });
        }

        const paymentSettingData = {
            payment_method: body.payment_method,
            payment_channel: body.payment_channel,
            icon_url: body.icon_url || '',
            request_url: body.request_url || '',
            MinPrice: body.MinPrice || 0,
            MaxPrice: body.MaxPrice || 0,
            Sort: body.Sort || 0,
            isClose: body.isClose !== undefined ? body.isClose : 1,
            clientIsClose: body.clientIsClose !== undefined ? body.clientIsClose : 1
        };

        const result = await PaymentSettingsModel.insert(paymentSettingData);
        
        return {
            code: 200,
            data: result,
            message: '创建支付设置成功'
        };
    } catch (error: any) {
        console.error('创建支付设置失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '创建支付设置失败',
        });
    }
};

// 更新支付设置
export const updatePaymentSetting = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        if (!body.id) {
            throw createError({
                status: 400,
                message: '缺少支付设置ID',
            });
        }

        // 验证支付设置是否存在
        const existingSetting = await PaymentSettingsModel.detail(body.id.toString());
        if (!existingSetting) {
            throw createError({
                status: 404,
                message: '支付设置不存在',
            });
        }

        // 验证必需字段
        if (!body.payment_method || !body.payment_channel) {
            throw createError({
                status: 400,
                message: '支付方式和支付渠道为必填项',
            });
        }

        // 验证金额
        if (body.MaxPrice <= body.MinPrice) {
            throw createError({
                status: 400,
                message: '最大金额必须大于最小金额',
            });
        }

        const paymentSettingData = {
            id: body.id,
            payment_method: body.payment_method,
            payment_channel: body.payment_channel,
            icon_url: body.icon_url || '',
            request_url: body.request_url || '',
            MinPrice: body.MinPrice || 0,
            MaxPrice: body.MaxPrice || 0,
            Sort: body.Sort || 0,
            isClose: body.isClose !== undefined ? body.isClose : 1,
            clientIsClose: body.clientIsClose !== undefined ? body.clientIsClose : 1
        };

        await PaymentSettingsModel.update(paymentSettingData);
        
        return {
            code: 200,
            message: '更新支付设置成功'
        };
    } catch (error: any) {
        console.error('更新支付设置失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '更新支付设置失败',
        });
    }
};

// 删除支付设置
export const deletePaymentSetting = async (evt: H3Event) => {
    try {
        const id = getRouterParam(evt, 'id');
        
        if (!id) {
            throw createError({
                status: 400,
                message: '缺少支付设置ID',
            });
        }

        // 验证支付设置是否存在
        const existingSetting = await PaymentSettingsModel.detail(id);
        if (!existingSetting) {
            throw createError({
                status: 404,
                message: '支付设置不存在',
            });
        }

        await PaymentSettingsModel.remove(parseInt(id));
        
        return {
            code: 200,
            message: '删除支付设置成功'
        };
    } catch (error: any) {
        console.error('删除支付设置失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '删除支付设置失败',
        });
    }
};

// SDK接口：获取支付方式
export const getPayWay = async (evt: H3Event) => {
    try {
        // 兼容 GET 与 POST：优先 body，否则用 query
        let body: any = {};
        try {
            body = await readBody(evt);
        } catch {}
        if (!body || Object.keys(body).length === 0) {
            const q = getQuery(evt);
            body = {
                username: q.username,
                gid: q.gid ? Number(q.gid) : undefined,
                money: q.money ? Number(q.money) : undefined
            };
        }
        console.log("getPayWay 请求参数:", body);
        
        const {
            username,        // 用户名
            gid: gameId,     // 游戏ID  
            money           // 充值金额
        } = body;

        if (!money || money <= 0) {
            setResponseStatus(evt, 200);
            return {
                code: "0",
                data: [],
                msg: sdkMessages.payment.invalidAmount(),
                djq: null,
                ttb: null,
                discount: null,
                flb: 0,
                rechargeUrl: ''
            };
        }

        // 获取启用的支付设置（按用户中心开关）
        const paymentSettings = await PaymentSettingsModel.GetOpenPaySetting();
        
        // 过滤出客户端启用且符合金额范围的支付方式
        const validPaymentMethods = paymentSettings.filter(setting => {
            if ((setting as any).clientIsClose === 0) return false;
            return money >= setting.MinPrice! && money <= setting.MaxPrice!;
        });

        // 按排序字段排序
        validPaymentMethods.sort((a, b) => (a.Sort || 0) - (b.Sort || 0));

        // 转换为API响应格式
        const paymentData = validPaymentMethods.map(setting => {
            const baseUrl = "https://api.lzb88.com/static/paytype/";
            let icon = "";
            let amountStr = "";
            let moneyStr = "";
            let displayName = "";
            
            // 使用支付方式(payment_method)来判断类型和显示名称
            switch (setting.payment_method) {
                case 'zfb':
                    displayName = "支付宝";
                    icon = `${baseUrl}zfb.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
                    break;
                case 'wx':
                    displayName = "微信支付";
                    icon = `${baseUrl}wx.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
                    break;
                case 'ptb':
                    displayName = "平台币";
                    icon = `${baseUrl}ptb.png`;
                    amountStr = `${money}平台币`;
                    moneyStr = `${money}平台币`;
                    break;
                case 'djq':
                    displayName = "代金券";
                    icon = `${baseUrl}djq.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
                    break;
                case 'kf':
                    displayName = "客服";
                    icon = `${baseUrl}kf.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
                    break;
                case 'flb':
                    displayName = "福利币";
                    icon = `${baseUrl}flb.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
                    break;
                default:
                    displayName = setting.payment_method; // 兜底显示原始类型
                    icon = `${baseUrl}default.png`;
                    amountStr = `${money}元`;
                    moneyStr = `${money}元`;
            }

            return {
                name: displayName, // 根据paytype显示对应的中文名称
                paytype: setting.payment_method, // 使用支付方式作为类型
                yue: setting.payment_method === 'ptb' ? "0" : "",
                icon: setting.icon_url || icon, // 优先使用数据库配置的图标URL
                discount: "",
                amount_str: amountStr,
                amount: money.toString(),
                money_str: moneyStr
            };
        });

        // 获取用户平台币余额和生成充值链接
        let userPlatformCoins = 0;
        let rechargeUrl = '';
        let userId: number | null = null;
        
        if (username) {
            try {
                console.log(`开始查询用户平台币余额，username: ${username}`);
                
                // 直接通过username查询Users表
                const userResult = await sql({
                    query: 'SELECT id, username, platform_coins FROM Users WHERE username = ? LIMIT 1',
                    values: [username]
                }) as any[];
                
                console.log(`用户查询结果:`, userResult);
                
                if (userResult && userResult.length > 0) {
                    userId = userResult[0].id;
                    userPlatformCoins = parseFloat(userResult[0].platform_coins) || 0;
                    console.log(`找到用户: ID=${userResult[0].id}, username=${userResult[0].username}, platform_coins=${userResult[0].platform_coins}`);
                    

                } else {
                    console.log(`未找到用户，username: ${username}`);
                    
                    // 如果直接查询username没找到，再试试查询所有用户看看数据情况
                    const allUsersResult = await sql({
                        query: 'SELECT id, username, platform_coins FROM Users LIMIT 5',
                        values: []
                    }) as any[];
                    console.log(`数据库中前5个用户:`, allUsersResult);
                }
                
                console.log(`最终平台币余额: ${userPlatformCoins}`);
            } catch (error) {
                console.log('获取用户平台币余额失败:', error);
            }
        } else {
            console.log('username参数为空，无法查询平台币余额');
        }

        // 更新平台币余额显示
        const platformCoinPayment = paymentData.find(p => p.paytype === 'ptb');
        if (platformCoinPayment) {
            platformCoinPayment.yue = userPlatformCoins.toString();
        }

        // 从系统参数获取支付说明
        const SystemParamsModel = await import('../model/systemParams');
        const paymentMessage = await SystemParamsModel.getPaymentMessage();

        setResponseStatus(evt, 200);
        return {
            code: "1",
            data: paymentData,
            msg: paymentMessage,
            djq: null,
            ttb: null,
            discount: null,
            flb: 0,
        };

    } catch (error: any) {
        console.error('getPayWay 接口异常:', error);
        setResponseStatus(evt, 200);
        return {
            code: "0",
            data: [],
            msg: error.message || sdkMessages.payment.getPaymentMethodsFailed(),
            djq: null,
            ttb: null,
            discount: null,
            flb: 0,

        };
    }
};

