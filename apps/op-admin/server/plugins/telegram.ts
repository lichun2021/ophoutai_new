import { startBot, stopBot } from '../telegram/index';

export default defineNitroPlugin((nitroApp) => {
    // 判断是否是 PM2 多进程模式
    const instanceId = process.env.NODE_APP_INSTANCE;
    // 只有非 PM2 环境或者 PM2 的第 0 号实例才启动机器人
    const isPrimaryInstance = !instanceId || instanceId === '0';

    if (!isPrimaryInstance) {
        console.log(`[Telegram Bot] 实例ID: ${instanceId}，跳过机器人启动以避免长轮询(409)冲突。`);
        return;
    }

    console.log(`[Telegram Bot] 实例ID: ${instanceId || '单实例/开发环境'}，正在初始化 Telegram Bot 服务...`);
    
    // 启动 Bot
    startBot().catch(err => {
        console.error('Telegram Bot 启动失败:', err);
    });

    // 在 Nitro 关闭时优雅停止 Bot
    nitroApp.hooks.hook('close', async () => {
        console.log('正在停止 Telegram Bot...');
        await stopBot();
    });
});
