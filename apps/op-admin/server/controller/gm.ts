import { type H3Event, readBody, getQuery, createError, getCookie } from 'h3';
import * as AdminModel from '../model/admin';
import { verifyAdminSession } from '../utils/auth';
import { listActive, getByIdentifier, type GameServerConfig } from '../model/gameServers';
import { insertGmOperationLog } from '../model/gmOperationLogs';
import { getGmItem, searchGmItems } from '../utils/gmItems';
import { GmInterClient, normalizeWorldId, normalizeWuid, type GmMailItem, type GmMailResult } from '../utils/gmInterClient';

const invalid = (message: string) => createError({ statusCode: 400, statusMessage: 'Invalid GM request', message });

export const requireGMPermission = async (event: H3Event) => {
  const session = await verifyAdminSession(getCookie(event, 'admin_sid'));
  if (!session.ok || !session.adminId) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required', message: '请先登录有效的管理员账号' });
  }
  const admin = await AdminModel.getAdminWithPermissions(session.adminId);
  if (!admin || Number(admin.is_active) !== 1) {
    throw createError({ statusCode: 403, statusMessage: 'Administrator disabled', message: '管理员不存在或已停用' });
  }
  if (Number(admin.level) !== 0) {
    throw createError({ statusCode: 403, statusMessage: 'GM access denied', message: '仅超级管理员可使用游戏运营功能' });
  }
  return admin;
};

function clientFor(server: GameServerConfig): GmInterClient {
  return new GmInterClient({
    baseUrl: String(server.webhost || process.env.GM_INTER_BASE_URL || '').trim(),
    secret: process.env.GM_INTER_SECRET || '',
    timeoutMs: Number(process.env.GM_TIMEOUT_MS || '10000'),
  });
}

async function resolveServer(identifier: unknown) {
  if (typeof identifier !== 'string' && typeof identifier !== 'number') throw invalid('请选择游戏区服');
  const value = String(identifier).trim();
  if (!value) throw invalid('请选择游戏区服');
  const server = await getByIdentifier(value);
  if (!server || Number(server.is_active) !== 1) throw invalid('游戏区服不存在或已停用');
  try {
    return { server, worldId: normalizeWorldId(server.server_id), client: clientFor(server) };
  } catch (error: any) {
    throw createError({ statusCode: 503, statusMessage: 'GM configuration required', message: error.message });
  }
}

export const getServers = async (event: H3Event) => {
  await requireGMPermission(event);
  const active = await listActive();
  let unconfiguredCount = 0;
  const data = active.flatMap(server => {
    let worldId: number;
    try { worldId = normalizeWorldId(server.server_id); } catch {
      unconfiguredCount++;
      return [];
    }
    let configurationError: string | null = null;
    try { clientFor(server); } catch (error: any) { configurationError = error.message; }
    return [{
      name: server.name,
      bname: server.bname || '',
      server_id: worldId,
      identifier: String(worldId),
      is_configured: !configurationError,
      configuration_error: configurationError,
    }];
  });
  return {
    success: true, data, unconfiguredCount,
    message: unconfiguredCount ? `有 ${unconfiguredCount} 个区服缺少明确的游戏区服 ID，请完善区服配置` : '获取游戏区服成功',
  };
};

export const getPlayers = async (event: H3Event) => {
  await requireGMPermission(event);
  const query = getQuery(event);
  let wuid: string;
  try { wuid = normalizeWuid(query.wuid); } catch (error: any) { throw invalid(error.message); }
  const { worldId, client } = await resolveServer(query.server);
  try {
    const player = await client.getPlayer(worldId, wuid);
    return { success: true, data: player ? [player] : [], message: player ? '角色查询成功' : '该区服未找到此 WUID' };
  } catch (error: any) {
    throw createError({ statusCode: 502, statusMessage: 'Game query failed', message: error.message });
  }
};

export const getItems = async (event: H3Event) => {
  await requireGMPermission(event);
  const query = getQuery(event);
  if (Array.isArray(query.search) || (query.search !== undefined && typeof query.search !== 'string')) throw invalid('物品搜索参数格式错误');
  const search = String(query.search || '').trim();
  if (search.length > 200) throw invalid('物品搜索内容最多 200 字');
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw invalid('物品搜索条数须为 1–200');
  const result = searchGmItems(search, limit);
  return { success: true, data: result.items, total: result.total };
};

function mailBody(body: any): { title: string; content: string; items: GmMailItem[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('邮件参数格式错误');
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) throw invalid('邮件标题须为 1–200 字');
  if (typeof body.content !== 'string' || !body.content.trim() || body.content.trim().length > 5000) throw invalid('邮件正文须为 1–5000 字');
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length > 6) throw invalid('邮件最多包含 6 组附件');
  const seen = new Set<number>();
  const normalized = items.map((item: any) => {
    if (!item || !Number.isSafeInteger(item.i) || item.i <= 0 || !Number.isSafeInteger(item.a) || item.a <= 0) {
      throw invalid('附件物品 ID 和数量须为正安全整数');
    }
    if (!getGmItem(item.i)) throw invalid(`物品 ${item.i} 不在当前游戏物品库中`);
    if (seen.has(item.i)) throw invalid(`物品 ${item.i} 重复，请合并数量后发送`);
    seen.add(item.i);
    return { i: item.i, a: item.a };
  });
  return { title: body.title.trim(), content: body.content.trim(), items: normalized };
}

function recipients(body: any, batch: boolean): Array<{ playerId: string; name: string }> {
  const raw = batch ? body.players : [{ playerId: body.playerId }];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw invalid('单次定向邮件须为 1–50 位玩家');
  const ids = new Set<string>();
  const targets: Array<{ playerId: string; name: string }> = [];
  for (const target of raw) {
    let id: string;
    try { id = normalizeWuid(target?.playerId); } catch (error: any) { throw invalid(error.message); }
    if (ids.has(id)) continue;
    ids.add(id);
    // Display names are annotations, never a way to resolve a different target.
    targets.push({ playerId: id, name: typeof target.name === 'string' ? target.name.slice(0, 200) : '' });
  }
  return targets;
}

async function deliver(event: H3Event, batch: boolean) {
  const admin = await requireGMPermission(event);
  const body = await readBody(event);
  const mail = mailBody(body);
  const targets = recipients(body, batch);
  const { worldId, client } = await resolveServer(body.server);
  // The Inter mail endpoint checks _id existence, but does not itself filter
  // game_user.w. Recheck the world before sending, including manually entered
  // batch targets and worlds sharing a merged database.
  const checked = new Map<string, { name?: string; failure?: GmMailResult }>();
  let nextTarget = 0;
  await Promise.all(Array.from({ length: Math.min(5, targets.length) }, async () => {
    while (nextTarget < targets.length) {
      const target = targets[nextTarget++];
      try {
        const player = await client.getPlayer(worldId, target.playerId);
        checked.set(target.playerId, player ? { name: player.name } : {
          failure: { playerId: target.playerId, success: false, status: 'failed', message: '选定区服未找到该 WUID，本次未发送' },
        });
      } catch (error: any) {
        checked.set(target.playerId, {
          failure: { playerId: target.playerId, success: false, status: 'failed', message: `角色校验失败：${error.message}；本次未发送` },
        });
      }
    }
  }));
  const validTargets = targets.filter(target => !checked.get(target.playerId)?.failure);
  const delivered = validTargets.length
    ? await client.sendMail(worldId, validTargets.map(target => target.playerId), mail.title, mail.content, mail.items)
    : [];
  const results = targets.map(target => checked.get(target.playerId)?.failure || delivered.find(result => result.playerId === target.playerId)!);
  let auditWarning = false;
  for (const result of results) {
    try {
      await insertGmOperationLog({
        op_type: mail.items.length ? 'send_items' : 'send_mail',
        server: String(worldId),
        player_id: result.playerId,
        player_name: checked.get(result.playerId)?.name || null,
        role_id: result.playerId,
        admin_id: admin.id,
        admin_name: admin.name,
        request_params: {
          protocol: 'new_gmtools',
          worldId,
          playerId: result.playerId,
          ...mail,
          item_names: Object.fromEntries(mail.items.map(item => [String(item.i), getGmItem(item.i)?.name || ''])),
          targetedBatch: batch,
        },
        response_result: { status: result.status, message: result.message },
        success: result.success ? 1 : 0,
        error_message: result.success ? null : result.message,
      });
    } catch {
      // A log write failure must not turn an acknowledged send into a failure
      // that would invite the operator to resend the same reward.
      auditWarning = true;
      console.error('[GM] 邮件操作日志写入失败，发送结果以游戏服确认信息为准');
    }
  }
  const successCount = results.filter(result => result.success).length;
  const failedCount = results.length - successCount;
  const unknownCount = results.filter(result => result.status === 'unknown').length;
  let message = failedCount ? `已确认 ${successCount} 人发送成功，${failedCount} 人失败或结果未确认` : `已确认 ${successCount} 人邮件发送成功`;
  if (unknownCount) message += '；请核对未确认玩家的游戏内邮件，勿直接重试';
  if (auditWarning) message += '；部分操作日志未能保存，请人工留存本次结果';
  return {
    success: failedCount === 0,
    data: { total: results.length, successCount, failedCount, unknownCount, results, auditWarning },
    message,
  };
}

export const sendMail = (event: H3Event) => deliver(event, false);
export const sendItems = (event: H3Event) => deliver(event, false);
export const sendItemsBatch = (event: H3Event) => deliver(event, true);
