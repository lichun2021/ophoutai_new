import { H3Event, readBody, getQuery, createError } from 'h3';
import { listAll, createServer, updateServer, removeServer } from '../model/gameServers';

export const list = async (_evt: H3Event) => {
  try {
    const rows = await listAll();
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, message: e?.message || '获取失败' };
  }
};

export const create = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { server_id, name, webhost, dbip, bname, dbuser, dbpass, is_active, count_online, allow_cdk_redeem } = body || {};
  if (!name || !webhost || !dbip || !bname || !dbuser || !dbpass) {
    throw createError({ status: 400, message: '缺少必要参数' });
  }
  try {
    const parsedServerId = server_id !== undefined && server_id !== null && String(server_id).trim() !== '' ? Number(server_id) : null;
    await createServer({
      server_id: Number.isFinite(parsedServerId as any) ? parsedServerId : null,
      name,
      webhost,
      dbip,
      bname,
      dbuser,
      dbpass,
      is_active: is_active ?? 1,
      allow_cdk_redeem: allow_cdk_redeem ?? 1,
      count_online: count_online ?? 1
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '创建失败' };
  }
};

export const update = async (evt: H3Event) => {
  const q = getQuery(evt);
  const id = Number(q.id || 0);
  if (!id) throw createError({ status: 400, message: '缺少id' });
  const body = await readBody(evt);
  try {
    const payload = body || {};
    if (payload.server_id !== undefined) {
      const raw = payload.server_id;
      const parsed = raw === '' || raw === null ? null : Number(raw);
      payload.server_id = Number.isFinite(parsed as any) ? parsed : null;
    }
    await updateServer(id, payload);
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '更新失败' };
  }
};

export const remove = async (evt: H3Event) => {
  const q = getQuery(evt);
  const id = Number(q.id || 0);
  if (!id) throw createError({ status: 400, message: '缺少id' });
  try {
    await removeServer(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || '删除失败' };
  }
};


