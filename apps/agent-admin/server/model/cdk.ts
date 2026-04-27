import { sql } from '../db';

export type CDKType = {
  id?: number;
  title: string;
  content: string;
  type: 'universal' | 'unique' | 'data';
  items: any; // JSON 数组: [{ ItemId: number, ItemNum: number }, ...]
  created_at?: string;
  updated_at?: string;
};

export type CDKCode = {
  id?: number;
  code: string;
  cdk_type_id: number;
  is_used?: number; // 0/1
  used_by_player_id?: string | null;
  used_at?: string | null;
  created_at?: string;
};

export type CDKRedemption = {
  id?: number;
  player_id: string;
  server: string;
  code: string;
  cdk_type_id: number;
  open_id?: string;
  platform?: string | number;
  created_at?: string;
};

// 工具: 生成唯一 8 位码
export const generateRandomCode = (length = 8) => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 排除易混淆字符
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

// ========== 类型 ==========
export const createType = async (data: Omit<CDKType, 'id' | 'created_at' | 'updated_at'>) => {
  const result = await sql({
    query: `INSERT INTO cdktypes (title, content, type, items) VALUES (?, ?, ?, ?)`,
    values: [data.title, data.content, data.type, JSON.stringify(data.items)],
  }) as any;
  return { insertId: result.insertId };
};

export const updateType = async (id: number, data: Partial<CDKType>) => {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.items !== undefined) { fields.push('items = ?'); values.push(JSON.stringify(data.items)); }
  if (fields.length === 0) return { affectedRows: 0 };
  values.push(id);
  const result = await sql({
    query: `UPDATE cdktypes SET ${fields.join(', ')} WHERE id = ?`,
    values,
  }) as any;
  return { affectedRows: result.affectedRows };
};

export const getTypes = async () => {
  const rows = await sql({ query: `SELECT * FROM cdktypes ORDER BY id DESC` }) as any[];
  return rows.map(r => ({ ...r, items: safeParseJson(r.items) }));
};

export const getTypeById = async (id: number) => {
  const rows = await sql({ query: `SELECT * FROM cdktypes WHERE id = ?`, values: [id] }) as any[];
  if (rows.length === 0) return null;
  const row = rows[0];
  row.items = safeParseJson(row.items);
  return row as CDKType;
};

export const getLatestTypeByType = async (type: 'universal' | 'unique' | 'data') => {
  const rows = await sql({ query: `SELECT * FROM cdktypes WHERE type = ? ORDER BY id DESC LIMIT 1`, values: [type] }) as any[];
  if (rows.length === 0) return null;
  const row = rows[0];
  row.items = safeParseJson(row.items);
  return row as CDKType;
};

// ========== 码 ==========
export const createCodes = async (cdk_type_id: number, count = 1, customCodes?: string[], codeLength = 8) => {
  const codes: string[] = [];

  if (customCodes && customCodes.length > 0) {
    for (const c of customCodes) codes.push(c.trim());
  } else {
    for (let i = 0; i < count; i++) codes.push(generateRandomCode(codeLength));
  }

  const values: any[] = [];
  const placeholders: string[] = [];
  for (const code of codes) {
    placeholders.push('(?, ?, 0, NULL, NULL)');
    values.push(code, cdk_type_id);
  }

  const query = `INSERT IGNORE INTO cdkcodes (code, cdk_type_id, is_used, used_by_player_id, used_at) VALUES ${placeholders.join(',')}`;
  const result = await sql({ query, values }) as any;
  return { inserted: result.affectedRows, total: codes.length, codesInserted: codes };
};

export const getCode = async (code: string) => {
  const rows = await sql({ query: `SELECT * FROM cdkcodes WHERE code = ?`, values: [code] }) as any[];
  return rows.length > 0 ? rows[0] as CDKCode : null;
};

export const listCodes = async (filters: { cdk_type_id?: number; code?: string; is_used?: number; page?: number; pageSize?: number }) => {
  const where: string[] = [];
  const values: any[] = [];
  if (filters.cdk_type_id) { where.push('cdk_type_id = ?'); values.push(filters.cdk_type_id); }
  if (filters.code) { where.push('code LIKE ?'); values.push(`%${filters.code}%`); }
  if (filters.is_used !== undefined) { where.push('is_used = ?'); values.push(filters.is_used); }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const rows = await sql({
    query: `SELECT * FROM cdkcodes ${whereClause} ORDER BY id DESC LIMIT ?, ?`,
    values: [...values, offset, pageSize],
  }) as any[];

  const countRows = await sql({
    query: `SELECT COUNT(*) as total FROM cdkcodes ${whereClause}`,
    values,
  }) as any[];

  return { list: rows, total: countRows[0]?.total || 0, page, pageSize };
};

export const markCodeUsed = async (code: string, player_id: string) => {
  const result = await sql({
    query: `UPDATE cdkcodes SET is_used = 1, used_by_player_id = ?, used_at = NOW() WHERE code = ? AND is_used = 0`,
    values: [player_id, code],
  }) as any;
  return { affectedRows: result.affectedRows };
};

// ========== 领取记录 ==========
export const hasRedeemed = async (player_id: string, cdk_type_id: number) => {
  const rows = await sql({
    query: `SELECT id FROM cdkredemptions WHERE player_id = ? AND cdk_type_id = ? LIMIT 1`,
    values: [player_id, cdk_type_id],
  }) as any[];
  return rows.length > 0;
};

// data 类型按天幂等：玩家 + 类型 + code(YYYYMMDD)
export const hasRedeemedByTypeAndCode = async (player_id: string, cdk_type_id: number, code: string) => {
  const rows = await sql({
    query: `SELECT id FROM cdkredemptions WHERE player_id = ? AND cdk_type_id = ? AND code = ? LIMIT 1`,
    values: [player_id, cdk_type_id, code],
  }) as any[];
  return rows.length > 0;
};

export const insertRedemption = async (data: Omit<CDKRedemption, 'id' | 'created_at'>) => {
  const result = await sql({
    query: `INSERT INTO cdkredemptions (player_id, server, code, cdk_type_id, open_id, platform)
            VALUES (?, ?, ?, ?, ?, ?)`,
    values: [data.player_id, data.server, data.code, data.cdk_type_id, data.open_id || null, data.platform?.toString() || null],
  }) as any;
  return { insertId: result.insertId };
};

export const listRedemptions = async (filters: { player_id?: string; code?: string; cdk_type_id?: number; page?: number; pageSize?: number }) => {
  const where: string[] = [];
  const values: any[] = [];
  if (filters.player_id) { where.push('player_id = ?'); values.push(filters.player_id); }
  if (filters.code) { where.push('code LIKE ?'); values.push(`%${filters.code}%`); }
  if (filters.cdk_type_id) { where.push('cdk_type_id = ?'); values.push(filters.cdk_type_id); }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const rows = await sql({
    query: `SELECT * FROM cdkredemptions ${whereClause} ORDER BY id DESC LIMIT ?, ?`,
    values: [...values, offset, pageSize],
  }) as any[];

  const countRows = await sql({
    query: `SELECT COUNT(*) as total FROM cdkredemptions ${whereClause}`,
    values,
  }) as any[];

  return { list: rows, total: countRows[0]?.total || 0, page, pageSize };
};

function safeParseJson(input: any) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'object') return input;
  try { return JSON.parse(input); } catch { return input; }
}


