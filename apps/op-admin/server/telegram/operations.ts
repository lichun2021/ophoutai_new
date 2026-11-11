import { randomUUID } from 'node:crypto';
import { InlineKeyboard, type Bot, type Context } from 'grammy';
import { getAdminWithPermissions, type Admin } from '../model/admin';
import { getChannelSettlementData } from '../model/channelSettlement';
import { getTelegramAccessConfig } from './config';
import {
    findPlayerForPlatformCoinGrant,
    grantPlayerPlatformCoins,
    MAX_PLATFORM_COIN_GRANT,
    PlayerCoinError,
    type PlayerForPlatformCoinGrant
} from './playerCoins';

const sessionDuration = 10 * 60 * 1000;
const pageLimit = 3600;
const settlementTitle = '【渠道结算数据】';
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const coinAmount = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

type SettlementReport = Awaited<ReturnType<typeof getChannelSettlementData>>;
type SettlementView = {
    id: string;
    adminId: number;
    scope: string;
    expiresAt: number;
    pages: string[];
};

type GrantBase = { adminId: number; expiresAt: number };
type GrantConfirmation = {
    player: PlayerForPlatformCoinGrant;
    amount: number;
    requestId: string;
};
type GrantFlow = GrantBase & (
    | { step: 'account' }
    | { step: 'amount'; player: PlayerForPlatformCoinGrant }
    | ({ step: 'confirm' | 'sending' } & GrantConfirmation)
);

const menuButton = () => new InlineKeyboard().text('返回主菜单', 'ops:menu');
const expiresAt = () => Date.now() + sessionDuration;

function privateUserId(ctx: Context) {
    return ctx.chat?.type === 'private' && ctx.chat.id === ctx.from?.id ? ctx.from.id : undefined;
}

async function requireOperator(ctx: Context, superAdminOnly = false) {
    const userId = privateUserId(ctx);
    if (!userId) {
        await ctx.reply('请私聊机器人使用此功能。');
        return;
    }

    const access = await getTelegramAccessConfig();
    const adminId = access.adminBindings[String(userId)];
    if (!adminId) {
        await ctx.reply('此 Telegram 账号尚未绑定后台管理员。请发送 /myid 获取用户 ID 并联系管理员。');
        return;
    }

    let admin: Admin | null;
    try {
        admin = await getAdminWithPermissions(adminId);
    } catch (error) {
        console.error('[Telegram] 无法校验管理员权限:', error);
        await ctx.reply('暂时无法校验管理员权限，请稍后重试。');
        return;
    }
    if (!admin || Number(admin.is_active) !== 1) {
        await ctx.reply('绑定的后台管理员账号不存在或已停用。');
        return;
    }
    if (superAdminOnly && admin.level !== 0) {
        await ctx.reply('只有超级管理员可以查询玩家并发放平台币。');
        return;
    }
    return { userId, admin };
}

function settlementScope(admin: Admin) {
    return JSON.stringify([admin.level, [...(admin.allowed_channel_codes ?? [])].sort()]);
}

function settlementPages(report: SettlementReport) {
    const totals = {
        yesterday_amount: 0,
        yesterday_settlement: 0,
        today_amount: 0,
        today_settlement: 0,
        total_amount: 0,
        total_settlement: 0
    };
    const fields = Object.keys(totals) as (keyof typeof totals)[];
    for (const row of report.settlement_data) {
        for (const field of fields) totals[field] += row[field];
    }

    const periods = [
        ['昨日 ' + report.yesterday_date, 'yesterday'],
        ['今日 ' + report.today_date, 'today'],
        ['历史累计', 'total']
    ] as const;
    const formatTotals = (values: typeof totals) => periods.map(([label, key]) =>
        `${label}　流水 ${currency.format(values[`${key}_amount`])} / 结算 ${currency.format(values[`${key}_settlement`])}`
    );

    const blocks = [[
        `管理员 ${report.current_admin.name}　级别 ${report.current_admin.level}　分成 ${report.current_admin.divide_rate ?? 0}%`,
        `【汇总 · ${report.settlement_data.length} 个下级代理】`,
        ...formatTotals(totals)
    ].join('\n')];
    if (!report.settlement_data.length) blocks.push('暂无下级代理结算数据。');

    for (const row of report.settlement_data) {
        blocks.push([
            `【${row.agent_name} · ${row.channel_code || '无渠道号'}】`,
            `分成 ${row.divide_rate ?? 0}%`,
            ...formatTotals(row)
        ].join('\n'));
    }

    const pages: string[] = [];
    let page = '';
    for (const block of blocks) {
        const parts = block.length > pageLimit ? block.split('\n') : [block];
        for (const part of parts) {
            if (page && page.length + part.length + 2 > pageLimit) {
                pages.push(page);
                page = '';
            }
            page += page ? '\n\n' + part : part;
        }
    }
    if (page) pages.push(page);
    return pages;
}

function settlementMessage(view: SettlementView, page: number) {
    const keyboard = new InlineKeyboard();
    if (page > 0) keyboard.text('上一页', `ops:report:${view.id}:${page - 1}`);
    if (page + 1 < view.pages.length) keyboard.text('下一页', `ops:report:${view.id}:${page + 1}`);
    if (view.pages.length > 1) keyboard.row();
    return {
        text: `${settlementTitle}　${page + 1}/${view.pages.length}\n\n${view.pages[page]}`,
        reply_markup: keyboard.text('返回主菜单', 'ops:menu')
    };
}

function playerDescription(player: PlayerForPlatformCoinGrant) {
    const roles = player.roles.slice(0, 6).map(role =>
        `${role.roleName || '未命名角色'}（角色 ID ${role.roleId}，${role.serverName || role.serverId || '未知区服'}）`
    );
    if (player.roles.length > roles.length) {
        roles.push(`另有 ${player.roles.length - roles.length} 个角色`);
    }
    return [
        `账号 ${player.account}`,
        `用户 ID ${player.userId}`,
        `第三方 UID ${player.thirdpartyUid}`,
        `渠道 ${player.channelCode || '无'}　游戏 ${player.gameCode || '未知'}`,
        `平台币余额 ${coinAmount.format(Number(player.balance))}`,
        ...roles
    ].join('\n');
}

const confirmButton = (requestId: string, label = '确认发放') => new InlineKeyboard()
    .text(label, `ops:grant:${requestId}`)
    .text('取消并返回', 'ops:menu');

export function registerOperations(bot: Bot, showMenu: (ctx: Context) => Promise<void>) {
    const settlements = new Map<number, SettlementView>();
    const grants = new Map<number, GrantFlow>();

    function clearConversation(ctx: Context) {
        const userId = privateUserId(ctx);
        if (!userId) return;
        settlements.delete(userId);
        if (grants.get(userId)?.step !== 'sending') grants.delete(userId);
    }

    function pruneSessions() {
        const now = Date.now();
        for (const [id, view] of settlements) {
            if (view.expiresAt <= now) settlements.delete(id);
        }
        for (const [id, flow] of grants) {
            if (flow.step !== 'sending' && flow.expiresAt <= now) grants.delete(id);
        }
    }

    async function showSettlement(ctx: Context) {
        const operator = await requireOperator(ctx);
        if (!operator) return;
        pruneSessions();
        clearConversation(ctx);
        try {
            const report = await getChannelSettlementData(operator.admin.id);
            const view = {
                id: randomUUID(),
                adminId: operator.admin.id,
                scope: settlementScope(operator.admin),
                expiresAt: expiresAt(),
                pages: settlementPages(report)
            };
            settlements.set(operator.userId, view);
            const { text, reply_markup } = settlementMessage(view, 0);
            await ctx.reply(text, { reply_markup });
        } catch (error) {
            console.error('[Telegram] 查询渠道结算失败:', error);
            await ctx.reply('查询渠道结算失败，请稍后重试。', { reply_markup: menuButton() });
        }
    }

    async function startGrant(ctx: Context) {
        const operator = await requireOperator(ctx, true);
        if (!operator) return;
        pruneSessions();
        if (grants.get(operator.userId)?.step === 'sending') {
            await ctx.reply('正在处理上一笔发放，请稍候。');
            return;
        }
        settlements.delete(operator.userId);
        grants.set(operator.userId, { step: 'account', adminId: operator.admin.id, expiresAt: expiresAt() });
        await ctx.reply('请输入玩家登录账号或第三方 UID。', { reply_markup: menuButton() });
    }

    bot.command('settlement', showSettlement);
    bot.command('grant', startGrant);
    bot.command('cancel', async ctx => {
        clearConversation(ctx);
        await showMenu(ctx);
    });

    bot.callbackQuery('ops:settlement', async ctx => {
        await ctx.answerCallbackQuery().catch(() => {});
        await showSettlement(ctx);
    });
    bot.callbackQuery(/^ops:report:([a-f0-9-]{36}):(\d+)$/, async ctx => {
        await ctx.answerCallbackQuery().catch(() => {});
        const operator = await requireOperator(ctx);
        if (!operator) return;
        const view = settlements.get(operator.userId);
        const page = Number(ctx.match[2]);
        if (!view || view.id !== ctx.match[1] || view.expiresAt <= Date.now()
            || view.adminId !== operator.admin.id || view.scope !== settlementScope(operator.admin)
            || page >= view.pages.length) {
            await ctx.reply('这份结算数据已过期，请重新查询。', { reply_markup: menuButton() });
            return;
        }
        const { text, reply_markup } = settlementMessage(view, page);
        try {
            await ctx.editMessageText(text, { reply_markup });
        } catch (error) {
            if (!(error instanceof Error && error.message.includes('message is not modified'))) {
                await ctx.reply(text, { reply_markup });
            }
        }
    });
    bot.callbackQuery('ops:grant', async ctx => {
        await ctx.answerCallbackQuery().catch(() => {});
        await startGrant(ctx);
    });
    bot.callbackQuery('ops:menu', async ctx => {
        await ctx.answerCallbackQuery().catch(() => {});
        clearConversation(ctx);
        await showMenu(ctx);
    });

    bot.on('message:text', async (ctx, next) => {
        const userId = privateUserId(ctx);
        const input = ctx.message.text.trim();
        const flow = userId ? grants.get(userId) : undefined;
        if (!flow || input.startsWith('/')) return next();
        const operator = await requireOperator(ctx, true);
        if (!operator || grants.get(operator.userId) !== flow) return;
        if (flow.adminId !== operator.admin.id || (flow.step !== 'sending' && flow.expiresAt <= Date.now())) {
            grants.delete(operator.userId);
            await ctx.reply('本次操作已过期，请重新查询玩家。', { reply_markup: menuButton() });
            return;
        }

        if (flow.step === 'account') {
            let player: PlayerForPlatformCoinGrant;
            try {
                player = await findPlayerForPlatformCoinGrant(input);
            } catch (error) {
                if (!(error instanceof PlayerCoinError)) console.error('[Telegram] 查找玩家失败:', error);
                await ctx.reply(error instanceof PlayerCoinError ? error.message : '查询玩家失败，请重试。', {
                    reply_markup: menuButton()
                });
                return;
            }
            if (grants.get(operator.userId) !== flow) return;
            grants.set(operator.userId, { ...flow, step: 'amount', player, expiresAt: expiresAt() });
            await ctx.reply(`【玩家查询结果】\n${playerDescription(player)}\n\n请输入要发放的平台币数量。`, {
                reply_markup: menuButton()
            });
            return;
        }

        if (flow.step === 'amount') {
            const amount = Number(input);
            if (!/^\d+(\.\d{1,2})?$/.test(input) || amount <= 0 || amount > MAX_PLATFORM_COIN_GRANT) {
                await ctx.reply(`请输入大于 0 且不超过 ${coinAmount.format(MAX_PLATFORM_COIN_GRANT)} 的数量，最多两位小数。`);
                return;
            }
            const requestId = randomUUID();
            grants.set(operator.userId, { ...flow, step: 'confirm', requestId, amount, expiresAt: expiresAt() });
            await ctx.reply([
                '【确认发放平台币】',
                `玩家账号 ${flow.player.account}`,
                `用户 ID ${flow.player.userId}`,
                `扣款账号 ${operator.admin.name}`,
                `发放数量 ${coinAmount.format(amount)}`
            ].join('\n'), { reply_markup: confirmButton(requestId) });
        } else {
            await ctx.reply(flow.step === 'sending' ? '正在处理发放，请稍候。' : '请使用确认消息上的按钮继续。');
        }
    });

    bot.callbackQuery(/^ops:grant:([a-f0-9-]{36})$/, async ctx => {
        await ctx.answerCallbackQuery().catch(() => {});
        const operator = await requireOperator(ctx, true);
        if (!operator) return;
        const flow = grants.get(operator.userId);
        if (flow?.step === 'sending' && flow.requestId === ctx.match[1]) return;
        if (flow?.step !== 'confirm' || flow.requestId !== ctx.match[1]
            || flow.adminId !== operator.admin.id || flow.expiresAt <= Date.now()) {
            await ctx.reply('这笔发放确认已失效，请重新查询玩家。', { reply_markup: menuButton() });
            return;
        }

        grants.set(operator.userId, { ...flow, step: 'sending' });
        try {
            await grantPlayerPlatformCoins({
                adminId: operator.admin.id,
                player: flow.player,
                amount: flow.amount,
                requestId: flow.requestId
            });
        } catch (error) {
            if (error instanceof PlayerCoinError) {
                grants.delete(operator.userId);
                await ctx.reply(error.message, { reply_markup: menuButton() });
            } else {
                console.error('[Telegram] 发放平台币失败:', error);
                grants.set(operator.userId, { ...flow, expiresAt: expiresAt() });
                await ctx.reply('暂时无法确认发放结果，请使用下方按钮重试同一笔。', {
                    reply_markup: confirmButton(flow.requestId, '重试确认')
                });
            }
            return;
        }
        grants.delete(operator.userId);
        const message = `已向 ${flow.player.account}（用户 ID ${flow.player.userId}）发放 ${coinAmount.format(flow.amount)} 平台币。`;
        const options = { reply_markup: menuButton() };
        try {
            await ctx.editMessageText(message, options);
        } catch {
            await ctx.reply(message, options);
        }
    });

    return clearConversation;
}
