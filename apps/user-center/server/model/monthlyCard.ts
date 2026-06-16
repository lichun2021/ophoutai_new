import { sql } from '../db';

// 获取北京时间日期字符串 YYYY-MM-DD
export function getBeijingDate(offsetDays = 0): string {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000 + offsetDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
}

// 获取北京时间 datetime 字符串
export function getBeijingDatetime(): string {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

export interface MonthlyCard {
    id: number;
    user_id: number;
    card_type: 'monthly' | 'lifetime';
    daily_coins: number;
    start_date: string;
    expire_date: string | null;
    is_active: number;
    purchase_amount: number | null;
    transaction_id: string | null;
    created_at: string;
}

export interface MonthlyCardClaim {
    id: number;
    card_id: number;
    user_id: number;
    claim_date: string;
    coins_amount: number;
    transaction_id: string | null;
    created_at: string;
}

/**
 * 获取用户当前有效的月卡列表（含到期当天）
 */
export const getActiveCardsByUserId = async (userId: number): Promise<MonthlyCard[]> => {
    const today = getBeijingDate();
    const result = await sql({
        query: `SELECT * FROM MonthlyCards
                WHERE user_id = ?
                  AND is_active = 1
                  AND (expire_date IS NULL OR expire_date >= ?)
                ORDER BY created_at ASC`,
        values: [userId, today],
    }) as MonthlyCard[];
    return result;
};

/**
 * 获取用户今天已领取的月卡 ID 列表
 */
export const getTodayClaimedCardIds = async (userId: number, date: string): Promise<number[]> => {
    const result = await sql({
        query: `SELECT card_id FROM MonthlyCardClaims
                WHERE user_id = ? AND claim_date = ?`,
        values: [userId, date],
    }) as { card_id: number }[];
    return result.map(r => r.card_id);
};

/**
 * 获取用户本月所有已领取的日期列表
 */
export const getMonthClaimedDates = async (userId: number, yearMonth: string): Promise<string[]> => {
    const result = await sql({
        query: `SELECT DISTINCT claim_date FROM MonthlyCardClaims
                WHERE user_id = ? AND claim_date LIKE ?
                ORDER BY claim_date`,
        values: [userId, `${yearMonth}%`],
    }) as { claim_date: string }[];
    return result.map(r => r.claim_date);
};

/**
 * 记录月卡每日领取（只记录，不发放平台币）
 * 返回插入的 claim id
 */
export const insertClaim = async (
    cardId: number,
    userId: number,
    claimDate: string,
    coinsAmount: number,
    transactionId: string
): Promise<number> => {
    const result = await sql({
        query: `INSERT INTO MonthlyCardClaims (card_id, user_id, claim_date, coins_amount, transaction_id)
                VALUES (?, ?, ?, ?, ?)`,
        values: [cardId, userId, claimDate, coinsAmount, transactionId],
    }) as any;
    return result.insertId;
};

/**
 * 激活新月卡（支付回调后调用）
 */
export const activateCard = async (params: {
    userId: number;
    cardType: 'monthly' | 'lifetime';
    dailyCoins: number;
    startDate: string;
    expireDate: string | null;
    purchaseAmount: number;
    transactionId: string;
}): Promise<number> => {
    const result = await sql({
        query: `INSERT INTO MonthlyCards
                    (user_id, card_type, daily_coins, start_date, expire_date, is_active, purchase_amount, transaction_id)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        values: [
            params.userId,
            params.cardType,
            params.dailyCoins,
            params.startDate,
            params.expireDate,
            params.purchaseAmount,
            params.transactionId,
        ],
    }) as any;
    return result.insertId;
};

/**
 * 获取用户月卡聚合状态
 */
export const getCardStatus = async (userId: number) => {
    const today = getBeijingDate();
    const yearMonth = today.slice(0, 7);

    // 有效月卡
    const cards = await getActiveCardsByUserId(userId);

    // 今日已领取的卡
    const claimedCardIds = await getTodayClaimedCardIds(userId, today);

    // 本月已领取日期（任意一张卡）
    const claimedDates = await getMonthClaimedDates(userId, yearMonth);

    // 汇总信息
    const totalDailyCoins = cards.reduce((sum, c) => sum + c.daily_coins, 0);
    const todayClaimed = cards.length > 0 && cards.every(c => claimedCardIds.includes(c.id));
    const unclaimedCards = cards.filter(c => !claimedCardIds.includes(c.id));

    return {
        cards,
        totalDailyCoins,
        todayClaimed,
        unclaimedCards,
        claimedDates,
        today,
    };
};

/**
 * 检查指定交易是否已激活月卡（防重复激活）
 */
export const getCardByTransactionId = async (transactionId: string): Promise<MonthlyCard | null> => {
    const result = await sql({
        query: 'SELECT * FROM MonthlyCards WHERE transaction_id = ? LIMIT 1',
        values: [transactionId],
    }) as MonthlyCard[];
    return result.length > 0 ? result[0] : null;
};
