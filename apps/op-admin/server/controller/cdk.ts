import { H3Event, readBody, getQuery, createError } from 'h3';
import * as CDKModel from '../model/cdk';
import { getChinaTime } from '../utils/timezone';
import { createGameServerClient } from './gameServerClient';
import { getByIdentifier as getGameServerByIdentifier } from '../model/gameServers';
import { getRedisCluster } from '../utils/redis-cluster';

// ===== Redis 分布式锁 =====
// 用于防止同一玩家并发重复兑换 CDK
// lockKey: cdk:lock:{playerId}:{typeId_or_todayCode}
// TTL: 30 秒（足够一次发奖流程完成）

const CDK_LOCK_TTL = 30; // 秒

/**
 * 尝试获取 CDK 兑换分布式锁
 * @returns lockValue（成功）| null（锁已被占用 → 重复请求）
 */
const acquireCdkLock = async (lockKey: string): Promise<string | null> => {
  try {
    const redis = getRedisCluster();
    const lockValue = `${Date.now()}_${Math.random()}`;
    // SET key value NX EX ttl — 原子操作，成功返回 "OK"，已存在返回 null
    const result = await (redis as any).set(lockKey, lockValue, 'EX', CDK_LOCK_TTL, 'NX');
    return result === 'OK' ? lockValue : null;
  } catch (e) {
    // Redis 不可用时降级：打日志但不阻断流程
    // 此时依赖 DB 唯一索引兜底（会有 Duplicate entry 日志，但不会多发奖励）
    console.warn('[CDK][lock] Redis 不可用，降级到 DB 唯一索引兜底:', e);
    return 'fallback'; // 降级标记，后续正常走 DB 检查
  }
};

/**
 * 释放锁（比较并删除，防止误删其他请求的锁）
 */
const releaseCdkLock = async (lockKey: string, lockValue: string): Promise<void> => {
  if (lockValue === 'fallback') return; // 降级模式无需释放
  try {
    const redis = getRedisCluster();
    // Lua 脚本保证原子性：只有 value 匹配时才删除
    const script = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
    await (redis as any).eval(script, 1, lockKey, lockValue);
  } catch (e) {
    console.warn('[CDK][lock] 释放锁失败（可等待自然过期）:', e);
  }
};

// 根据区服动态创建 GameServerClient
const createClientForServer = async (identifier: string) => {
  const cfg = await getGameServerByIdentifier(identifier).catch(() => null);
  const webhost = (cfg?.webhost || process.env.GM_BASE_URL || '').replace(/\/+$/, '');
  const timeoutMs = parseInt(process.env.GM_TIMEOUT_MS || '10000');
  return createGameServerClient(webhost, 'rest', timeoutMs);
};

// 根据 server 参数解析 GameServers 配置
const getServerConfigByInput = async (server: string) => {
  const cfg = await getGameServerByIdentifier(server).catch(() => null);
  if (!cfg || cfg.is_active === 0) {
    throw createError({ status: 400, message: `未找到或未启用的游戏服务器配置: ${server}` });
  }
  return cfg;
};

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

// ========== 公共端：CDK 兑换 ==========
// 不再查游戏 DB，直接用 playerId 作为 roleId 调用游戏服 /open_api/mail/send-with-items
// 游戏服通过 roleId 定位玩家并发放邮件（与发送道具邮件逻辑一致）

export const redeem = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { server, playerId, code } = body || {};
  console.log(`[CDK][redeem] 入参`, { server, playerId, code });
  if (!server || !playerId || !code) {
    throw createError({ status: 400, message: '缺少参数：server/playerId/code' });
  }
  const serverCfg = await getServerConfigByInput(String(server));
  const serverId = String(serverCfg.server_id ?? serverCfg.bname).replace('game_', '');

  // 辅助：调用游戏服发放物资邮件（不依赖 gameDb）
  const doSendMail = async (cdkType: any) => {
    const client = await createClientForServer(String(server));
    await client.sendItemMail({
      openId: String(playerId),   // 游戏服通过 roleId 定位玩家，openId 同 roleId
      serverId,
      platform: 'android',        // 不查 gameDb，平台由游戏服按 roleId 自行判断
      roleId: String(playerId),
      mailTitle: cdkType.title,
      mailContent: cdkType.content,
      items: cdkType.items.map((i: any) => ({ itemId: Number(i.ItemId), itemCount: Number(i.ItemNum) })),
    });
  };

  // ===== data 类型：每日验证码（YYYYMMDD 东8区）=====
  {
    const now = getChinaTime();
    const todayCode = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    console.log(`[CDK][redeem][data] 计算todayCode=${todayCode}, 提交code=${code}`);
    if (String(code) === todayCode) {
      const cdkType = await CDKModel.getLatestTypeByType('data');
      if (!cdkType) {
        console.log(`[CDK][redeem][data] 未找到 data 类型配置`);
        return { code: 400, message: '未配置 data 类型' };
      }

      const typeId = (cdkType as any).id as number;

      // ===== 【防并发】Redis 分布式锁 =====
      const lockKey = `cdk:lock:${playerId}:data:${todayCode}`;
      const lockValue = await acquireCdkLock(lockKey);
      if (lockValue === null) {
        console.warn(`[CDK][redeem][data] 并发拦截 playerId=${playerId} todayCode=${todayCode}`);
        return { code: 400, message: '今日已领取，无法重复领取' };
      }

      try {
        // 二次 DB 检查（锁内执行，彻底防并发）
        const alreadyToday = await CDKModel.hasRedeemedByTypeAndCode(playerId, typeId, String(todayCode));
        console.log(`[CDK][redeem][data] 幂等检查`, { playerId, typeId, todayCode, alreadyToday });
        if (alreadyToday) {
          return { code: 400, message: '今日已领取，无法重复领取' };
        }

        await doSendMail(cdkType);

        await CDKModel.insertRedemption({
          player_id: playerId,
          server: serverCfg.bname,
          code: String(code),
          cdk_type_id: typeId,
          open_id: String(playerId),
          platform: 'android',
        });

        console.log(`[CDK][redeem][data] 发放成功`);
        return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
      } catch (e: any) {
        console.error(`[CDK][redeem][data] 发放失败`, { server, playerId, code: String(code) }, e);
        throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
      } finally {
        // 成功写库后才释放锁，确保并发请求被锁住直到 DB 有记录
        await releaseCdkLock(lockKey, lockValue);
      }
    }
  }

  // ===== universal / unique 类型 =====

  // 1) 校验码是否存在
  const codeRow = await CDKModel.getCode(code);
  if (!codeRow) {
    return { code: 400, message: 'CDK不存在或无效' };
  }

  // 2) 读取类型
  const cdkType = await CDKModel.getTypeById(codeRow.cdk_type_id);
  if (!cdkType) {
    return { code: 400, message: 'CDK类型不存在' };
  }

  // ===== 【防并发】Redis 分布式锁 =====
  // lockKey 粒度：玩家 + 实际提交的 code
  // 同一玩家重复提交同一个 CDK 码时，只有第一个请求能拿到锁进入发奖流程
  // unique 码：锁住 playerId+code，防止同一码被同一人并发兑换多次
  // universal 码：同一玩家同一个码也只允许走一次，避免短时间内重复领取同类型奖励
  const lockKey = `cdk:lock:${playerId}:code:${code}`;
  const lockValue = await acquireCdkLock(lockKey);
  if (lockValue === null) {
    console.warn(`[CDK][redeem] 并发拦截 playerId=${playerId} code=${code}`);
    return { code: 400, message: '请勿重复提交，稍后再试' };
  }

  try {
    // 3) 幂等校验（锁内二次检查）：同一类型每个角色只能领一次
    const already = await CDKModel.hasRedeemed(playerId, codeRow.cdk_type_id);
    if (already) {
      return { code: 400, message: '该类型已领取，无法重复领取' };
    }

    // 4) 唯一码：校验是否已被使用
    if (cdkType.type === 'unique' && codeRow.is_used) {
      return { code: 400, message: '该CDK已被使用' };
    }

    // 5) 调用游戏服发放物资
    try {
      await doSendMail(cdkType);
    } catch (e: any) {
      throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
    }

    // 6) 记录 & 标记
    await CDKModel.insertRedemption({
      player_id: playerId,
      server: serverCfg.bname,
      code,
      cdk_type_id: codeRow.cdk_type_id,
      open_id: String(playerId),
      platform: 'android',
    });

    if (cdkType.type === 'unique') {
      await CDKModel.markCodeUsed(code, playerId);
    }

    return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
  } finally {
    // 成功写库后才释放锁
    await releaseCdkLock(lockKey, lockValue);
  }
};


// 根据区服动态创建 GameServerClient
const createClientForServer = async (identifier: string) => {
  const cfg = await getGameServerByIdentifier(identifier).catch(() => null);
  const webhost = (cfg?.webhost || process.env.GM_BASE_URL || '').replace(/\/+$/, '');
  const timeoutMs = parseInt(process.env.GM_TIMEOUT_MS || '10000');
  return createGameServerClient(webhost, 'rest', timeoutMs);
};

// 根据 server 参数解析 GameServers 配置
const getServerConfigByInput = async (server: string) => {
  const cfg = await getGameServerByIdentifier(server).catch(() => null);
  if (!cfg || cfg.is_active === 0) {
    throw createError({ status: 400, message: `未找到或未启用的游戏服务器配置: ${server}` });
  }
  return cfg;
};

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

// ========== 公共端：CDK 兑换 ==========
// 不再查游戏 DB，直接用 playerId 作为 roleId 调用游戏服 /open_api/mail/send-with-items
// 游戏服通过 roleId 定位玩家并发放邮件（与发送道具邮件逻辑一致）

export const redeem = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { server, playerId, code } = body || {};
  console.log(`[CDK][redeem] 入参`, { server, playerId, code });
  if (!server || !playerId || !code) {
    throw createError({ status: 400, message: '缺少参数：server/playerId/code' });
  }
  const serverCfg = await getServerConfigByInput(String(server));
  const serverId = String(serverCfg.server_id ?? serverCfg.bname).replace('game_', '');

  // 辅助：调用游戏服发放物资邮件（不依赖 gameDb）
  const doSendMail = async (cdkType: any) => {
    const client = await createClientForServer(String(server));
    await client.sendItemMail({
      openId: String(playerId),   // 游戏服通过 roleId 定位玩家，openId 同 roleId
      serverId,
      platform: 'android',        // 不查 gameDb，平台由游戏服按 roleId 自行判断
      roleId: String(playerId),
      mailTitle: cdkType.title,
      mailContent: cdkType.content,
      items: cdkType.items.map((i: any) => ({ itemId: Number(i.ItemId), itemCount: Number(i.ItemNum) })),
    });
  };

  // ===== data 类型：每日验证码（YYYYMMDD 东8区）=====
  {
    const now = getChinaTime();
    const todayCode = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    console.log(`[CDK][redeem][data] 计算todayCode=${todayCode}, 提交code=${code}`);
    if (String(code) === todayCode) {
      const cdkType = await CDKModel.getLatestTypeByType('data');
      if (!cdkType) {
        console.log(`[CDK][redeem][data] 未找到 data 类型配置`);
        return { code: 400, message: '未配置 data 类型' };
      }

      const typeId = (cdkType as any).id as number;
      const alreadyToday = await CDKModel.hasRedeemedByTypeAndCode(playerId, typeId, String(todayCode));
      console.log(`[CDK][redeem][data] 幂等检查`, { playerId, typeId, todayCode, alreadyToday });
      if (alreadyToday) {
        return { code: 400, message: '今日已领取，无法重复领取' };
      }

      try {
        await doSendMail(cdkType);
      } catch (e: any) {
        console.error(`[CDK][redeem][data] 发放失败`, { server, playerId, code: String(code) }, e);
        throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
      }

      await CDKModel.insertRedemption({
        player_id: playerId,
        server: serverCfg.bname,
        code: String(code),
        cdk_type_id: typeId,
        open_id: String(playerId),
        platform: 'android',
      });

      console.log(`[CDK][redeem][data] 发放成功`);
      return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
    }
  }

  // ===== universal / unique 类型 =====

  // 1) 校验码是否存在
  const codeRow = await CDKModel.getCode(code);
  if (!codeRow) {
    return { code: 400, message: 'CDK不存在或无效' };
  }

  // 2) 读取类型
  const cdkType = await CDKModel.getTypeById(codeRow.cdk_type_id);
  if (!cdkType) {
    return { code: 400, message: 'CDK类型不存在' };
  }

  // 3) 幂等校验：同一类型每个角色只能领一次
  const already = await CDKModel.hasRedeemed(playerId, codeRow.cdk_type_id);
  if (already) {
    return { code: 400, message: '该类型已领取，无法重复领取' };
  }

  // 4) 唯一码：校验是否已被使用
  if (cdkType.type === 'unique' && codeRow.is_used) {
    return { code: 400, message: '该CDK已被使用' };
  }

  // 5) 调用游戏服发放物资
  try {
    await doSendMail(cdkType);
  } catch (e: any) {
    throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
  }

  // 6) 记录 & 标记
  await CDKModel.insertRedemption({
    player_id: playerId,
    server: serverCfg.bname,
    code,
    cdk_type_id: codeRow.cdk_type_id,
    open_id: String(playerId),
    platform: 'android',
  });

  if (cdkType.type === 'unique') {
    await CDKModel.markCodeUsed(code, playerId);
  }

  return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
};


