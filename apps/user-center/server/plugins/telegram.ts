// Nitro 插件 - 启动 Telegram Bot
import { startBot, stopBot } from '../telegram';

export default defineNitroPlugin((nitroApp) => {
    console.log('🔌 加载 Telegram Bot 插件...');
    
    // 异步启动 Bot（不阻塞插件加载）
    startBot().catch(error => {
        console.error('❌ Telegram Bot 启动失败:', error);
    });
    
    // 在 Nitro 关闭时停止 Bot
    nitroApp.hooks.hook('close', async () => {
        try {
            await stopBot();
        } catch (error) {
            console.error('❌ Telegram Bot 停止失败:', error);
        }
    });
});

