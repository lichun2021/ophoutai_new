import { H3Event, getCookie, getQuery, readBody } from 'h3';
import { sql } from '../db';
import * as MonthlyCardModel from '../model/monthlyCard';
import * as CheckInModel from '../model/checkIn';
import * as UserModel from '../model/user';
import * as PaymentModel from '../model/payment';
import { requireAuth } from '@quantum/shared/server/utils/jwt';

// ────────────────────────────────────
// ⚠️ 已废弃: getCurrentUserId - 改用 JWT 认证
// ────────────────────────────────────

// 生成唯一 transaction_id
function genTransactionId(prefix: string, userId: number): string {
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `${prefix}${ts}${rand}${userId}`;
}

// 北京时间 datetime
function nowDatetime(): string {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ────────────────────────────────────
// GET /client/benefits/monthly-card/status
// ────────────────────────────────────
export const getMonthlyCardStatus = defineEventHandler(async (event: H3Event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询月卡状态`);
        // ========================================================

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
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 领取月卡`);
        // ========================================================

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
// ────────────────────────────────────
export const getCheckInStatus = defineEventHandler(async (event: H3Event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询签到状态`);
        // ========================================================

        const status = await CheckInModel.getMonthlyCheckInStatus(userId);
        return { code: 200, data: status };
    } catch (err: any) {
        console.error('[getCheckInStatus] error:', err);
        return { code: 500, message: '获取签到状态失败' };
    }
});

// ────────────────────────────────────
// POST /client/benefits/checkin
// 执行每日签到
// ────────────────────────────────────
export const doCheckIn = defineEventHandler(async (event: H3Event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 执行签到`);
        // ========================================================

    try {
        // 先检查今日是否已签（Redis 快速防重）
        try {
            const { getRedisCluster } = await import('../utils/redis-cluster');
            const redis = getRedisCluster();
            const today = MonthlyCardModel.getBeijingDate();
            const key = `checkin:${userId}:${today}`;
            const acquired = await redis.set(key, '1', 'EX', 86400, 'NX');
            if (!acquired) {
                return { code: 400, message: '今日已签到' };
            }
        } catch {
            // Redis 不可用时继续，由 DB 唯一键兜底
        }

        const transactionId = genTransactionId('CI', userId);

        // 执行签到（写 CheckInRecords）
        const checkInResult = await CheckInModel.doCheckIn(userId, transactionId);
        if (!checkInResult.success) {
            return { code: 400, message: checkInResult.message };
        }

        const { reward } = checkInResult;
        const totalCoins = reward!.total;

        // 获取当前余额
        const currentBalance = await UserModel.getPlatformCoins(userId);

        // 发放平台币
        const updateResult = await UserModel.updatePlatformCoinsUnified(userId, totalCoins, 9); // type 9 = 签到奖励
        if (!updateResult.success) {
            return { code: 500, message: '签到发放平台币失败' };
        }
        const newBalance = updateResult.newBalance!;

        // 写入 PaymentRecords
        const desc = reward!.bonus > 0
            ? `签到第${reward!.cumulative}天，基础+${reward!.base}，里程碑额外+${reward!.bonus}`
            : `签到第${reward!.cumulative}天，基础+${reward!.base}`;

        await PaymentModel.insert({
            user_id: userId,
            sub_user_id: null,
            role_id: '',
            transaction_id: transactionId,
            wuid: '',
            payment_way: '签到奖励',
            payment_id: 0,
            world_id: 1,
            product_name: '每日签到',
            product_des: desc,
            ip: '',
            amount: 0,
            mch_order_id: transactionId,
            msg: desc,
            server_url: '',
            device: '',
            channel_code: '',
            game_code: '',
            payment_status: 3,
            ptb_before: currentBalance,
            ptb_change: totalCoins,
            ptb_after: newBalance,
        });

        return {
            code: 200,
            data: {
                base_coins: reward!.base,
                bonus_coins: reward!.bonus,
                total_coins: totalCoins,
                cumulative_days: reward!.cumulative,
                new_balance: newBalance,
                transaction_id: transactionId,
            },
            message: reward!.bonus > 0
                ? `签到成功！获得 ${totalCoins} 平台币（含里程碑奖励 ${reward!.bonus}）`
                : `签到成功！获得 ${totalCoins} 平台币`,
        };
    } catch (err: any) {
        console.error('[doCheckIn] error:', err);
        return { code: 500, message: '签到失败，请稍后重试' };
    }
});
