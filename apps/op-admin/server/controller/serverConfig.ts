import { H3Event, readBody, getQuery, createError } from 'h3';
import { listAll, getById, createServer, updateServer, removeServer } from '../model/gameServers';
import { requireGMPermission } from './gm';
import { publishOpServerConfig } from '../utils/opServerConfigPublish';
import { applyWorldConfigFields, normalizeOpWorldConfig, normalizeServerlistConfig, toWorldConfigFields, WORLD_CONFIG_FIELDS } from '../utils/serverlist';

const WORLD_CONFIG_INPUT_FIELDS = [...WORLD_CONFIG_FIELDS, 'wssurl', 'wss'];

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

const worldFieldsConfig = (base: unknown, input: Record<string, unknown>) => {
  try {
    return applyWorldConfigFields(base, input);
  } catch (error) {
    throw createError({ statusCode: 400, message: error instanceof Error ? error.message : '区服配置无效' });
  }
};

const listWorldFields = (value: unknown) => {
  try {
    return toWorldConfigFields(value);
  } catch {
    return toWorldConfigFields(null);
  }
};

export const list = async (evt: H3Event) => {
  await requireGMPermission(evt);
  try {
    const rows = await listAll();
    return {
      success: true,
      data: rows.map(row => {
        const stored = row.serverlist_config;
        const fields = listWorldFields(stored);
        const wssurl = fields.wsurl;
        return {
          ...row,
          _id: row.server_id ?? null,
          n: row.name,
          serverlist_config: wssurl !== undefined && stored && typeof stored === 'object'
            ? { ...stored, wssurl, wsurl: wssurl }
            : stored,
          ...fields,
          wssurl,
        };
      }),
    };
  } catch (e: any) {
    return { success: false, message: e?.message || '获取失败' };
  }
};

export const create = async (evt: H3Event) => {
  await requireGMPermission(evt);
  const body = (await readBody(evt)) || {};
  const { server_id = body._id, name = body.n, webhost, dbip, bname, dbuser, dbpass, is_active, count_online, allow_cdk_redeem, serverlist_config } = body;
  const parsedServerId = worldId(server_id);
  const parsedName = serverName(name);
  const parsedWebhost = interfaceUrl(webhost);
  const active = flag(is_active, 1);
  const cdk = flag(allow_cdk_redeem, 0);
  const online = flag(count_online, 0);
  const clientConfig = WORLD_CONFIG_INPUT_FIELDS.some(field => Object.hasOwn(body, field))
    ? worldFieldsConfig(serverlist_config, body)
    : serverlist_config == null ? null : clientListConfig(serverlist_config);
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
  const body = (await readBody(evt)) || {};
  const { _id, n, ...payload } = body;
  if (payload.server_id === undefined && _id !== undefined) payload.server_id = _id;
  if (payload.name === undefined && n !== undefined) payload.name = n;
  if (payload.server_id !== undefined) payload.server_id = worldId(payload.server_id);
  if (payload.name !== undefined) payload.name = serverName(payload.name);
  if (payload.webhost !== undefined) payload.webhost = interfaceUrl(payload.webhost);
  if (payload.is_active !== undefined) payload.is_active = flag(payload.is_active, 1);
  if (payload.allow_cdk_redeem !== undefined) payload.allow_cdk_redeem = flag(payload.allow_cdk_redeem, 0);
  if (payload.count_online !== undefined) payload.count_online = flag(payload.count_online, 0);
  try {
    if (WORLD_CONFIG_INPUT_FIELDS.some(field => Object.hasOwn(body, field))) {
      let config = payload.serverlist_config;
      if (config === undefined) {
        const row = await getById(id);
        if (!row) throw createError({ statusCode: 404, message: '区服不存在' });
        config = row.serverlist_config;
      }
      payload.serverlist_config = worldFieldsConfig(config, body);
      for (const field of WORLD_CONFIG_INPUT_FIELDS) delete payload[field];
    } else if (payload.serverlist_config != null) {
      payload.serverlist_config = clientListConfig(payload.serverlist_config);
    }
    await updateServer(id, payload);
    return { success: true };
  } catch (e: any) {
    if (e?.statusCode === 400 || e?.statusCode === 404) throw e;
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

export const publish = async (evt: H3Event) => {
  await requireGMPermission(evt);
  const body = await readBody(evt);
  const id = worldId(body?.id);
  const expectedServerId = worldId(body?.expectedServerId);
  const row = await getById(id);
  if (!row) throw createError({ statusCode: 404, message: '区服不存在' });
  if (row.server_id !== expectedServerId) {
    throw createError({ statusCode: 409, message: '游戏区服 ID 已变更，请刷新列表后重新发布' });
  }
  let config;
  try {
    config = normalizeOpWorldConfig({ _id: row.server_id, n: row.name, ...toWorldConfigFields(row.serverlist_config) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '字段无效';
    throw createError({ statusCode: 400, message: `请完善并保存区服配置，${message}` });
  }
  await publishOpServerConfig(config);
  return { success: true, id, server_id: config._id, message: `已向 OP 发布区服 ${config._id}` };
};

