import { H3Event, getCookie, getQuery, readBody } from 'h3';
import { sql } from '../db';
import * as MonthlyCardModel from '../model/monthlyCard';
import * as CheckInModel from '../model/checkIn';
import * as UserModel from '../model/user';
import * as PaymentModel from '../model/payment';

// ────────────────────────────────────
// 辅助：从 cookie 或 Authorization 头获取 user_id
// ────────────────────────────────────
async function getCurrentUserId(event: H3Event): Promise<number | null> {
    // 先尝试从 cookie 取
    const cookieUserId = getCookie(event, 'user_id');
    if (cookieUserId) {
        const id = parseInt(cookieUserId);
        if (!isNaN(id) && id > 0) return id;
    }
    // 再尝试从请求体或 query 取 user_id
    const query = getQuery(event);
    if (query.user_id) {
        const id = parseInt(query.user_id as string);
        if (!isNaN(id) && id > 0) return id;
    }
    return null;
}

// 生成唯一 transaction_id
function genTransactionId(prefix: string, userId: number): string {
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `${prefix}${ts}${rand}${userId}`;
}

// ────────────────────────────────────
// GET /client/benefits/monthly-card/status
// ────────────────────────────────────
export const getMonthlyCardStatus = defineEventHandler(async (event: H3Event) => {
    try {
        const userId = await getCurrentUserId(event);
        if (!userId) return { code: 401, message: '未登录' };

        const status = await MonthlyCardModel.getCardStatus(userId);
        return { code: 200, data: status };
    } catch (err: any) {
        console.error('[getMonthlyCardStatus] error:', err);
        return { code: 500, message: '获取月卡状态失败' };
    }
});

// ────────────────────────────────────
// POST /client/benefits/monthly-card/claim
// 领取今日月卡平台币
// ────────────────────────────────────
export const claimMonthlyCard = defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const userId = body?.user_id ? parseInt(body.user_id) : await getCurrentUserId(event);
    if (!userId) return { code: 401, message: '未登录' };

    try {
        const today = MonthlyCardModel.getBeijingDate();

        // 获取当前有效月卡
        const cards = await MonthlyCardModel.getActiveCardsByUserId(userId);
        if (cards.length === 0) {
            return { code: 400, message: '您没有有效的月卡' };
        }

        // 检查今日已领的卡
        const claimedCardIds = await MonthlyCardModel.getTodayClaimedCardIds(userId, today);
        const unclaimedCards = cards.filter(c => !claimedCardIds.includes(c.id));

        if (unclaimedCards.length === 0) {
            return { code: 400, message: '今日月卡权益已领取' };
        }

        // 计算总领取金额
        const totalCoins = unclaimedCards.reduce((sum, c) => sum + c.daily_coins, 0);

        // 获取当前余额
        const currentBalance = await UserModel.getPlatformCoins(userId);

        // 生成 transaction_id
        const transactionId = genTransactionId('MC', userId);

        // 更新平台币
        const updateResult = await UserModel.updatePlatformCoinsUnified(userId, totalCoins, 8); // type 8 = 月卡权益
        if (!updateResult.success) {
            return { code: 500, message: updateResult.message || '领取失败' };
        }
        const newBalance = updateResult.newBalance!;

        // 写入 PaymentRecords
        const cardNames = unclaimedCards.map(c => c.card_type === 'monthly' ? '月卡' : '终身卡').join('+');
        await PaymentModel.insert({
            user_id: userId,
            sub_user_id: null,
            role_id: '',
            transaction_id: transactionId,
            wuid: '',
            payment_way: '月卡权益',
            payment_id: 0,
            world_id: 1,
            product_name: `${cardNames}每日领取`,
            product_des: `领取 ${totalCoins} 平台币`,
            ip: '',
            amount: 0,
            mch_order_id: transactionId,
            msg: `${cardNames}，共领取${totalCoins}平台币`,
            server_url: '',
            device: '',
            channel_code: '',
            game_code: '',
            payment_status: 3,
            ptb_before: currentBalance,
            ptb_change: totalCoins,
            ptb_after: newBalance,
        });

        // 写入每张卡的领取记录（防重）
        for (const card of unclaimedCards) {
            try {
                await MonthlyCardModel.insertClaim(card.id, userId, today, card.daily_coins, transactionId);
            } catch (err: any) {
                // 唯一键冲突（并发），忽略
                if (!err?.message?.includes('Duplicate')) throw err;
            }
        }

        return {
            code: 200,
            data: {
                coins_claimed: totalCoins,
                new_balance: newBalance,
                transaction_id: transactionId,
            },
            message: `成功领取 ${totalCoins} 平台币`,
        };
    } catch (err: any) {
        console.error('[claimMonthlyCard] error:', err);
        return { code: 500, message: '领取失败，请稍后重试' };
    }
});

// ────────────────────────────────────
// GET /client/benefits/checkin/status
// 签到功能已屏蔽
// ────────────────────────────────────
export const getCheckInStatus = defineEventHandler(async (_event: H3Event) => {
    return { code: 403, message: '签到功能已关闭' };
});

// ────────────────────────────────────
// POST /client/benefits/checkin
// 执行每日签到 —— 签到功能已屏蔽
// ────────────────────────────────────
export const doCheckIn = defineEventHandler(async (_event: H3Event) => {
    return { code: 403, message: '签到功能已关闭' };
});
