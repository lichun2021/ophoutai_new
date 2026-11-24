type ReportFilter = {
    startDate: string;
    endDate: string;
    channelCodes?: string[];
    gameCodes?: string[];
    limitToLastMonth?: boolean;
};

type QueryDatabase = (input: { query: string; values: string[] }) => Promise<unknown>;
type DailyAmounts = { cashAmount: number; steamAmount: number };

/** Group successful payments by order date, using the channel/game saved on the order. */
export async function readReportPaymentAmounts(sql: QueryDatabase, filter: ReportFilter): Promise<Map<string, DailyAmounts>> {
    const { startDate, endDate, channelCodes, gameCodes } = filter;
    const amounts = new Map<string, DailyAmounts>();
    if (channelCodes?.length === 0 || gameCodes?.length === 0) return amounts;

    const method = "LOWER(TRIM(COALESCE(pr.payment_way, '')))";
    const conditions = [
        'pr.created_at >= ? AND pr.created_at < DATE_ADD(?, INTERVAL 1 DAY)',
        'pr.payment_status = 3',
        `${method} NOT LIKE '%platform%'`,
        `${method} NOT LIKE '%平台币%'`,
        `${method} <> 'ptb'`
    ];
    const params = [startDate, endDate];
    if (filter.limitToLastMonth) conditions.push('pr.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)');
    for (const [column, codes] of [['channel_code', channelCodes], ['game_code', gameCodes]] as const) {
        if (codes) {
            conditions.push(`pr.${column} IN (${codes.map(() => '?').join(',')})`);
            params.push(...codes);
        }
    }
    const where = conditions.join(' AND ');
    // The payment method is authoritative. Older rows can have only the Steam order prefix.
    const steam = `${method} = 'steam' OR (${method} = '' AND LEFT(LOWER(pr.transaction_id), 6) = 'steam_')`;
    const select = `SELECT DATE(pr.created_at) AS day, pr.amount, (${steam}) AS is_steam`;
    // Installations create the archive on their first archive run. An archived copy
    // can temporarily coexist with the live order; the live order takes precedence.
    const [archive] = await sql({
        query: "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND LOWER(table_name) = 'paymentrecords_archive' LIMIT 1",
        values: []
    }) as { name: string }[];
    const live = `${select} FROM PaymentRecords pr WHERE ${where}`;
    let source = live;
    if (archive) {
        if (!/^paymentrecords_archive$/i.test(archive.name)) throw new Error('无效的订单归档表名');
        source += ` UNION ALL ${select} FROM ${archive.name} pr WHERE ${where}
            AND NOT EXISTS (SELECT 1 FROM PaymentRecords live WHERE live.transaction_id = pr.transaction_id)`;
    }
    const rows = await sql({
        query: `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS date,
                       SUM(CASE WHEN is_steam THEN 0 ELSE amount END) AS cashAmount,
                       SUM(CASE WHEN is_steam THEN amount ELSE 0 END) AS steamAmount
                FROM (${source}) AS payments
                GROUP BY day`,
        values: archive ? [...params, ...params] : params
    }) as { date: string; cashAmount: number | string; steamAmount: number | string }[];
    for (const row of rows) {
        amounts.set(row.date, { cashAmount: Number(row.cashAmount), steamAmount: Number(row.steamAmount) });
    }
    return amounts;
}
