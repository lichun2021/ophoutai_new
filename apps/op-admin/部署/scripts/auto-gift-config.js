/**
 * 自动礼包发放配置
 */

export const AUTO_GIFT_CONFIG = {
    // 是否启用自动发放
    enabled: true,
    
    // 发放配置
    delivery: {
        // 最大重试次数
        maxRetries: 3,
        
        // 重试间隔（秒）
        retryInterval: 10,
        
        // 批量处理大小
        batchSize: 50,
        
        // 处理间隔（毫秒）
        processingInterval: 100
    },
    
    // 礼包分类配置
    categories: {
        // 当日充值礼包
        daily: {
            enabled: true,
            description: '当日充值礼包',
            // 最小触发金额
            minAmount: 1.0
        },
        
        // 累计充值礼包
        cumulative: {
            enabled: true,
            description: '累计充值礼包',
            // 最小触发金额
            minAmount: 1.0
        }
    },
    
    // 用户筛选配置
    userFilter: {
        // 排除的渠道代码
        excludeChannels: [],
        
        // 只包含的渠道代码（为空表示所有渠道）
        includeChannels: [],
        
        // 排除的用户ID
        excludeUsers: []
    },
    
    // 游戏服务器配置
    gameServer: {
        // 默认服务器ID
        defaultServerId: '1',
        
        // 请求超时时间（毫秒）
        timeout: 30000,
        
        // 最大并发请求数
        maxConcurrent: 5
    },
    
    // 日志配置
    logging: {
        // 日志级别：debug, info, warn, error
        level: 'info',
        
        // 是否输出详细信息
        verbose: false,
        
        // 是否记录用户敏感信息
        includeUserInfo: false
    }
};

/**
 * 礼包发放规则验证
 */
export const validateGiftRule = (userAmount, giftPackage, category) => {
    // 检查分类是否启用
    if (!AUTO_GIFT_CONFIG.categories[category]?.enabled) {
        return { valid: false, reason: `分类 ${category} 未启用` };
    }
    
    // 检查最小金额（单位：平台币）
    const minAmount = AUTO_GIFT_CONFIG.categories[category].minAmount;
    if (userAmount < minAmount) {
        return { valid: false, reason: `平台币消费 ${userAmount} 小于最小触发金额 ${minAmount}` };
    }
    
    // 检查礼包价格（使用平台币价格）
    if (!giftPackage.price_platform_coins || userAmount < giftPackage.price_platform_coins) {
        return { valid: false, reason: `平台币消费不足，需要 ${giftPackage.price_platform_coins}` };
    }
    
    return { valid: true, reason: '' };
};

/**
 * 用户筛选验证
 */
export const validateUser = (userInfo) => {
    const { userFilter } = AUTO_GIFT_CONFIG;
    
    // 检查排除渠道
    if (userFilter.excludeChannels.includes(userInfo.channel_code)) {
        return { valid: false, reason: `渠道 ${userInfo.channel_code} 被排除` };
    }
    
    // 检查包含渠道
    if (userFilter.includeChannels.length > 0 && !userFilter.includeChannels.includes(userInfo.channel_code)) {
        return { valid: false, reason: `渠道 ${userInfo.channel_code} 不在允许列表中` };
    }
    
    // 检查排除用户
    if (userFilter.excludeUsers.includes(userInfo.user_id)) {
        return { valid: false, reason: `用户 ${userInfo.user_id} 被排除` };
    }
    
    return { valid: true, reason: '' };
};