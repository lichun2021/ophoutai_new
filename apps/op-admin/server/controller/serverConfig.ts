import { H3Event, readBody, getQuery, createError } from 'h3';
import { listAll, createServer, updateServer, removeServer } from '../model/gameServers';
import { requireGMPermission } from './gm';
import { buildServerlist, normalizeServerlistConfig, writeServerlist } from '../utils/serverlist';

const worldId = (value: unknown): number => {
  const raw = String(value ?? '').trim();
  const parsed = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(parsed) || parsed > 2147483647) {
    throw createError({ statusCode: 400, message: '请填写有效的游戏区服ID' });
  }
  return parsed;
};

const interfaceUrl = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    const result = url.toString().replace(/\/$/, '');
    if (result.length > 255) throw new Error();
    return result;
  } catch {
    throw createError({ statusCode: 400, message: '运营接口地址需为 http://主机:端口 或 https://域名，不含账号或具体路径' });
  }
};

const flag = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback;
  if (value === 0 || value === '0' || value === false) return 0;
  if (value === 1 || value === '1' || value === true) return 1;
  throw createError({ statusCode: 400, message: '状态值只能为0或1' });
};

const serverName = (value: unknown): string => {
  const name = String(value ?? '').trim();
  if (!name || name.length > 100) throw createError({ statusCode: 400, message: '区服名称不能为空且最多100个字符' });
  return name;
};

const clientListConfig = (value: unknown) => {
  try {
    return normalizeServerlistConfig(value);
  } catch (error: any) {
    throw createError({ statusCode: 400, message: error?.message || '客户端服务器列表配置无效' });
  }
};

export const list = async (evt: H3Event) => {
  await requireGMPermission(evt);
  try {
    const rows = await listAll();
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, message: e?.message || '获取失败' };
  }
};

export const create = async (evt: H3Event) => {
  await requireGMPermission(evt);
  const body = await readBody(evt);
  const { server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, count_online, allow_cdk_redeem, serverlist_config } = body || {};
  const parsedServerId = worldId(server_id);
  const parsedName = serverName(name);
  const parsedWebhost = interfaceUrl(webhost);
  const active = flag(is_active, 1);
  const cdk = flag(allow_cdk_redeem, 0);
  const online = flag(count_online, 0);
  const clientConfig = serverlist_config == null ? null : clientListConfig(serverlist_config);
  try {
    await createServer({
      server_id: parsedServerId,
      name: parsedName,
      webhost: parsedWebhost,
      dbip: String(dbip ?? ''),
      bname: String(bname ?? ''),
      dbuser: String(dbuser ?? ''),
      dbpass: String(dbpass ?? ''),
      serverlist_config: clientConfig,
      is_active: active,
      allow_cdk_redeem: cdk,
      count_online: online
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '创建失败' };
  }
};

export const update = async (evt: H3Event) => {
  await requireGMPermission(evt);
  const q = getQuery(evt);
  const id = worldId(q.id);
  const body = await readBody(evt);
  const payload = { ...(body || {}) };
  if (payload.server_id !== undefined) payload.server_id = worldId(payload.server_id);
  if (payload.name !== undefined) payload.name = serverName(payload.name);
  if (payload.webhost !== undefined) payload.webhost = interfaceUrl(payload.webhost);
  if (payload.is_active !== undefined) payload.is_active = flag(payload.is_active, 1);
  if (payload.allow_cdk_redeem !== undefined) payload.allow_cdk_redeem = flag(payload.allow_cdk_redeem, 0);
  if (payload.count_online !== undefined) payload.count_online = flag(payload.count_online, 0);
  if (payload.serverlist_config !== undefined) payload.serverlist_config = payload.serverlist_config === null ? null : clientListConfig(payload.serverlist_config);
  try {
    await updateServer(id, payload);
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '更新失败' };
  }
};

export const remove = async (evt: H3Event) => {
  await requireGMPermission(evt);
  const q = getQuery(evt);
  const id = worldId(q.id);
  try {
    await removeServer(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '删除失败' };
  }
};

export const generateServerlist = async (evt: H3Event) => {
  await requireGMPermission(evt);
  try {
    // Only saved server records are used. Request-provided paths or rows are ignored.
    const rows = await listAll();
    const payload = buildServerlist(rows);
    const result = await writeServerlist(payload);
    return { success: true, ...result, message: `已生成 /data/serverlist，共 ${result.count} 个区服` };
  } catch (error: any) {
    if (typeof error?.code === 'string') {
      const message = error.code.startsWith('ER_')
        ? '读取服务器列表配置失败，请确认已执行 serverlist_config 字段迁移'
        : '无法写入 /data/serverlist，请检查目录权限后重试';
      return { success: false, message };
    }
    return { success: false, message: error?.message || '生成服务器列表失败' };
  }
};


