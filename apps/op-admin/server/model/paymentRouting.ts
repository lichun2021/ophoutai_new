import { sql } from '../db';
import { getRedisCluster } from '../utils/redis-cluster';

export type PaymentRoutingRule = {
    id?: number;
    rule_name: string;
    priority: number;
    is_enabled: number;
    min_amount?: number;
    max_amount?: number;
    time_start?: string;
    time_end?: string;
    payment_channel: string;
    daily_quota: number;
    used_quota: number;
    quota_reset_date?: string;
    fallback_channel?: string;
    allow_zfb: number;  // 1=允许 0=禁止
    allow_wx: number;   // 1=允许 0=禁止
};

// --- Redis 额度管理 ---

const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * 获取某个规则今日已使用的 Redis 额度
 */
export const getRedisUsedQuota = async (ruleId: number): Promise<number> => {
    const redis = getRedisCluster();
    const key = `routing:quota:${ruleId}:${getTodayStr()}`;
    const val = await redis.get(key);
    return val ? parseFloat(val) : 0;
};

/**
 * 增加某个规则的 Redis 额度
 */
export const incrementRedisUsedQuota = async (ruleId: number, amount: number): Promise<void> => {
    const redis = getRedisCluster();
    const key = `routing:quota:${ruleId}:${getTodayStr()}`;
    await redis.incrbyfloat(key, amount);
    // 设置 48 小时过期，防止占用过多内存
    await redis.expire(key, 172800);
    console.log(`[Redis Quota] 规则 ID:${ruleId} 成功增加额度: +${amount}`);
};

/**
 * 记录订单与规则的映射关系
 */
export const saveOrderRuleMapping = async (transactionId: string, ruleId: number): Promise<void> => {
    const redis = getRedisCluster();
    const key = `routing:order_rule:${transactionId}`;
    await redis.set(key, ruleId.toString(), 'EX', 86400); // 保存 24 小时
};

/**
 * 获取订单对应的规则 ID
 */
export const getOrderRuleMapping = async (transactionId: string): Promise<number | null> => {
    const redis = getRedisCluster();
    const key = `routing:order_rule:${transactionId}`;
    const val = await redis.get(key);
    return val ? parseInt(val) : null;
};

// --- 规则逻辑 ---

// 获取所有启用的规则（按优先级排序）
export const getActiveRules = async (): Promise<PaymentRoutingRule[]> => {
    const result = await sql({
        query: 'SELECT * FROM PaymentRoutingRules WHERE is_enabled = 1 ORDER BY priority DESC',
    });
    return result as PaymentRoutingRule[];
};

// 重置每日额度（如果日期变化）- Redis 模式下废弃
export const resetDailyQuotaIfNeeded = async (rule: PaymentRoutingRule): Promise<void> => {
    // 自动重置，不再需要手动处理
};

// 检查额度是否足够
export const checkQuota = async (rule: PaymentRoutingRule, amount: number): Promise<boolean> => {
    // 如果 daily_quota = 0，表示不限制
    if (rule.daily_quota === 0) {
        return true;
    }
    
    // 从 Redis 获取最新的实时已用额度
    const currentUsed = await getRedisUsedQuota(rule.id!);
    
    if (currentUsed + amount > rule.daily_quota) {
        console.log(`[Payment Routing] 规则 ${rule.rule_name} (Redis) 额度不足: ${currentUsed}/${rule.daily_quota}`);
        return false;
    }
    
    return true;
};

// 增加已使用额度
export const incrementUsedQuota = async (ruleId: number, amount: number): Promise<void> => {
    await incrementRedisUsedQuota(ruleId, amount);
};

// 兼容旧函数名
export const checkAndUpdateQuota = async (rule: PaymentRoutingRule, amount: number): Promise<boolean> => {
    return await checkQuota(rule, amount);
};

// 匹配路由规则
export const matchRule = async (
    rules: PaymentRoutingRule[], 
    amount: number,
    paymentMethod?: string // 'zfb', 'wx', 'alipay', 'wxpay' 等
): Promise<PaymentRoutingRule | null> => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

    // 标准化支付方式
    const method = (paymentMethod || '').toLowerCase();
    const isZfb = method.includes('zfb') || method.includes('ali');
    const isWx = method.includes('wx') || method.includes('weixin') || method.includes('wechat');

    for (const rule of rules) {
        // 0. 检查支付方式是否允许
        if (isZfb && rule.allow_zfb === 0) continue;
        if (isWx && rule.allow_wx === 0) continue;

        // 1. 检查金额范围（NULL = 不限制）
        if (rule.min_amount !== null && rule.min_amount !== undefined) {
            if (amount < rule.min_amount) continue;
        }
        if (rule.max_amount !== null && rule.max_amount !== undefined) {
            if (amount > rule.max_amount) continue;
        }

        // 2. 检查时间段（NULL = 不限制）
        if (rule.time_start && rule.time_end) {
            if (rule.time_start < rule.time_end) {
                // 正常时间段 如 08:00:00 - 22:00:00
                if (currentTime < rule.time_start || currentTime > rule.time_end) {
                    continue;
                }
            } else {
                // 跨天时间段 如 22:00:00 - 08:00:00
                if (currentTime < rule.time_start && currentTime > rule.time_end) {
                    continue;
                }
            }
        }

        // 3. 检查每日额度（0 = 不限制）
        const quotaOk = await checkAndUpdateQuota(rule, amount);
        if (!quotaOk) {
            continue;
        }

        return rule;
    }

    return null;
};


// CRUD 操作
export const getAllRules = async () => {
    const result = await sql({
        query: 'SELECT * FROM PaymentRoutingRules ORDER BY priority DESC',
    });
    return result as PaymentRoutingRule[];
};

export const createRule = async (rule: Omit<PaymentRoutingRule, 'id'>) => {
    return await sql({
        query: `INSERT INTO PaymentRoutingRules 
                (rule_name, priority, is_enabled, min_amount, max_amount, 
                 time_start, time_end, payment_channel, daily_quota, fallback_channel,
                 allow_zfb, allow_wx)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
            rule.rule_name, rule.priority, rule.is_enabled || 1,
            rule.min_amount || null, rule.max_amount || null,
            rule.time_start || null, rule.time_end || null,
            rule.payment_channel, rule.daily_quota || 0,
            rule.fallback_channel || null,
            rule.allow_zfb ?? 1,
            rule.allow_wx ?? 1
        ]
    });
};

export const updateRule = async (id: number, rule: Partial<PaymentRoutingRule>) => {
    const allowedKeys = new Set([
        'rule_name',
        'priority',
        'is_enabled',
        'min_amount',
        'max_amount',
        'time_start',
        'time_end',
        'payment_channel',
        'daily_quota',
        'used_quota',
        'quota_reset_date',
        'fallback_channel',
        'allow_zfb',
        'allow_wx',
        'created_at',
        'updated_at'
    ]);

    const fields: string[] = [];
    const values: any[] = [];
    
    Object.keys(rule).forEach(key => {
        if (key !== 'id' && allowedKeys.has(key)) {
            fields.push(`${key} = ?`);
            values.push((rule as any)[key]);
        }
    });
    
    if (!fields.length) {
        return { affectedRows: 0 };
    }

    values.push(id);
    
    return await sql({
        query: `UPDATE PaymentRoutingRules SET ${fields.join(', ')} WHERE id = ?`,
        values
    });
};

export const deleteRule = async (id: number) => {
    return await sql({
        query: 'DELETE FROM PaymentRoutingRules WHERE id = ?',
        values: [id]
    });
};

export const toggleRule = async (id: number, enabled?: boolean) => {
    let targetStatus = enabled;

    if (targetStatus === undefined) {
        const result: any = await sql({
            query: 'SELECT is_enabled FROM PaymentRoutingRules WHERE id = ?',
            values: [id]
        });

        const currentStatus = result?.[0]?.is_enabled === 1;
        targetStatus = !currentStatus;
    }

    return await sql({
        query: 'UPDATE PaymentRoutingRules SET is_enabled = ? WHERE id = ?',
        values: [targetStatus ? 1 : 0, id]
    });
};


