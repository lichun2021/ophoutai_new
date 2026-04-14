import { H3Event, readBody, createError } from 'h3';
import * as PaymentRoutingModel from '../model/paymentRouting';
import * as SystemParamsModel from '../model/systemParams';

const ROUTING_PARAM_DEFAULTS: Record<string, string> = {
    payment_routing_enabled: 'false',
    payment_routing_mode: 'manual'
};

const ROUTING_ALLOWED_MODES = new Set(['auto', 'manual']);

export const getRoutingSettings = async (_evt: H3Event) => {
    try {
        const data: Record<string, string> = {};
        for (const [key, def] of Object.entries(ROUTING_PARAM_DEFAULTS)) {
            const param = await SystemParamsModel.getOrCreate(key, def);
            data[key] = param?.content ?? def;
        }

        return {
            code: 200,
            message: '获取成功',
            data: {
                payment_routing_enabled: data.payment_routing_enabled === 'true',
                payment_routing_mode: ROUTING_ALLOWED_MODES.has((data.payment_routing_mode || '').toLowerCase())
                    ? data.payment_routing_mode.toLowerCase()
                    : 'manual'
            }
        };
    } catch (error: any) {
        console.error('获取路由系统参数失败:', error);
        throw createError({
            statusCode: 500,
            message: error?.message || '获取路由系统参数失败'
        });
    }
};

export const updateRoutingSettings = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);

        const enabledRaw = body?.payment_routing_enabled;
        const modeRaw = body?.payment_routing_mode;

        const enabled = enabledRaw === true || enabledRaw === 'true' || enabledRaw === 1 || enabledRaw === '1';

        const mode = ROUTING_ALLOWED_MODES.has(String(modeRaw || '').toLowerCase())
            ? String(modeRaw || '').toLowerCase()
            : 'manual';

        const updates: Record<string, string> = {
            payment_routing_enabled: enabled ? 'true' : 'false',
            payment_routing_mode: mode
        };

        for (const [key, value] of Object.entries(updates)) {
            await SystemParamsModel.getOrCreate(key, ROUTING_PARAM_DEFAULTS[key]);
            await SystemParamsModel.update(key, value);
        }

        return {
            code: 200,
            message: '路由配置已更新'
        };
    } catch (error: any) {
        console.error('更新路由系统参数失败:', error);
        throw createError({
            statusCode: 500,
            message: error?.message || '更新路由系统参数失败'
        });
    }
};
// 获取所有路由规则
export const getAllRules = async (evt: H3Event) => {
    try {
        const rules = await PaymentRoutingModel.getAllRules();
        
        // 从 Redis 获取今日实时额度并更新返回结果
        const rulesWithRealtimeQuota = await Promise.all(rules.map(async (rule) => {
            if (rule.id) {
                const redisQuota = await PaymentRoutingModel.getRedisUsedQuota(rule.id);
                return {
                    ...rule,
                    used_quota: redisQuota // 使用 Redis 中的值覆盖数据库中的旧值
                };
            }
            return rule;
        }));

        return {
            code: 200,
            data: rulesWithRealtimeQuota,
            message: '获取成功'
        };
    } catch (error: any) {
        console.error('获取路由规则失败:', error);
        throw error;
    }
};

// 创建路由规则
export const createRule = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const {
            priority,
            min_amount,
            max_amount,
            time_start,
            time_end,
            payment_channel,
            daily_quota,
            allow_zfb,
            allow_wx
        } = body;
        
        let { rule_name } = body;
        
        // 验证必填字段
        if (!payment_channel || priority === undefined) {
            throw createError({
                statusCode: 400,
                message: '缺少必填字段：目标渠道、优先级'
            });
        }
        
        const ruleData: any = {
            rule_name: rule_name || `渠道${payment_channel}规则`,
            priority: parseInt(priority),
            payment_channel,
            is_enabled: 1,
            daily_quota: daily_quota ? parseFloat(daily_quota) : 0,
            used_quota: 0,
            allow_zfb: (allow_zfb === true || allow_zfb === 1) ? 1 : 0,
            allow_wx: (allow_wx === true || allow_wx === 1) ? 1 : 0
        };
        
        // 可选字段
        if (min_amount !== undefined && min_amount !== null && min_amount !== '') {
            ruleData.min_amount = parseFloat(min_amount);
        }
        if (max_amount !== undefined && max_amount !== null && max_amount !== '') {
            ruleData.max_amount = parseFloat(max_amount);
        }
        if (time_start && time_start !== '') {
            ruleData.time_start = time_start;
        }
        if (time_end && time_end !== '') {
            ruleData.time_end = time_end;
        }
        
        await PaymentRoutingModel.createRule(ruleData);
        
        return {
            code: 200,
            message: '创建成功',
            data: ruleData
        };
    } catch (error: any) {
        console.error('创建路由规则失败:', error);
        throw error;
    }
};

// 更新路由规则
export const updateRule = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { id, ...rest } = body;
        
        if (!id) {
            throw createError({
                statusCode: 400,
                message: '缺少规则ID'
            });
        }

        const updateData: any = { ...rest };
        // 屏蔽不需要手动更新的系统字段，防止覆盖实时额度和日期
        ['ts', 'nonce', 'sign', '__signed', 'created_at', 'updated_at', 'used_quota', 'quota_reset_date'].forEach(key => {
            if (key in updateData) delete updateData[key];
        });

        // 转换布尔值为数值
        if (updateData.allow_zfb !== undefined) updateData.allow_zfb = (updateData.allow_zfb === true || updateData.allow_zfb === 1) ? 1 : 0;
        if (updateData.allow_wx !== undefined) updateData.allow_wx = (updateData.allow_wx === true || updateData.allow_wx === 1) ? 1 : 0;
        
        // 转换数值类型
        if (updateData.priority !== undefined) {
            updateData.priority = parseInt(updateData.priority);
        }
        if (updateData.min_amount !== undefined) {
            if (updateData.min_amount === '' || updateData.min_amount === null) {
                updateData.min_amount = null;
            } else {
                const parsedMin = parseFloat(updateData.min_amount);
                updateData.min_amount = Number.isFinite(parsedMin) ? parsedMin : null;
            }
        }
        if (updateData.max_amount !== undefined) {
            if (updateData.max_amount === '' || updateData.max_amount === null) {
                updateData.max_amount = null;
            } else {
                const parsedMax = parseFloat(updateData.max_amount);
                updateData.max_amount = Number.isFinite(parsedMax) ? parsedMax : null;
            }
        }
        if (updateData.daily_quota !== undefined) {
            const parsedQuota = parseFloat(updateData.daily_quota);
            updateData.daily_quota = Number.isFinite(parsedQuota) ? parsedQuota : 0;
        }
        
        // 空字符串转为null
        if (updateData.time_start === '') updateData.time_start = null;
        if (updateData.time_end === '') updateData.time_end = null;
        
        await PaymentRoutingModel.updateRule(id, updateData);
        
        return {
            code: 200,
            message: '更新成功',
            data: { id }
        };
    } catch (error: any) {
        console.error('更新路由规则失败:', error);
        throw error;
    }
};

// 删除路由规则
export const deleteRule = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { id } = body;
        
        if (!id) {
            throw createError({
                statusCode: 400,
                message: '缺少规则ID'
            });
        }
        
        await PaymentRoutingModel.deleteRule(id);
        
        return {
            code: 200,
            message: '删除成功',
            data: { id }
        };
    } catch (error: any) {
        console.error('删除路由规则失败:', error);
        throw error;
    }
};

// 切换规则启用状态
export const toggleRule = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { id } = body;
        
        if (!id) {
            throw createError({
                statusCode: 400,
                message: '缺少规则ID'
            });
        }
        
        await PaymentRoutingModel.toggleRule(id);
        
        return {
            code: 200,
            message: '状态切换成功',
            data: { id }
        };
    } catch (error: any) {
        console.error('切换规则状态失败:', error);
        throw error;
    }
};

// 重置每日额度
export const resetDailyQuota = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { id } = body;
        
        if (!id) {
            throw createError({
                statusCode: 400,
                message: '缺少规则ID'
            });
        }
        
        const { sql } = await import('../db');
        await sql({
            query: 'UPDATE PaymentRoutingRules SET used_quota = 0, quota_reset_date = CURDATE() WHERE id = ?',
            values: [id]
        });
        
        return {
            code: 200,
            message: '额度已重置',
            data: { id }
        };
    } catch (error: any) {
        console.error('重置每日额度失败:', error);
        throw error;
    }
};

