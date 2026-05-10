import { H3Event, readBody, getQuery, createError } from 'h3';
import * as CDKModel from '../model/cdk';

// ========== 管理端：CDK 类型 ==========
export const createType = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { title, content, type, items } = body || {};
  if (!title || !content || !type || !items) {
    throw createError({ status: 400, message: '缺少必要参数' });
  }
  if (!['universal', 'unique', 'data'].includes(type)) {
    throw createError({ status: 400, message: 'type 仅支持 universal/unique/data' });
  }
  // 校验物品：数组、非空、每项包含有效 ItemId/ItemNum
  if (!Array.isArray(items) || items.length === 0) {
    throw createError({ status: 400, message: '物品列表不能为空' });
  }
  const validItems = items.filter((it: any) => Number(it?.ItemId) > 0 && Number(it?.ItemNum) > 0)
    .map((it: any) => ({ ItemId: Number(it.ItemId), ItemNum: Number(it.ItemNum) }));
  if (validItems.length === 0) {
    throw createError({ status: 400, message: '物品列表无有效条目' });
  }
  const ret = await CDKModel.createType({ title, content, type, items: validItems });
  return { code: 200, data: ret, message: '创建成功' };
};

export const updateType = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { id, ...rest } = body || {};
  if (!id) throw createError({ status: 400, message: '缺少 id' });
  // 若包含 items 字段则做严格校验
  if (rest.items !== undefined) {
    if (!Array.isArray(rest.items) || rest.items.length === 0) {
      throw createError({ status: 400, message: '物品列表不能为空' });
    }
    const validItems = rest.items.filter((it: any) => Number(it?.ItemId) > 0 && Number(it?.ItemNum) > 0)
      .map((it: any) => ({ ItemId: Number(it.ItemId), ItemNum: Number(it.ItemNum) }));
    if (validItems.length === 0) {
      throw createError({ status: 400, message: '物品列表无有效条目' });
    }
    rest.items = validItems;
  }
  const ret = await CDKModel.updateType(Number(id), rest);
  return { code: 200, data: ret, message: '更新成功' };
};

export const listTypes = async (_evt: H3Event) => {
  const rows = await CDKModel.getTypes();
  return { code: 200, data: rows, message: 'ok' };
};

// ========== 管理端：CDK 码 ==========
export const createCodes = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { cdk_type_id, count, customCodes, codeLength } = body || {};
  if (!cdk_type_id) throw createError({ status: 400, message: '缺少 cdk_type_id' });
  // data 类型不需要生成实体码
  const typeRow = await CDKModel.getTypeById(Number(cdk_type_id));
  if (!typeRow) throw createError({ status: 400, message: 'CDK类型不存在' });
  if (typeRow.type === 'data') {
    return { code: 400, message: 'data 类型无需生成码' };
  }
  const ret = await CDKModel.createCodes(Number(cdk_type_id), Number(count) || 1, customCodes, Number(codeLength) || 8);
  return { code: 200, data: ret, message: '生成成功' };
};

export const listCodes = async (evt: H3Event) => {
  const q = getQuery(evt);
  const ret = await CDKModel.listCodes({
    cdk_type_id: q.cdk_type_id ? Number(q.cdk_type_id) : undefined,
    code: q.code as string | undefined,
    is_used: q.is_used !== undefined ? Number(q.is_used) : undefined,
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  });
  return { code: 200, data: ret, message: 'ok' };
};

export const listRedemptions = async (evt: H3Event) => {
  const q = getQuery(evt);
  const ret = await CDKModel.listRedemptions({
    player_id: q.player_id as string | undefined,
    code: q.code as string | undefined,
    cdk_type_id: q.cdk_type_id ? Number(q.cdk_type_id) : undefined,
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  });
  return { code: 200, data: ret, message: 'ok' };
};

// ========== 公共端：CDK 兑换（转发到 op-admin） ==========

/**
 * CDK 兑换 —— 直接将完整请求转发到 op-admin（本地 3003 端口）
 * op-admin 负责所有业务逻辑：校验码、查玩家、GM发邮件、记录领取等
 */
const OP_ADMIN_BASE = process.env.OP_ADMIN_BASE_URL || 'http://localhost:3003';

export const redeem = async (evt: H3Event) => {
  const body = await readBody(evt);
  console.log(`[CDK][redeem][proxy] 转发请求到 op-admin`, { body });

  let result: any;
  try {
    const resp = await fetch(`${OP_ADMIN_BASE}/api/client/cdk/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    result = await resp.json();
    console.log(`[CDK][redeem][proxy] op-admin 响应`, result);
  } catch (e: any) {
    console.error(`[CDK][redeem][proxy] 请求 op-admin 失败`, e);
    throw createError({ status: 502, message: '兑换服务暂时不可用，请稍后重试' });
  }

  return result;
};


