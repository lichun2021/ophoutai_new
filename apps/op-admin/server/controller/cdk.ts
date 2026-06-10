import { H3Event, readBody, getQuery, createError } from 'h3';
import { gameDbSql } from '../db/gameDb';
import * as CDKModel from '../model/cdk';
import { getChinaTime } from '../utils/timezone';
import { IdipClient } from './gmport';
import { getByIdentifier as getGameServerByIdentifier } from '../model/gameServers';
import { getRedisCluster } from '../utils/redis-cluster';

// ===== Redis 分布式锁 =====
// 防止同一玩家并发重复提交同一个 CDK 码
// TTL: 30 秒（足够一次发奖流程完成）
const CDK_LOCK_TTL = 30;

/**
 * 尝试获取 CDK 兑换分布式锁
 * 使用 SET NX EX 原子命令：
 *   - 成功（key 不存在）→ 返回 lockValue
 *   - 失败（key 已存在）→ 返回 null（并发重复请求）
 * Redis 不可用时降级，返回 'fallback'，依赖 DB 唯一索引兜底
 */
const acquireCdkLock = async (lockKey: string): Promise<string | null> => {
  try {
    const redis = getRedisCluster();
    const lockValue = `${Date.now()}_${Math.random()}`;
    const result = await (redis as any).set(lockKey, lockValue, 'EX', CDK_LOCK_TTL, 'NX');
    return result === 'OK' ? lockValue : null;
  } catch (e) {
    console.warn('[CDK][lock] Redis 不可用，降级到 DB 唯一索引兜底:', e);
    return 'fallback';
  }
};

/**
 * 释放锁（Lua 原子比较并删除，防止误删其他请求的锁）
 */
const releaseCdkLock = async (lockKey: string, lockValue: string): Promise<void> => {
  if (lockValue === 'fallback') return;
  try {
    const redis = getRedisCluster();
    const script = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
    await (redis as any).eval(script, 1, lockKey, lockValue);
  } catch (e) {
    console.warn('[CDK][lock] 释放锁失败（可等待自然过期）:', e);
  }
};

// 按区服动态创建 IdipClient（优先使用 GameServers.webhost）
const createIdipClientForServer = async (identifier: string): Promise<IdipClient> => {
  const cfg = await getGameServerByIdentifier(identifier).catch(() => null);
  const rawBase = (cfg?.webhost || process.env.GM_BASE_URL || '').replace(/\/+$/, '');
  const baseURL = rawBase.includes('/script') ? rawBase : `${rawBase}/script`;
  const timeoutMs = parseInt(process.env.GM_TIMEOUT_MS || '10000');
  return new IdipClient({ baseURL, directMode: true, timeoutMs });
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
type PlayerInfo = { openid: string; platform: number | string };

async function getPlayerInfo(server: string, playerId: string): Promise<PlayerInfo | null> {
  // 1) 按 id（字符串）查
  const rowsById = await gameDbSql({
    query: `SELECT openid, platform FROM player WHERE id = ? LIMIT 1`,
    values: [playerId],
    database: server,
  }) as any[];
  if (rowsById.length > 0) return { openid: rowsById[0].openid, platform: rowsById[0].platform };

  // 2) 退化到 puid 查
  const rowsByName = await gameDbSql({
    query: `SELECT openid, platform FROM player WHERE name = ? LIMIT 1`,
    values: [playerId],
    database: server,
  }) as any[];
  if (rowsByName.length > 0) return { openid: rowsByName[0].openid, platform: rowsByName[0].platform };

  // 尝试按 openid 直查
  const rowsByOpen = await gameDbSql({
    query: `SELECT openid, platform FROM player WHERE openid = ? LIMIT 1`,
    values: [playerId],
    database: server,
  }) as any[];
  if (rowsByOpen.length > 0) return { openid: rowsByOpen[0].openid, platform: rowsByOpen[0].platform };

  return null;
}

export const redeem = async (evt: H3Event) => {
  const body = await readBody(evt);
  const { server, playerId, code } = body || {};
  if (!server || !playerId || !code) {
    throw createError({ status: 400, message: '缺少参数：server/playerId/code' });
  }
  const serverCfg = await getServerConfigByInput(String(server));

  // 特殊类型 data：每日验证码为当日 YYYYMMDD（东8区）
  {
    const now = getChinaTime();
    const todayCode = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    if (String(code) === todayCode) {
      const cdkType = await CDKModel.getLatestTypeByType('data');
      if (!cdkType) {
        return { code: 400, message: '未配置 data 类型' };
      }

      const typeId = (cdkType as any).id as number;

      // ===== 【防并发】Redis 分布式锁 =====
      // lockKey = playerId + 实际提交的 code（今日日期码）
      const lockKey = `cdk:lock:${playerId}:code:${todayCode}`;
      const lockValue = await acquireCdkLock(lockKey);
      if (lockValue === null) {
        console.warn(`[CDK][redeem][data] 并发拦截 playerId=${playerId} todayCode=${todayCode}`);
        return { code: 400, message: '今日已领取，无法重复领取' };
      }

      try {
        // 锁内二次 DB 检查（幂等）
        const alreadyToday = await CDKModel.hasRedeemedByTypeAndCode(playerId, typeId, String(todayCode));
        if (alreadyToday) {
          return { code: 400, message: '今日已领取，无法重复领取' };
        }

        // 查询玩家信息
        const player = await getPlayerInfo(serverCfg.bname, playerId);
        if (!player) {
          return { code: 404, message: '未找到玩家信息' };
        }
        const platform = player.platform;

        // 发放物资
        const idipClient = await createIdipClientForServer(String(server));
        const partition = String(serverCfg.server_id ?? serverCfg.bname).replace('game_', '');
        let platId: 1 | 2 = 1;
        if (typeof platform === 'string') {
          platId = platform.toLowerCase() === 'ios' ? 2 : 1;
        } else {
          platId = Number(platform) === 2 ? 2 : 1;
        }
        try {
          await idipClient.sendItems({
            partition,
            platId,
            openId: player.openid,
            roleId: playerId,
            title: cdkType.title,
            content: cdkType.content,
            items: cdkType.items,
          });
        } catch (e: any) {
          console.error(`[CDK][redeem][data] 发放失败`, { server, playerId, code: String(code) }, e);
          throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
        }

        // 记录领取（不涉及唯一码占用）
        await CDKModel.insertRedemption({
          player_id: playerId,
          server: serverCfg.bname,
          code: String(code),
          cdk_type_id: typeId,
          open_id: player.openid,
          platform,
        });

        return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
      } finally {
        await releaseCdkLock(lockKey, lockValue);
      }
    }
  }

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
  // lockKey = playerId + 实际提交的 CDK 码
  // 同一玩家并发提交同一个 code 只有第一个请求能进入发奖流程
  const lockKey = `cdk:lock:${playerId}:code:${code}`;
  const lockValue = await acquireCdkLock(lockKey);
  if (lockValue === null) {
    console.warn(`[CDK][redeem] 并发拦截 playerId=${playerId} code=${code}`);
    return { code: 400, message: '请勿重复提交，稍后再试' };
  }

  try {
    // 3) 锁内幂等校验：同一类型每个角色只能领一次
    const already = await CDKModel.hasRedeemed(playerId, codeRow.cdk_type_id);
    if (already) {
      return { code: 400, message: '该类型已领取，无法重复领取' };
    }

    // 4) 对于唯一码，校验是否已使用
    if (cdkType.type === 'unique' && codeRow.is_used) {
      return { code: 400, message: '该CDK已被使用' };
    }

    // 5) 查询玩家 openid/platform
    const player = await getPlayerInfo(serverCfg.bname, playerId);
    if (!player) {
      return { code: 404, message: '未找到玩家信息' };
    }

    const platform = player.platform;

    // 6) 调用 GM 发放物资
    try {
      const idipClient = await createIdipClientForServer(String(server));
      const partition = String(serverCfg.server_id ?? serverCfg.bname).replace('game_', '');
      let platId: 1 | 2 = 1;
      if (typeof platform === 'string') {
        platId = platform.toLowerCase() === 'ios' ? 2 : 1;
      } else {
        platId = Number(platform) === 2 ? 2 : 1;
      }
      await idipClient.sendItems({
        partition,
        platId,
        openId: player.openid,
        roleId: playerId,
        title: cdkType.title,
        content: cdkType.content,
        items: cdkType.items,
      });
    } catch (e: any) {
      throw createError({ status: 500, message: '发放失败: ' + (e?.message || 'GM接口错误') });
    }

    // 7) 记录 & 标记
    await CDKModel.insertRedemption({
      player_id: playerId,
      server: serverCfg.bname,
      code,
      cdk_type_id: codeRow.cdk_type_id,
      open_id: player.openid,
      platform: platform,
    });

    if (cdkType.type === 'unique') {
      await CDKModel.markCodeUsed(code, playerId);
    }

    return { code: 200, message: '领取成功，奖励已通过游戏内邮件发放' };
  } finally {
    await releaseCdkLock(lockKey, lockValue);
  }
};
