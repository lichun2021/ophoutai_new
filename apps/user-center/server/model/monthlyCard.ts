import { pool, sql } from '../db';
import { readCardEntitlementState } from '@quantum/shared/server/utils/cardEntitlements';

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
    return (await readCardEntitlementState(pool, userId)).cards as MonthlyCard[];
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
    return result.map(r => String(r.claim_date).slice(0, 10));
};





/**
 * 获取用户月卡聚合状态
 */
export const getCardStatus = async (userId: number) => readCardEntitlementState(pool, userId);

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
