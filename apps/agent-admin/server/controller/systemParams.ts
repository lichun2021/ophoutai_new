import * as SystemParamsModel from '../model/systemParams';
import { H3Event } from 'h3';

// 获取所有系统参数
export const getAllSystemParams = async (evt: H3Event) => {
    try {
        const systemParams = await SystemParamsModel.read();
        
        return {
            code: 200,
            data: systemParams,
            message: '获取系统参数成功'
        };
    } catch (error: any) {
        console.error('获取系统参数失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取系统参数失败',
        });
    }
};

// 获取单个系统参数
export const getSystemParam = async (evt: H3Event) => {
    try {
        const key = getRouterParam(evt, 'key');
        
        if (!key) {
            throw createError({
                status: 400,
                message: '缺少参数key',
            });
        }

        const param = await SystemParamsModel.detail(key);
        
        return {
            code: 200,
            data: param,
            message: '获取系统参数成功'
        };
    } catch (error: any) {
        console.error('获取系统参数失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '获取系统参数失败',
        });
    }
};

// 创建系统参数
export const createSystemParam = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        if (!body.key || !body.content) {
            throw createError({
                status: 400,
                message: 'key和content为必填项',
            });
        }

        // 检查key是否已存在
        const existing = await SystemParamsModel.detail(body.key);
        if (existing) {
            throw createError({
                status: 400,
                message: '参数key已存在',
            });
        }

        const result = await SystemParamsModel.insert({
            key: body.key,
            content: body.content
        });
        
        return {
            code: 200,
            data: result,
            message: '创建系统参数成功'
        };
    } catch (error: any) {
        console.error('创建系统参数失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '创建系统参数失败',
        });
    }
};

// 更新系统参数
export const updateSystemParam = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        if (!body.key || !body.content) {
            throw createError({
                status: 400,
                message: 'key和content为必填项',
            });
        }

        // 验证参数是否存在
        const existing = await SystemParamsModel.detail(body.key);
        if (!existing) {
            throw createError({
                status: 404,
                message: '系统参数不存在',
            });
        }

        await SystemParamsModel.update(body.key, body.content);
        
        return {
            code: 200,
            message: '更新系统参数成功'
        };
    } catch (error: any) {
        console.error('更新系统参数失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '更新系统参数失败',
        });
    }
};

// 删除系统参数
export const deleteSystemParam = async (evt: H3Event) => {
    try {
        const key = getRouterParam(evt, 'key');
        
        if (!key) {
            throw createError({
                status: 400,
                message: '缺少参数key',
            });
        }

        // 验证参数是否存在
        const existing = await SystemParamsModel.detail(key);
        if (!existing) {
            throw createError({
                status: 404,
                message: '系统参数不存在',
            });
        }

        await SystemParamsModel.remove(key);
        
        return {
            code: 200,
            message: '删除系统参数成功'
        };
    } catch (error: any) {
        console.error('删除系统参数失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '删除系统参数失败',
        });
    }
};

// 获取支付说明
export const getPaymentMessage = async (evt: H3Event) => {
    try {
        const message = await SystemParamsModel.getPaymentMessage();
        
        return {
            code: 200,
            data: { message },
            message: '获取支付说明成功'
        };
    } catch (error: any) {
        console.error('获取支付说明失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取支付说明失败',
        });
    }
};

// 设置支付说明
export const setPaymentMessage = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        if (!body.message) {
            throw createError({
                status: 400,
                message: '支付说明不能为空',
            });
        }

        await SystemParamsModel.setPaymentMessage(body.message);
        
        return {
            code: 200,
            message: '设置支付说明成功'
        };
    } catch (error: any) {
        console.error('设置支付说明失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '设置支付说明失败',
        });
    }
}; 

// 用户侧公开读取：PTB 汇率（需用户登录但非管理员权限）
export const getPublicPTBRate = async (evt: H3Event) => {
    try {
        const param = await SystemParamsModel.detail('ptb_exchange_rate');
        return {
            code: 200,
            data: param,
            message: '获取成功'
        };
    } catch (error: any) {
        console.error('获取 PTB 汇率失败:', error);
        throw createError({ status: 500, message: error.message || '获取失败' });
    }
};

// 用户侧：按 key 读取有限白名单的系统参数
export const getPublicParamByKey = async (evt: H3Event) => {
    try {
        // 仅允许的公开键
        const whitelist = new Set<string>(['ptb_exchange_rate', 'kefu_line']);
        // @ts-ignore
        const key = (evt.context?.params?.key) || (evt as any).context?.params?.key;
        const k = String(key || '').trim();
        if (!k || !whitelist.has(k)) {
            throw createError({ status: 404, message: '参数不可用' });
        }
        const param = await SystemParamsModel.detail(k);
        return { code: 200, data: param, message: '获取成功' };
    } catch (error: any) {
        throw createError({ status: error.status || 500, message: error.message || '获取失败' });
    }
};

// 获取API到账开关状态
export const getApiDeliveryEnabled = async (evt: H3Event) => {
    try {
        const enabled = await SystemParamsModel.getApiDeliveryEnabled();
        
        return {
            code: 200,
            data: { enabled },
            message: '获取API到账开关成功'
        };
    } catch (error: any) {
        console.error('获取API到账开关失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取API到账开关失败',
        });
    }
};

// 设置API到账开关
export const setApiDeliveryEnabled = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        if (typeof body.enabled !== 'boolean') {
            throw createError({
                status: 400,
                message: 'enabled参数必须是布尔值',
            });
        }

        await SystemParamsModel.setApiDeliveryEnabled(body.enabled);
        
        return {
            code: 200,
            message: 'API到账开关设置成功'
        };
    } catch (error: any) {
        console.error('设置API到账开关失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '设置API到账开关失败',
        });
    }
};

// 获取API到账测试玩家role_id
export const getApiDeliveryTestRoleId = async (evt: H3Event) => {
    try {
        const roleId = await SystemParamsModel.getApiDeliveryTestRoleId();
        
        return {
            code: 200,
            data: { roleId },
            message: '获取测试玩家role_id成功'
        };
    } catch (error: any) {
        console.error('获取测试玩家role_id失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取测试玩家role_id失败',
        });
    }
};

// 设置API到账测试玩家role_id
export const setApiDeliveryTestRoleId = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        
        const roleId = String(body.roleId || '').trim();

        await SystemParamsModel.setApiDeliveryTestRoleId(roleId);
        
        return {
            code: 200,
            message: roleId ? `测试玩家role_id设置成功: ${roleId}` : '测试玩家role_id已清空'
        };
    } catch (error: any) {
        console.error('设置测试玩家role_id失败:', error);
        throw createError({
            status: error.status || 500,
            message: error.message || '设置测试玩家role_id失败',
        });
    }
};