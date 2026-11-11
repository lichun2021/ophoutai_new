export type GmMailItem = { i: number; a: number };
export type GmPlayer = {
  id: string;
  wuid: string;
  name: string;
  worldId: number;
  level?: number;
  vipLevel?: number;
};
export type GmMailResult = {
  playerId: string;
  success: boolean;
  status: 'confirmed' | 'failed' | 'unknown';
  message: string;
};

const MAX_WUID = 9223372036854775807n;
export const MAIL_RESULT_UNKNOWN = '发送结果未确认，请先核对游戏内邮件记录，勿直接重试';

// The game stores WUID as a signed Mongo Long. Never accept a JS number here.
export function normalizeWuid(value: unknown): string {
  if (typeof value !== 'string') throw new Error('WUID 必须以字符串提交');
  const text = value.trim();
  if (!/^[1-9]\d{0,18}$/.test(text) || BigInt(text) > MAX_WUID) {
    throw new Error('WUID 必须是有效的正整数 64 位玩家标识');
  }
  return text;
}

export function normalizeWorldId(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text)) {
    throw new Error('请在区服配置中填写明确的 server_id（游戏区服 ID）');
  }
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw new Error('游戏区服 ID 超出有效范围');
  }
  return id;
}

function responseWuid(value: unknown): string {
  // BSON Long.toJSON() in the reference server returns a decimal string.
  // Accept Extended JSON too, but never recover an already rounded number.
  if (value && typeof value === 'object' && '$numberLong' in value) {
    return normalizeWuid((value as { $numberLong: unknown }).$numberLong);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return normalizeWuid(String(value));
  return normalizeWuid(value);
}

export function buildMailMessage(playerId: string, title: string, content: string, items: GmMailItem[]) {
  return {
    c: 4,
    s: 0,
    t: 21,
    i: items.map(item => ({ i: [{ i: item.i, a: 1, r: 100 }], a: item.a, r: 100, t: 100 })),
    f: { id: 999 },
    // Do not send d: JSON would turn a Date into a string and Mongo's Date TTL
    // would not apply. Use the game's own default expiry handling, as the
    // reference daemon does when an explicit lifetime is not selected.
    m: content,
    title,
    icon: null,
    u: normalizeWuid(playerId),
  };
}

export class GmInterClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(options: { baseUrl: string; secret: string; timeoutMs?: number }) {
    if (!options.secret?.trim()) throw new Error('尚未配置游戏运营接口密钥 GM_INTER_SECRET');
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new Error('尚未配置有效的游戏 Inter 服务地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('游戏 Inter 地址须为 HTTP(S) 根地址，不含账号、查询参数或 /script 路径');
    }
    this.baseUrl = url.origin;
    this.secret = options.secret;
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120000) {
      throw new Error('GM_TIMEOUT_MS 必须为 1–120000 毫秒');
    }
  }

  private async call(path: string, data: Record<string, string>): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...data, code: this.secret }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`游戏服接口返回 HTTP ${response.status}`);
      let payload: any;
      try { payload = await response.json(); } catch { throw new Error('游戏服接口返回非 JSON 响应'); }
      if (!payload || typeof payload !== 'object' || Number(payload.code) !== 200) {
        // Do not relay raw responses: the peer can include its request or secret.
        throw new Error('游戏服接口未确认操作成功，请检查 Inter 地址、密钥和区服配置');
      }
      const result = payload.result ?? payload;
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('游戏服接口响应格式异常');
      return result;
    } catch (error: any) {
      if (controller.signal.aborted) throw new Error('游戏服响应超时');
      if (error instanceof TypeError) throw new Error('无法连接游戏 Inter 服务');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async getPlayer(worldId: number, wuid: string): Promise<GmPlayer | null> {
    const world = normalizeWorldId(worldId);
    const id = normalizeWuid(wuid);
    const result = await this.call('/v2/Inter/User/get_one', { w_id: String(world), _id: id });
    const user = result.user;
    if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('游戏服角色响应格式异常');
    if (Object.keys(user).length === 0) return null;
    let actualId: string;
    try { actualId = responseWuid(user._id); } catch { throw new Error('游戏服返回的 WUID 无效或已丢失精度'); }
    if (actualId !== id || normalizeWorldId(user.w) !== world) throw new Error('游戏服返回了不匹配的角色或区服');
    const player: GmPlayer = { id: actualId, wuid: actualId, name: String(user.n ?? ''), worldId: world };
    if (Number.isSafeInteger(user.teamlv) && user.teamlv >= 0) player.level = user.teamlv;
    if (Number.isSafeInteger(user.vip) && user.vip >= 0) player.vipLevel = user.vip;
    return player;
  }

  // One request for one explicitly targeted batch. No automatic retry: this
  // upstream operation does not expose an idempotency key.
  async sendMail(worldId: number, playerIds: string[], title: string, content: string, items: GmMailItem[]): Promise<GmMailResult[]> {
    const world = normalizeWorldId(worldId);
    const ids = playerIds.map(normalizeWuid);
    if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('邮件收件人须为 1–50 个不重复 WUID');
    const unknown = () => ids.map(playerId => ({ playerId, success: false, status: 'unknown' as const, message: MAIL_RESULT_UNKNOWN }));
    let result: any;
    try {
      result = await this.call('/v2/Inter/Message/add_message_list', {
        w_id: String(world),
        f_u64: '1',
        message_str: JSON.stringify(ids.map(id => buildMailMessage(id, title, content, items))),
      });
    } catch {
      // A network failure can happen after insertion. Never claim it did not send.
      return unknown();
    }
    if (!Array.isArray(result.success_list) || !Array.isArray(result.err_list) || !Array.isArray(result.err_info_list)) return unknown();
    const successes = new Map<string, number>();
    const failures = new Set<string>();
    try {
      for (const entry of result.success_list) {
        const id = responseWuid(entry.u);
        if (normalizeWorldId(entry.w_id) !== world || !ids.includes(id)) return unknown();
        successes.set(id, (successes.get(id) || 0) + 1);
      }
      for (const entry of result.err_list) {
        const id = responseWuid(entry.u);
        if (normalizeWorldId(entry.w_id) !== world || !ids.includes(id)) return unknown();
        failures.add(id);
      }
    } catch { return unknown(); }
    if (result.err_info_list.length && !result.err_list.length) return unknown();
    return ids.map(playerId => {
      const accepted = successes.get(playerId) || 0;
      if (accepted === 1 && !failures.has(playerId)) {
        return { playerId, success: true, status: 'confirmed', message: '游戏服已确认邮件发送' };
      }
      if (!accepted && failures.has(playerId)) {
        return { playerId, success: false, status: 'failed', message: '游戏服拒绝该玩家的邮件，请核对区服和 WUID' };
      }
      return { playerId, success: false, status: 'unknown', message: MAIL_RESULT_UNKNOWN };
    });
  }
}
