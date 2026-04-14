import { sql } from '../db';

export type GmOperationType = 'ban' | 'unban' | 'send_items' | 'recharge' | 'send_mail' | 'migrate_platform' | 'open_protect_shield' | 'delete_player' | 'create_admin';

export interface GmOperationLogInsert {
  op_type: GmOperationType;
  server: string;
  player_id?: string | null;
  player_name?: string | null;
  open_id?: string | null;
  role_id?: string | null;
  platform?: string | null;
  admin_id?: number | null;
  admin_name?: string | null;
  request_params?: any;
  response_result?: any;
  success: 0 | 1;
  error_message?: string | null;
}

export async function insertGmOperationLog(entry: GmOperationLogInsert) {
  const result = await sql({
    query: `INSERT INTO gm_operation_logs (
      op_type, server, player_id, player_name, open_id, role_id, platform,
      admin_id, admin_name, request_params, response_result, success, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?)` ,
    values: [
      entry.op_type,
      entry.server,
      entry.player_id ?? null,
      entry.player_name ?? null,
      entry.open_id ?? null,
      entry.role_id ?? null,
      entry.platform ?? null,
      entry.admin_id ?? null,
      entry.admin_name ?? null,
      JSON.stringify(entry.request_params ?? {}),
      JSON.stringify(entry.response_result ?? {}),
      entry.success,
      entry.error_message ?? null
    ]
  });
  return result;
}

export interface QueryLogsParams {
  page?: number;
  pageSize?: number;
  op_type?: GmOperationType | 'all';
  server?: string;
  player_id?: string;
  player_name?: string;
  open_id?: string;
  admin_id?: string;
  startDate?: string; // ISO or YYYY-MM-DD
  endDate?: string;   // ISO or YYYY-MM-DD
}

export async function queryGmOperationLogs(params: QueryLogsParams) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const values: any[] = [];

  if (params.op_type && params.op_type !== 'all') { where.push('op_type = ?'); values.push(params.op_type); }
  if (params.server) { where.push('server = ?'); values.push(params.server); }
  if (params.player_id) { where.push('player_id = ?'); values.push(params.player_id); }
  if (params.player_name) { where.push('player_name LIKE ?'); values.push(`%${params.player_name}%`); }
  if (params.open_id) { where.push('open_id = ?'); values.push(params.open_id); }
  if (params.admin_id) { where.push('admin_id = ?'); values.push(params.admin_id); }
  if (params.startDate) { where.push('created_at >= ?'); values.push(params.startDate); }
  if (params.endDate) { where.push('created_at <= ?'); values.push(params.endDate); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await sql({
    query: `SELECT id, op_type, server, player_id, player_name, open_id, role_id, platform, admin_id, admin_name,
                   request_params, response_result, success, error_message, created_at
            FROM gm_operation_logs ${whereSql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?` ,
    values: [...values, pageSize, offset]
  }) as any[];

  const totalRows = await sql({
    query: `SELECT COUNT(1) AS cnt FROM gm_operation_logs ${whereSql}`,
    values
  }) as any[];

  const total = totalRows?.[0]?.cnt || 0;
  return { rows, total, page, pageSize };
}


