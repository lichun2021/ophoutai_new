import { sql } from '../db';
import { gameDbSql } from '../db/gameDb';

export type RechargeDaily = {
    billno: string;
    type: number;
    diamonds: number;
    time: number;
    token: string | null;
    serverId: string | null;
    playerId: string | null;
    puid: string | null;
    goodsId: string | null;
    goodsPrice: number;
    payMoney: number;
    currency: string | null;
    awardItems: string | null;
    createTime: number;
    updateTime: number | null;
    invalid: number | boolean;
};

export interface RechargeDailyFilters {
    playerId?: string;
    serverId?: string;
    startMs?: number;
    endMs?: number;
}

export async function queryRechargeDaily(page: number, pageSize: number, filters: RechargeDailyFilters, database?: string) {
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const values: any[] = [];

    // 过滤 invalid=1
    where.push('(invalid = 0 OR invalid = FALSE OR invalid IS NULL)');

    if (filters.playerId) { where.push('playerId = ?'); values.push(filters.playerId); }
    if (filters.serverId) { where.push('serverId = ?'); values.push(filters.serverId); }
    if (filters.startMs && filters.endMs) { where.push('time BETWEEN ? AND ?'); values.push(filters.startMs, filters.endMs); }
    else if (filters.startMs) { where.push('time >= ?'); values.push(filters.startMs); }
    else if (filters.endMs) { where.push('time <= ?'); values.push(filters.endMs); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const query = `
      SELECT billno, type, diamonds, time, token, serverId, playerId, puid,
             goodsId, goodsPrice, payMoney, currency, awardItems, createTime, updateTime, invalid
      FROM recharge_daily
      ${whereClause}
      ORDER BY time DESC
      LIMIT ?, ?`;
    values.push(offset, pageSize);
    const rows = database
        ? await gameDbSql({ query, values, database }) as any[]
        : await sql({ query, values }) as any[];
    return rows as RechargeDaily[];
}

export async function countRechargeDaily(filters: RechargeDailyFilters, database?: string) {
    const where: string[] = [];
    const values: any[] = [];
    where.push('(invalid = 0 OR invalid = FALSE OR invalid IS NULL)');
    if (filters.playerId) { where.push('playerId = ?'); values.push(filters.playerId); }
    if (filters.serverId) { where.push('serverId = ?'); values.push(filters.serverId); }
    if (filters.startMs && filters.endMs) { where.push('time BETWEEN ? AND ?'); values.push(filters.startMs, filters.endMs); }
    else if (filters.startMs) { where.push('time >= ?'); values.push(filters.startMs); }
    else if (filters.endMs) { where.push('time <= ?'); values.push(filters.endMs); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const query = `SELECT COUNT(*) AS total FROM recharge_daily ${whereClause}`;
    const result = database
        ? await gameDbSql({ query, values, database }) as any[]
        : await sql({ query, values }) as any[];
    return result[0]?.total || 0;
}


