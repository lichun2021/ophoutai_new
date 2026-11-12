import { createError } from 'h3';
import { sql } from '../db';
import { convertToChinaDateString } from '../utils/timezone';
import { getAdminWithPermissions } from './admin';

type SettlementAgent = {
    id: number;
    name: string;
    channel_code: string | null;
    divide_rate: number | null;
    allowed_channel_codes: unknown;
};

type PaymentTotals = {
    yesterday_amount: string | number;
    today_amount: string | number;
    total_amount: string | number;
};

function readChannelCodes(value: unknown): string[] {
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(value)) return [];

    return value
        .filter((code): code is string => typeof code === 'string')
        .map(code => code.trim())
        .filter(Boolean);
}

async function getPaymentTotals(channels: (string | null)[], yesterdayDate: string, todayDate: string) {
    const placeholders = channels.map(() => '?').join(',');
    const [totals] = await sql({
        query: `SELECT COALESCE(SUM(CASE WHEN DATE(pr.created_at) = ? THEN pr.amount END), 0) AS yesterday_amount,
                       COALESCE(SUM(CASE WHEN DATE(pr.created_at) = ? THEN pr.amount END), 0) AS today_amount,
                       COALESCE(SUM(pr.amount), 0) AS total_amount
                FROM PaymentRecords pr
                LEFT JOIN Users u ON pr.user_id = u.id
                WHERE u.channel_code IN (${placeholders})
                  AND pr.payment_status = 3
                  AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
        values: [yesterdayDate, todayDate, ...channels]
    }) as PaymentTotals[];

    return {
        yesterday_amount: Number(totals?.yesterday_amount ?? 0),
        today_amount: Number(totals?.today_amount ?? 0),
        total_amount: Number(totals?.total_amount ?? 0)
    };
}

export async function getChannelSettlementData(adminId: number) {
    const currentAdmin = await getAdminWithPermissions(adminId);
    if (!currentAdmin) {
        throw createError({ statusCode: 404, message: '管理员不存在' });
    }

    const selectAgents = `SELECT id, name, channel_code, divide_rate, allowed_channel_codes
                          FROM Admins WHERE is_active = 1 AND level = ?`;
    let agents: SettlementAgent[] = [];
    if (currentAdmin.level === 0) {
        agents = await sql({ query: `${selectAgents} ORDER BY name`, values: [1] }) as SettlementAgent[];
    } else {
        const channels = readChannelCodes(currentAdmin.allowed_channel_codes)
            .filter(code => code !== currentAdmin.channel_code);
        if (channels.length > 0) {
            const placeholders = channels.map(() => '?').join(',');
            agents = await sql({
                query: `${selectAgents} AND channel_code IN (${placeholders}) ORDER BY name`,
                values: [currentAdmin.level + 1, ...channels]
            }) as SettlementAgent[];
        }
    }

    const now = new Date();
    const today_date = convertToChinaDateString(now);
    const yesterday_date = convertToChinaDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const settlement_data = [];

    for (const agent of agents) {
        const coveredChannels: (string | null)[] = [...new Set(readChannelCodes(agent.allowed_channel_codes))];
        if (!coveredChannels.includes(agent.channel_code)) {
            coveredChannels.unshift(agent.channel_code);
        }

        const totals = await getPaymentTotals(coveredChannels, yesterday_date, today_date);
        const divideRate = (agent.divide_rate || 0) / 100;
        settlement_data.push({
            agent_id: agent.id,
            agent_name: agent.name,
            channel_code: agent.channel_code,
            divide_rate: agent.divide_rate,
            channel_count: coveredChannels.length,
            covered_channels: coveredChannels,
            ...totals,
            yesterday_settlement: totals.yesterday_amount * divideRate,
            today_settlement: totals.today_amount * divideRate,
            total_settlement: totals.total_amount * divideRate
        });
    }

    return {
        settlement_data,
        current_admin: {
            name: currentAdmin.name,
            level: currentAdmin.level,
            divide_rate: currentAdmin.divide_rate
        },
        today_date,
        yesterday_date
    };
}
