import { Bot, Context, InlineKeyboard } from 'grammy';
import { telegramConfig, getTelegramAccessConfig } from './config';
import * as TelegramService from './service';

// 创建 Bot 实例
let bot: Bot | null = null;

// 权限验证中间件（动态读取配置，支持热更新）
const checkAccess = async (ctx: Context, next: () => Promise<void>) => {
    // /myid 命令不受权限限制，任何人都可以查看
    const messageText = ctx.message?.text || '';
    if (messageText.startsWith('/myid')) {
        await next();
        return;
    }
    
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    
    // 动态读取权限配置
    const accessConfig = await getTelegramAccessConfig();
    
    // 如果没有配置任何限制，则所有人都可以使用
    const hasUserLimit = accessConfig.allowedUserIds && accessConfig.allowedUserIds.length > 0;
    const hasGroupLimit = accessConfig.allowedGroupIds && accessConfig.allowedGroupIds.length > 0;
    
    if (!hasUserLimit && !hasGroupLimit) {
        // 没有任何限制，直接放行
        await next();
        return;
    }
    
    // 检查用户权限
    const userAllowed = !hasUserLimit || (userId && accessConfig.allowedUserIds.includes(userId));
    
    // 检查群组权限（仅当在群组中时）
    const isInGroup = chatId && chatId < 0;
    const groupAllowed = !hasGroupLimit || (isInGroup && accessConfig.allowedGroupIds.includes(chatId));
    
    // OR 逻辑：满足用户权限 OR 群组权限任一即可
    if (userAllowed || groupAllowed) {
        await next();
        return;
    }
    
    // 都不满足，拒绝访问
    await ctx.reply('你没有权限使用此机器人\n\n发送 /myid 查看你的ID，联系管理员添加权限。');
};

// ==================== 工具函数 ====================

// 格式化数字（添加千位分隔符）
const formatNumber = (num: number | string | null | undefined): string => {
    const n = Number(num) || 0;
    return n.toLocaleString('zh-CN');
};

// 格式化金额
const formatAmount = (amount: number | string | null | undefined): string => {
    const amt = Number(amount) || 0;
    return `¥${amt.toFixed(2)}`;
};

// ==================== 初始化机器人 ====================

export const initBot = () => {
    if (!telegramConfig.enabled) {
        console.log('Telegram Bot 已禁用');
        return null;
    }

    // 创建 Bot 实例，配置 API 域名
    const botOptions: any = {};
    
    if (telegramConfig.apiRoot) {
        botOptions.client = {
            apiRoot: telegramConfig.apiRoot
        };
        if (telegramConfig.apiRoot !== 'https://api.telegram.org') {
            console.log('使用加速域名:', telegramConfig.apiRoot);
        }
    }

    bot = new Bot(telegramConfig.botToken, botOptions);
    
    // 应用权限验证中间件
    bot.use(checkAccess);
    
    // ==================== 命令处理器 ====================
    
    // /start - 欢迎消息
    bot.command('start', async (ctx) => {
        const welcomeMessage = `欢迎使用运营管理机器人！

可用命令：
/help - 显示帮助信息
/stats - 查看今日数据统计
/recharge - 查看今日充值数据
/online - 查看在线人数
/order - 查询订单状态
/menu - 显示快捷菜单
/myid - 查看当前ID（用于配置白名单）

提示：你也可以使用快捷菜单按钮来快速访问功能。`;
        
        await ctx.reply(welcomeMessage);
    });
    
    // /help - 帮助信息
    bot.command('help', async (ctx) => {
        const helpMessage = `命令说明：

/start - 显示欢迎消息
/help - 显示此帮助信息
/menu - 显示快捷菜单
/stats - 今日综合数据统计
/recharge - 今日充值详细数据
/online - 查看在线人数
/order <订单号> - 查询订单状态
/myid - 查看当前用户ID和群组ID

使用示例：
/order zfb_1234567890
/order wx_9876543210

配置白名单：
使用 /myid 命令获取ID，然后编辑 server/config/telegram.json 文件添加授权。`;
        
        await ctx.reply(helpMessage);
    });
    
    // /menu - 显示快捷菜单
    bot.command('menu', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text('今日统计', 'action_stats')
            .text('充值数据', 'action_recharge').row()
            .text('在线人数', 'action_online')
            .text('查询订单', 'action_order_prompt');
        
        await ctx.reply('请选择功能：', {
            reply_markup: keyboard
        });
    });
    
    // /stats - 今日综合统计
    bot.command('stats', async (ctx) => {
        try {
            await ctx.reply('正在查询数据，请稍候...');
            
            // 调用服务层获取数据
            const stats = await TelegramService.getTodayStats();
            
            const rechargeData = stats.recharge;
            const loginData = stats.login;
            const onlineData = stats.online;
            
            const successRate = rechargeData.total_orders > 0 
                ? ((rechargeData.success_orders / rechargeData.total_orders) * 100).toFixed(1)
                : '0.0';
            
            const message = `【今日数据统计】${stats.dateStr}

【充值数据】
充值金额：${formatAmount(rechargeData.success_amount || 0)}
成功订单：${formatNumber(rechargeData.success_orders || 0)} 笔
总订单数：${formatNumber(rechargeData.total_orders || 0)} 笔
成功率：${successRate}%
充值用户：${formatNumber(rechargeData.unique_users || 0)} 人

【用户数据】
今日登录：${formatNumber(loginData.total_logins || 0)} 次
登录用户：${formatNumber(loginData.unique_users || 0)} 人
当前在线：${formatNumber(onlineData.online_users || 0)} 人

更新时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
            
            await ctx.reply(message);
            
        } catch (error) {
            console.error('查询统计数据失败:', error);
            await ctx.reply('查询失败，请稍后重试');
        }
    });
    
    // /recharge - 今日充值数据
    bot.command('recharge', async (ctx) => {
        try {
            await ctx.reply('正在查询充值数据，请稍候...');
            
            // 调用服务层获取数据
            const details = await TelegramService.getTodayRechargeDetails();
            
            // 计算成功率
            const successRate = details.todayTotalCount > 0 
                ? ((details.todaySuccessCount / details.todayTotalCount) * 100).toFixed(1)
                : '0.0';
            
            let message = `【今日充值数据】${details.dateStr}\n\n`;
            
            // 总体统计（与后台卡片一致）
            message += `【总体统计】\n`;
            message += `成功金额：${formatAmount(Number(details.todaySuccessAmount))}\n`;
            message += `成功订单：${formatNumber(details.todaySuccessCount)} 笔\n`;
            message += `总订单数：${formatNumber(details.todayTotalCount)} 笔\n`;
            message += `成功率：${successRate}%\n\n`;
            
            // 按支付方式
            if (details.byPaymentWay.length > 0) {
                message += '【按支付方式】\n';
                for (const row of details.byPaymentWay) {
                    const paymentWayName = row.payment_way === 'zfb' ? '支付宝' 
                        : row.payment_way === 'wx' ? '微信' 
                        : row.payment_way === 'kf' ? '客服'
                        : row.payment_way || '未知';
                    
                    message += `${paymentWayName}：${formatAmount(row.success_amount || 0)} (${row.success_count || 0}笔)\n`;
                }
                message += '\n';
            }
            
            // 按渠道 TOP5
            if (details.byChannel.length > 0) {
                message += '【TOP5 渠道】\n';
                for (const row of details.byChannel) {
                    message += `${row.channel_code || '未知'}：${formatAmount(row.success_amount || 0)} (${row.success_count || 0}笔)\n`;
                }
                message += '\n';
            }
            
            message += `更新时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
            
            await ctx.reply(message);
            
        } catch (error) {
            console.error('查询充值数据失败:', error);
            await ctx.reply('查询失败，请稍后重试');
        }
    });
    
    // /online - 在线人数
    bot.command('online', async (ctx) => {
        try {
            await ctx.reply('正在查询游戏服在线数据...');
            
            // 调用服务层获取数据
            const stats = await TelegramService.getOnlineStats();
            
            if (stats.error) {
                await ctx.reply(`警告: ${stats.error}`);
                return;
            }
            
            let message = `【游戏服在线统计】\n\n`;
            message += `总在线人数：${formatNumber(stats.totalOnline)} 人\n`;
            message += `总注册人数：${formatNumber(stats.totalRegister)} 人\n\n`;
            
            // 显示每个服务器的在线数据
            if (stats.servers && stats.servers.length > 0) {
                message += `【各服务器详情】\n`;
                stats.servers.forEach((server: any) => {
                    if (server.error) {
                        message += `${server.name}: 查询失败\n`;
                    } else {
                        message += `${server.name}: ${formatNumber(server.online)} 人`;
                        if (server.onlineAndroid || server.onlineIOS) {
                            message += ` (安卓: ${server.onlineAndroid}, iOS: ${server.onlineIOS})`;
                        }
                        message += `\n`;
                    }
                });
            }
            
            message += `\n更新时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
            
            await ctx.reply(message);
            
        } catch (error) {
            console.error('查询在线人数失败:', error);
            await ctx.reply('查询失败，请稍后重试');
        }
    });
    
    // /order - 查询订单
    bot.command('order', async (ctx) => {
        const orderId = ctx.match?.toString().trim();
        
        if (!orderId) {
            await ctx.reply('请提供订单号，例如：/order zfb_1234567890');
            return;
        }
        
        try {
            await ctx.reply('正在查询订单...');
            
            // 调用服务层获取数据（使用 PaymentModel）
            const order = await TelegramService.getOrderDetail(orderId);
            
            if (!order) {
                await ctx.reply(`未找到订单：${orderId}`);
                return;
            }
            
            const statusMap: { [key: number]: string } = {
                0: '未支付',
                1: '处理中',
                2: '已完成',
                3: '已取消',
                4: '失败',
                5: '退款中',
                6: '已退款'
            };
            
            const paymentWayMap: { [key: string]: string } = {
                'zfb': '支付宝',
                'wx': '微信',
                'ptb': '平台币',
                'kf': '客服'
            };
            
            const message = `【订单详情】

订单号：${order.transaction_id}
${order.mch_order_id ? `三方单号：${order.mch_order_id}\n` : ''}
用户ID：${order.wuid || order.user_id}
金额：${formatAmount(order.amount || 0)}
支付方式：${paymentWayMap[order.payment_way || ''] || order.payment_way}
商品：${order.product_name}
渠道：${order.channel_code}

状态：${statusMap[order.payment_status || 0] || '未知'}
${order.msg ? `备注：${order.msg}\n` : ''}
创建时间：${order.created_at}
${order.notify_at ? `通知时间：${order.notify_at}\n` : ''}
${order.callback_at ? `回调时间：${order.callback_at}\n` : ''}`;
            
            await ctx.reply(message);
            
        } catch (error) {
            console.error('查询订单失败:', error);
            await ctx.reply('查询失败，请稍后重试');
        }
    });
    
    // /myid - 查看当前用户ID和群组ID（用于配置白名单）
    bot.command('myid', async (ctx) => {
        const userId = ctx.from?.id;
        const chatId = ctx.chat?.id;
        const chatType = ctx.chat?.type; // 'private', 'group', 'supergroup', 'channel'
        
        // 读取当前的权限配置
        const accessConfig = await getTelegramAccessConfig();
        
        let message = '【当前会话信息】\n\n';
        
        // 用户信息
        if (userId) {
            const isUserAllowed = accessConfig.allowedUserIds.length === 0 || 
                                  accessConfig.allowedUserIds.includes(userId);
            message += `用户ID: ${userId}\n`;
            message += `用户状态: ${isUserAllowed ? '已授权 ✓' : '未授权 ✗'}\n\n`;
        }
        
        // 群组信息
        if (chatId) {
            if (chatType === 'private') {
                message += `会话类型: 私聊\n`;
            } else {
                const isGroupAllowed = accessConfig.allowedGroupIds.length === 0 || 
                                       accessConfig.allowedGroupIds.includes(chatId);
                message += `会话类型: ${chatType === 'group' ? '群组' : chatType === 'supergroup' ? '超级群组' : '频道'}\n`;
                message += `群组ID: ${chatId}\n`;
                message += `群组状态: ${isGroupAllowed ? '已授权 ✓' : '未授权 ✗'}\n\n`;
            }
        }
        

        
        await ctx.reply(message);
    });
    
    // ==================== 回调查询处理器 ====================
    
    // 处理快捷菜单按钮回调
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data;
        
        // 尝试回答回调查询，忽略过期错误
        try {
            await ctx.answerCallbackQuery();
        } catch (error: any) {
            // 忽略 "query is too old" 错误
            if (!error.message?.includes('too old') && !error.message?.includes('query ID is invalid')) {
                console.error('answerCallbackQuery 失败:', error.message);
            }
        }
        
        switch (data) {
            case 'action_stats':
                // 触发 /stats 命令
                const statsCtx = { ...ctx, match: '' };
                await bot!.handleUpdate({
                    ...ctx.update,
                    message: {
                        ...ctx.callbackQuery.message,
                        text: '/stats',
                        from: ctx.from
                    }
                } as any);
                break;
                
            case 'action_recharge':
                await bot!.handleUpdate({
                    ...ctx.update,
                    message: {
                        ...ctx.callbackQuery.message,
                        text: '/recharge',
                        from: ctx.from
                    }
                } as any);
                break;
                
            case 'action_online':
                await bot!.handleUpdate({
                    ...ctx.update,
                    message: {
                        ...ctx.callbackQuery.message,
                        text: '/online',
                        from: ctx.from
                    }
                } as any);
                break;
                
            case 'action_order_prompt':
                await ctx.reply('请输入订单号，格式：/order <订单号>');
                break;
        }
    });
    
    // ==================== 错误处理 ====================
    
    bot.catch((err) => {
        const ctx = err.ctx;
        const e = err.error;
        
        // 忽略一些常见的、不重要的错误
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('too old') || errorMessage.includes('query ID is invalid')) {
            return; // 静默忽略过期的回调查询
        }
        
        console.error(`Bot 错误 [update ${ctx.update.update_id}]:`, errorMessage);
    });
    
    return bot;
};

// 启动机器人
export const startBot = async () => {
    if (!telegramConfig.enabled) {
        console.log('Telegram Bot 已禁用（在配置中设置 enabled: true 启用）');
        return;
    }

    // 如果已有运行中的实例，先停止
    if (bot) {
        console.log('检测到已有 Bot 实例，先停止...');
        await stopBot();
        // 等待一下确保旧实例完全停止
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
        bot = initBot();
        if (!bot) return;
        
        console.log('Telegram Bot 正在启动...');
        
        // 获取机器人信息
        const me = await bot.api.getMe();
        console.log(`Bot 已连接: @${me.username}`);
        
        // 设置命令列表
        await bot.api.setMyCommands([
            { command: 'start', description: '开始使用' },
            { command: 'help', description: '帮助信息' },
            { command: 'menu', description: '快捷菜单' },
            { command: 'stats', description: '今日统计' },
            { command: 'recharge', description: '充值数据' },
            { command: 'online', description: '在线人数' },
            { command: 'order', description: '查询订单' },
            { command: 'myid', description: '查看当前ID（配置白名单）' }
        ]);
        
        // 启动机器人（使用 long polling）
        bot.start({
            drop_pending_updates: true,
            onStart: () => {
                console.log('Telegram Bot 运行中，等待消息...');
            }
        });
        
    } catch (error) {
        console.error('Bot 启动失败:', error);
    }
};

// 停止机器人
export const stopBot = async () => {
    if (bot) {
        console.log('正在停止 Telegram Bot...');
        await bot.stop();
        bot = null;
    }
};

export { bot };

