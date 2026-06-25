import { sql } from '../db';

// 获取北京时间日期字符串 YYYY-MM-DD
export function getBeijingDate(offsetDays = 0): string {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000 + offsetDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
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
 * 检查指定交易是否已激活月卡（防重复激活）
 */
export const getCardByTransactionId = async (transactionId: string): Promise<MonthlyCard | null> => {
    const result = await sql({
        query: 'SELECT * FROM MonthlyCards WHERE transaction_id = ? LIMIT 1',
        values: [transactionId],
    }) as MonthlyCard[];
    return result.length > 0 ? result[0] : null;
};
