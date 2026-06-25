import { sql } from '../db';
import { getBeijingDate } from './monthlyCard';

export interface CheckInRecord {
    id: number;
    user_id: number;
    check_date: string;
    base_coins: number;
    bonus_coins: number;
    total_coins: number;
    cumulative_days: number;
    transaction_id: string | null;
    created_at: string;
}

// 里程碑配置：累计天数 -> 额外奖励（WAO 平台为 main 的一半）
const MILESTONES: { days: number; bonus: number }[] = [
    { days: 3,  bonus: 150  },
    { days: 7,  bonus: 200  },
    { days: 13, bonus: 300  },
    { days: 17, bonus: 400  },
    { days: 25, bonus: 500  },
    { days: 30, bonus: 600  },
];

// WAO 平台每日签到基础奖励（main: 200，WAO: 100）
const BASE_COINS = 100;

/**
 * 获取用户本月签到状态
 */
export const getMonthlyCheckInStatus = async (userId: number) => {
    const today = getBeijingDate();
    const yearMonth = today.slice(0, 7);

    console.log(`[CheckIn][status] userId=${userId} today="${today}" yearMonth="${yearMonth}"`);

    // 本月所有签到记录
    const records = await sql({
        query: `SELECT check_date, cumulative_days, total_coins, bonus_coins
                FROM CheckInRecords
                WHERE user_id = ? AND check_date LIKE ?
                ORDER BY check_date ASC`,
        values: [userId, `${yearMonth}%`],
    }) as { check_date: string; cumulative_days: number; total_coins: number; bonus_coins: number }[];

    console.log(`[CheckIn][status] 查到 ${records.length} 条记录`);
    if (records.length > 0) {
        const r0 = records[0];
        console.log(`[CheckIn][status] 第一条 check_date 原始值=`, r0.check_date);
        console.log(`[CheckIn][status] 第一条 check_date typeof=`, typeof r0.check_date);
        console.log(`[CheckIn][status] 第一条 check_date instanceof Date=`, r0.check_date instanceof Date);
        console.log(`[CheckIn][status] String(check_date)=`, String(r0.check_date));
        // 如果是 Date 对象，用 toISOString 转换
        if (r0.check_date instanceof Date) {
            console.log(`[CheckIn][status] toISOString=`, (r0.check_date as any).toISOString());
        }
    }

    // 统一处理：Date对象用toISOString，字符串用slice
    const checkedDates = records.map(r => {
        const raw = r.check_date as any;
        if (raw instanceof Date) {
            return raw.toISOString().slice(0, 10);
        }
        return String(raw).slice(0, 10);
    });

    console.log(`[CheckIn][status] checkedDates=`, checkedDates);
    const todayChecked = checkedDates.includes(today);
    console.log(`[CheckIn][status] todayChecked=${todayChecked}`);

    // 当月累计天数（取最新记录的 cumulative_days）
    const cumulativeDays = records.length > 0
        ? records[records.length - 1].cumulative_days
        : 0;

    // 下一个里程碑
    const nextMilestone = MILESTONES.find(m => m.days > cumulativeDays) || null;

    // 已达成里程碑
    const achievedMilestones = MILESTONES.filter(m => m.days <= cumulativeDays);

    return {
        today,
        checkedDates,
        todayChecked,
        cumulativeDays,
        nextMilestone,
        achievedMilestones,
        milestones: MILESTONES,
        baseCoins: BASE_COINS,
    };
};

/**
 * 计算签到奖励（不修改数据库）
 */
export const calcCheckInReward = (cumulativeDays: number): { baseCo: number; bonusCo: number; totalCo: number } => {
    const newCumulativeDays = cumulativeDays + 1;
    const baseCo = BASE_COINS;
    const milestone = MILESTONES.find(m => m.days === newCumulativeDays);
    const bonusCo = milestone ? milestone.bonus : 0;
    const totalCo = baseCo + bonusCo;
    return { baseCo, bonusCo, totalCo };
};

/**
 * 执行签到
 * 返回: { success, message, reward?, newCumulativeDays? }
 */
export const doCheckIn = async (
    userId: number,
    transactionId: string
): Promise<{
    success: boolean;
    message: string;
    reward?: { base: number; bonus: number; total: number; cumulative: number };
}> => {
    const today = getBeijingDate();
    const yearMonth = today.slice(0, 7);

    // 查今日是否已签
    const todayRecord = await sql({
        query: 'SELECT id FROM CheckInRecords WHERE user_id = ? AND check_date = ? LIMIT 1',
        values: [userId, today],
    }) as any[];

    if (todayRecord.length > 0) {
        return { success: false, message: '今日已签到' };
    }

    // 查本月累计天数
    const monthRecord = await sql({
        query: `SELECT MAX(cumulative_days) AS max_days
                FROM CheckInRecords
                WHERE user_id = ? AND check_date LIKE ?`,
        values: [userId, `${yearMonth}%`],
    }) as { max_days: number | null }[];

    const cumulativeDays = monthRecord[0]?.max_days ?? 0;
    const { baseCo, bonusCo, totalCo } = calcCheckInReward(cumulativeDays);
    const newCumulativeDays = cumulativeDays + 1;

    // 写入签到记录
    try {
        await sql({
            query: `INSERT INTO CheckInRecords
                        (user_id, check_date, base_coins, bonus_coins, total_coins, cumulative_days, transaction_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
            values: [userId, today, baseCo, bonusCo, totalCo, newCumulativeDays, transactionId],
        });
    } catch (err: any) {
        // 唯一键冲突：并发签到
        if (err?.message?.includes('Duplicate') || err?.code === 'ER_DUP_ENTRY') {
            return { success: false, message: '今日已签到' };
        }
        throw err;
    }

    return {
        success: true,
        message: '签到成功',
        reward: {
            base: baseCo,
            bonus: bonusCo,
            total: totalCo,
            cumulative: newCumulativeDays,
        },
    };
};
