import { sql } from '../db';

/**
 * 玩家禁言状态表 model
 * 禁言状态存平台库 quantum_db.player_mute_status，不碰游戏方 player 表。
 * 游戏服侧的禁言状态由 mute/unmute 接口自行维护，本表用于平台侧记录与查询。
 */

export interface PlayerMuteStatusEntry {
  server: string;
  player_id: string;
  open_id: string;
  platform?: string;
  mute_until: number;   // 禁言到期时间戳(毫秒)，0=永禁
  reason?: string;
  muted_by?: number | null;
}

/** 写入/更新禁言状态（同 server+player_id 唯一，ON DUPLICATE 更新） */
export async function upsertMuteStatus(entry: PlayerMuteStatusEntry) {
  await sql({
    query: `INSERT INTO player_mute_status
      (server, player_id, open_id, platform, mute_until, reason, muted_by, muted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        open_id = VALUES(open_id),
        platform = VALUES(platform),
        mute_until = VALUES(mute_until),
        reason = VALUES(reason),
        muted_by = VALUES(muted_by),
        muted_at = NOW()`,
    values: [
      entry.server,
      entry.player_id,
      entry.open_id,
      entry.platform ?? '',
      entry.mute_until,
      entry.reason ?? '',
      entry.muted_by ?? null,
    ],
  });
}

/** 解禁：删除该玩家的禁言状态记录 */
export async function removeMuteStatus(server: string, player_id: string) {
  await sql({
    query: `DELETE FROM player_mute_status WHERE server = ? AND player_id = ?`,
    values: [server, player_id],
  });
}

/** 查询某玩家当前是否处于禁言中 */
export async function getMuteStatus(server: string, player_id: string) {
  const rows = await sql({
    query: `SELECT id, server, player_id, open_id, platform, mute_until, reason, muted_by, muted_at
             FROM player_mute_status
             WHERE server = ? AND player_id = ?
             LIMIT 1`,
    values: [server, player_id],
  }) as any[];
  return rows?.[0] ?? null;
}
