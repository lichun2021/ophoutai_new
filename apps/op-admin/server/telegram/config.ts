// Telegram Bot 配置
export interface TelegramBotConfig {
    botToken: string;
    enabled: boolean;
    apiRoot?: string; // API 域名
}

// 基础配置（静态）
export const telegramConfig: TelegramBotConfig = {
    // Bot Token - 已配置
    botToken: process.env.TELEGRAM_BOT_TOKEN || '8448231517:AAHTv7on2ti4BE_JcShsx08ysnMuCioZUKM',
    
    // 是否启用机器人
    enabled: process.env.TELEGRAM_BOT_ENABLED !== 'false', // 默认启用
    
    // API 加速域名
    apiRoot: 'https://black-tooth-5408.3848885926.workers.dev'
};

/**
 * 动态读取 Telegram 权限配置（支持热更新）
 * 从 server/config/telegram.json 读取
 */
export async function getTelegramAccessConfig(): Promise<{ allowedUserIds: number[]; allowedGroupIds: number[] }> {
    try {
        const fs = await import('fs');
        const path = await import('path');
        
        // 尝试多个可能的路径
        const possiblePaths = [
            // 开发环境路径
            path.join(process.cwd(), 'server/config/telegram.json'),
            // 生产环境路径
            path.join(process.cwd(), '../server/config/telegram.json'),
            path.join(process.cwd(), 'nuxt3/server/config/telegram.json'),
            '/data/nuxt3/server/config/telegram.json',
            '/data/config/telegram.json',
            path.join(process.cwd(), 'config/telegram.json')
        ];
        
        let configPath = '';
        for (const tryPath of possiblePaths) {
            if (tryPath && fs.existsSync(tryPath)) {
                configPath = tryPath;
                break;
            }
        }
        
        if (configPath) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            
            return {
                allowedUserIds: Array.isArray(config.allowedUserIds) ? config.allowedUserIds : [],
                allowedGroupIds: Array.isArray(config.allowedGroupIds) ? config.allowedGroupIds : []
            };
        } else {
            console.warn('[Telegram] 未找到 telegram.json 配置文件，权限控制已禁用');
            return { allowedUserIds: [], allowedGroupIds: [] };
        }
    } catch (error) {
        console.error('[Telegram] 读取权限配置失败:', error);
        return { allowedUserIds: [], allowedGroupIds: [] };
    }
}

