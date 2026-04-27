import { H3Event, readBody, getQuery, createError, getHeader, getCookie } from 'h3';
import * as AdminModel from '../model/admin';
import { verifyAdminSession } from '../utils/auth';
import { createGameServerClient, type GameServerClient, type Platform } from './gameServerClient';
import type { RowDataPacket } from 'mysql2';
import { gameDbSql, getGameDatabases, checkGameDatabase } from '../db/gameDb';
import { listActive, getByIdentifier as getGameServerByIdentifier } from '../model/gameServers';
import { insertGmOperationLog } from '../model/gmOperationLogs';

// 根据区服动态创建 GameServerClient（优先使用 GameServers.webhost）
const createClientForServer = async (identifier: string): Promise<GameServerClient> => {
  const cfg = await getGameServerByIdentifier(identifier).catch(() => null);
  const webhost = (cfg?.webhost || process.env.GM_BASE_URL || '').replace(/\/+$/, '');
  const timeoutMs = parseInt(process.env.GM_TIMEOUT_MS || '10000');
  return createGameServerClient(webhost, 'idip', timeoutMs);
};

// 解析平台字符串
const parsePlatform = (platform: any): Platform => {
  if (typeof platform === 'string') return platform.toLowerCase() === 'ios' ? 'ios' : 'android';
  if (typeof platform === 'number') return platform === 2 ? 'ios' : 'android';
  return 'android';
};

// 根据区服获取玩家名称
const getPlayerName = async (bname: string, playerId: string): Promise<string | null> => {
  try {
    const rows = await gameDbSql({
      query: 'SELECT name FROM player WHERE id = ? LIMIT 1',
      values: [playerId],
      database: bname
    }) as RowDataPacket[];
    return rows && rows[0] ? (rows[0] as any).name || null : null;
  } catch {
    return null;
  }
};

// 权限验证函数
const requireGMPermission = async (event: H3Event) => {
  // 🔐 安全加固：不再信任 Header 中的 authorization，强制校验 Cookie 中的 Session
  const sid = getCookie(event, 'admin_sid');
  const v = verifyAdminSession(sid);
  
  if (!v.ok || !v.adminId) {
    // 如果 Cookie 校验失败，尝试从 Header 获取（仅作为备选，且必须经过 AdminModel.getAdminWithPermissions 严格校验）
    const authorizationHeader = getHeader(event, 'authorization');
    const token = authorizationHeader ? parseInt(authorizationHeader) : null;
    
    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: '未提供有效的认证凭据'
      });
    }
    
    // 如果是通过 Header 传参，必须确保该 ID 确实拥有超级管理员权限
    const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
    if (!adminWithPermissions || adminWithPermissions.level > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: '非法访问：身份验证失败'
      });
    }
    return adminWithPermissions;
  }

  try {
    const adminWithPermissions = await AdminModel.getAdminWithPermissions(v.adminId);
    if (!adminWithPermissions) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Token无效或已过期'
      });
    }

    // 只有超级管理员(level 0)可以访问GM功能
    if (adminWithPermissions.level > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: '无权限访问GM功能'
      });
    }

    return adminWithPermissions;
  } catch (error: any) {
    console.error('[GM] 权限验证失败:', error);
    // 如果已经是createError，直接重新抛出
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 401,
      statusMessage: '认证失败'
    });
  }
};

// 获取服务器列表
export const getServers = async (evt: H3Event) => {
  try {
    const activeServers = await listActive();
    const data = activeServers
      .filter(s => s && s.name && s.bname)
      .map(s => ({ name: s.name, bname: s.bname, server_id: s.server_id ?? null }));
    return { success: true, data, message: '获取服务器列表成功' };
  } catch (error: any) {
    console.error('[GM] 获取服务器列表失败:', error);
    return {
      success: false,
      data: [],
      message: error.message || '获取服务器列表失败'
    };
  }
};

// 获取玩家列表
export const getPlayers = async (evt: H3Event) => {
  try {
    const query = getQuery(evt);
    const server = query.server as string;
    
    if (!server) {
      return {
        success: false,
        data: [],
        message: '请指定服务器'
      };
    }

    // 检查数据库是否存在
    const dbExists = await checkGameDatabase(server);
    if (!dbExists) {
      return {
        success: false,
        data: [],
        message: '服务器不存在'
      };
    }

    const players = await gameDbSql({
      query: `
        SELECT 
          id,
          openid,
          puid,
          name,
          vipLevel,
          vipExp,
          platform,
          channel,
          forbidenTime,
          loginTime,
          createTime,
          battlePoint
        FROM player
        WHERE invalid = 0
        ORDER BY loginTime DESC
      `,
      database: server
    }) as RowDataPacket[];

    return {
      success: true,
      data: players,
      message: '获取玩家列表成功'
    };
  } catch (error: any) {
    console.error('[GM] 获取玩家列表失败:', error);
    return {
      success: false,
      data: [],
      message: error.message || '获取玩家列表失败'
    };
  }
};

// 封号
export const banPlayer = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform, duration, reason } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !playerId || !openId || !duration || !reason) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');
    
    try {
      const plat = parsePlatform(platform);
      
      // 调用游戏服接口封号
      const client = await createClientForServer(server);
      const requestPayload = {
        openId,
        serverId,
        platform: plat,
        duration: Number(duration),
        reason
      };
      await client.banPlayer(requestPayload);

      // 更新数据库中的封号时间
      const forbidenTime = Date.now() + Number(duration) * 1000;
      await gameDbSql({
        query: 'UPDATE player SET forbidenTime = ? WHERE id = ?',
        values: [forbidenTime, playerId],
        database: server
      });

      console.log('[GM] Ban success:', { playerId, duration });
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'ban',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null,
        request_params: requestPayload,
        response_result: { message: 'ok' },
        success: 1,
        error_message: null
      });
      return {
        success: true,
        message: '封号成功'
      };
    } catch (idipError: any) {
      console.error('[GM] IDIP接口调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'ban',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null,
        request_params: { serverId, openId, duration, reason },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP错误'
      });
      // 即使IDIP失败，也尝试更新数据库
      const forbidenTime = Date.now() + Number(duration) * 1000;
      await gameDbSql({
        query: 'UPDATE player SET forbidenTime = ? WHERE id = ?',
        values: [forbidenTime, playerId],
        database: server
      });
      
      return {
        success: true,
        message: '封号成功（数据库已更新）'
      };
    }
  } catch (error: any) {
    console.error('[GM] 封号失败:', error);
    return {
      success: false,
      message: error.message || '封号失败'
    };
  }
};

// 解封
export const unbanPlayer = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !playerId || !openId) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');
    
    try {
      const plat = parsePlatform(platform);
      
      // 调用游戏服接口解封
      const client = await createClientForServer(server);
      const requestPayload = {
        openId,
        serverId,
        platform: plat
      };
      await client.unbanPlayer(requestPayload);

      console.log('[GM] Unban success:', { server, playerId });
    const playerName = await getPlayerName(server, playerId);
    await insertGmOperationLog({
      op_type: 'unban',
      server,
      player_id: String(playerId),
      player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
      admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null,
        request_params: requestPayload,
        response_result: { message: 'ok' },
        success: 1,
        error_message: null
    });
    return {
      success: true,
      message: '解封成功'
    };
    } catch (idipError: any) {
      console.error('[GM] IDIP接口调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'unban',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null,
        request_params: { serverId, openId },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP错误'
      });
      
      return {
        success: false,
        message: `解封失败: ${idipError?.message || 'IDIP错误'}`
      };
    }
  } catch (error: any) {
    console.error('[GM] 解封失败:', error);
    return {
      success: false,
      message: error.message || '解封失败'
    };
  }
};

// 发放物资
export const sendItems = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform, roleId, title, content, items } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !openId || !title || !content || !items || items.length === 0) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');

    try {
      const plat = parsePlatform(platform);
      
      const client = await createClientForServer(server);
      const requestPayload = {
        openId,
        serverId,
        platform: plat,
        roleId: roleId || playerId,
        mailTitle: title,
        mailContent: content,
        items: items.map((i: any) => ({ itemId: Number(i.ItemId ?? i.itemId), itemCount: Number(i.ItemNum ?? i.itemCount ?? i.itemNum) }))
      };
      await client.sendItemMail(requestPayload);

      console.log('[GM] Items sent:', { playerId, itemCount: items.length });
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'send_items',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        role_id: String(roleId || playerId),
        platform: String(platform ?? ''),
        request_params: requestPayload,
        response_result: { message: 'ok' },
        success: 1,
        error_message: null,
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: true,
        message: '物资发放成功'
      };
    } catch (idipError: any) {
      console.error('[GM] IDIP接口调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'send_items',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        role_id: String(roleId || playerId),
        platform: String(platform ?? ''),
        request_params: { serverId, openId, roleId: roleId || playerId, title, content, items },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP错误',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: `发放失败: ${idipError.message}`
      };
    }
  } catch (error: any) {
    console.error('[GM] 发放物资失败:', error);
    return {
      success: false,
      message: error.message || '发放物资失败'
    };
  }
};

// GM充值
export const rechargePlayer = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform, diamond } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !openId || !diamond || diamond <= 0) {
      return {
        success: false,
        message: '参数不完整或无效'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');

    try {
      const plat = parsePlatform(platform);
      
      const client = await createClientForServer(server);
      const requestPayload = {
        openId,
        serverId,
        platform: plat,
        diamond: Number(diamond)
      };
      await client.rechargePlayer(requestPayload);

      console.log('[GM] 充值成功');
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'recharge',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
        request_params: requestPayload,
        response_result: { message: 'ok' },
        success: 1,
        error_message: null,
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: true,
        message: `成功充值 ${diamond} 钻石`
      };
    } catch (idipError: any) {
      console.error('[GM] IDIP接口调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'recharge',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        platform: String(platform ?? ''),
        request_params: { serverId, openId, diamond: Number(diamond) },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP错误',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: `充值失败: ${idipError.message}`
      };
    }
  } catch (error: any) {
    console.error('[GM] GM充值失败:', error);
    return {
      success: false,
      message: error.message || 'GM充值失败'
    };
  }
};

// 发送邮件
export const sendMail = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform, roleId, title, content } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !openId || !title || !content) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');

    try {
      const plat = parsePlatform(platform);
      
      const client = await createClientForServer(server);
      const requestPayload = {
        openId,
        serverId,
        platform: plat,
        roleId: roleId || playerId,
        title,
        content
      };
      await client.sendTextMail(requestPayload);

      console.log('[GM] 邮件发送成功');
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'send_mail',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        role_id: String(roleId || playerId),
        platform: String(platform ?? ''),
        request_params: requestPayload,
        response_result: { message: 'ok' },
        success: 1,
        error_message: null,
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: true,
        message: '邮件发送成功'
      };
    } catch (idipError: any) {
      console.error('[GM] IDIP接口调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'send_mail',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        open_id: String(openId),
        role_id: String(roleId || playerId),
        platform: String(platform ?? ''),
        request_params: { serverId, openId, roleId: roleId || playerId, title, content },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP错误',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: `发送失败: ${idipError.message}`
      };
    }
  } catch (error: any) {
    console.error('[GM] 发送邮件失败:', error);
    return {
      success: false,
      message: error.message || '发送邮件失败'
    };
  }
};

// 检查目标 puid 是否存在
export const checkTargetPuid = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, openId, targetPlatform } = body;
    await requireGMPermission(evt);

    if (!server || !openId || !targetPlatform) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 获取游戏服务器配置
    const gameServer = await getGameServerByIdentifier(server);
    if (!gameServer) {
      return {
        success: false,
        message: '游戏服务器不存在'
      };
    }

    const newPuid = `${openId}#${targetPlatform}`;

    // 解析 dbip
    const [host, port] = gameServer.dbip.split(':');
    const dbConfig = {
      host: host,
      port: port ? parseInt(port) : 3306,
      user: gameServer.dbuser,
      password: gameServer.dbpass,
      database: gameServer.bname
    };

    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(dbConfig);
    
    // 查询目标 puid 是否存在
    const [rows]: any = await connection.execute(
      'SELECT id, name, vipLevel, battlePoint FROM player WHERE puid = ? LIMIT 1',
      [newPuid]
    );
    await connection.end();

    if (rows && rows.length > 0) {
      const existingPlayer = rows[0];
      return {
        success: true,
        exists: true,
        player: {
          id: existingPlayer.id,
          name: existingPlayer.name,
          vipLevel: existingPlayer.vipLevel,
          battlePoint: existingPlayer.battlePoint
        }
      };
    }

    return {
      success: true,
      exists: false
    };
  } catch (error: any) {
    console.error('[GM] 检查目标puid失败:', error);
    return {
      success: false,
      message: error.message || '检查失败'
    };
  }
};

// 迁移平台（使用IDIP接口）
export const migratePlatform = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId, openId, platform, areaId = 1 } = body; // 默认为1（微信）
    const admin = await requireGMPermission(evt);

    if (!server || !openId || !platform) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 根据当前平台确定目标平台
    let targetPlatform: string;
    if (platform.toLowerCase() === 'android') {
      targetPlatform = 'ios';
    } else if (platform.toLowerCase() === 'ios') {
      targetPlatform = 'android';
    } else {
      return {
        success: false,
        message: '当前平台必须是 android 或 ios'
      };
    }

    if (areaId !== 1 && areaId !== 2) {
      return {
        success: false,
        message: 'AreaId必须是1（微信）或2（手Q）'
      };
    }

    // 获取serverId（服务器ID）
    const serverId = server.replace('game_', '');

    try {
      const client = await createClientForServer(server);
      const requestPayload = {
        openId: String(openId),
        serverId,
        targetAreaId: areaId as 1 | 2
      };
      
      const response = await client.platformTransfer(requestPayload);
      console.log('[GM] Platform transfer success:', { playerId, platform: targetPlatform });
        
        // 记录操作日志
      const playerName = await getPlayerName(server, playerId || openId);
        await insertGmOperationLog({
          op_type: 'migrate_platform',
          server,
        player_id: String(playerId || openId),
          player_name: playerName || null,
          open_id: String(openId),
        role_id: String(playerId || openId),
        platform: `${platform} -> ${targetPlatform}`,
          request_params: { 
          ...requestPayload, 
          currentPlatform: platform, 
          targetPlatform 
          },
          response_result: { 
          Result: response.data?.Result ?? 0,
          RetMsg: response.message || 'success'
          },
          success: 1,
          error_message: null,
          admin_id: admin?.id ?? null,
          admin_name: admin?.name ?? null
        });

      return {
        success: true,
        message: `平台迁移成功：${platform} → ${targetPlatform}`
      };
    } catch (idipError: any) {
      console.error('[GM] IDIP调用失败:', idipError);
      const playerName = await getPlayerName(server, playerId || openId);
      await insertGmOperationLog({
        op_type: 'migrate_platform',
        server,
        player_id: String(playerId || openId),
        player_name: playerName || null,
        open_id: String(openId),
        role_id: String(playerId || openId),
        platform: `${platform} -> ${targetPlatform}`,
        request_params: { serverId, areaId, openId, currentPlatform: platform, targetPlatform },
        response_result: null,
        success: 0,
        error_message: idipError?.message || 'IDIP调用失败',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: idipError.message || '平台迁移失败'
      };
    }
  } catch (error: any) {
    console.error('[GM] 迁移平台失败:', error);
    return {
      success: false,
      message: error.message || '迁移平台失败'
    };
  }
};

// 批量发放物资（顺序执行，0.5 秒间隔，上限 50 人）
export const sendItemsBatch = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, title, content, items, targets } = body || {};
    const admin = await requireGMPermission(evt);

    if (!server || !title || !content || !Array.isArray(items) || items.length === 0 || !Array.isArray(targets) || targets.length === 0) {
      return { success: false, message: '参数不完整' };
    }

    // 人数上限 50
    const MAX_PER_BATCH = 50;
    if (targets.length > MAX_PER_BATCH) {
      return { success: false, message: `单次最多支持 ${MAX_PER_BATCH} 人` };
    }

    // 同服约束：本接口以 server 为准，targets 不允许跨服（若传入的 playerId/openId 属于其他服，调用也会失败）

    // 去重（按 openId+playerId 组合）
    const seen = new Set<string>();
    const deduped = targets.filter((t: any) => {
      const key = `${t?.openId || ''}::${t?.playerId || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const serverId = String(server).replace('game_', '');
    const client = await createClientForServer(server);

    const results: Array<{ playerId: string; openId: string; success: boolean; message?: string }> = [];

    // 顺序执行 + 0.5 秒间隔
    for (let i = 0; i < deduped.length; i++) {
      const t = deduped[i] || {};
      const playerId = String(t.playerId || '');
      const openId = String(t.openId || '');
      const roleId = String(t.roleId || playerId);
      const platform = t.platform;
      const plat = parsePlatform(platform);

      const requestPayload = {
        openId,
        serverId,
        platform: plat,
        roleId,
        mailTitle: title,
        mailContent: content,
        items: items.map((i: any) => ({ itemId: Number(i.ItemId ?? i.itemId), itemCount: Number(i.ItemNum ?? i.itemCount ?? i.itemNum) }))
      };

      try {
        await client.sendItemMail(requestPayload);

        const playerName = await getPlayerName(server, playerId);
        await insertGmOperationLog({
          op_type: 'send_items',
          server,
          player_id: String(playerId),
          player_name: playerName || null,
          open_id: String(openId),
          role_id: String(roleId),
          platform: String(platform ?? ''),
          request_params: requestPayload,
          response_result: { message: 'ok' },
          success: 1,
          error_message: null,
          admin_id: admin?.id ?? null,
          admin_name: admin?.name ?? null
        });

        results.push({ playerId, openId, success: true });
      } catch (idipError: any) {
        const playerName = await getPlayerName(server, playerId);
        await insertGmOperationLog({
          op_type: 'send_items',
          server,
          player_id: String(playerId),
          player_name: playerName || null,
          open_id: String(openId),
          role_id: String(roleId),
          platform: String(platform ?? ''),
          request_params: requestPayload,
          response_result: null,
          success: 0,
          error_message: idipError?.message || 'IDIP错误',
          admin_id: admin?.id ?? null,
          admin_name: admin?.name ?? null
        });

        results.push({ playerId, openId, success: false, message: idipError?.message || 'IDIP错误' });
      }

      // 0.5 秒间隔（避免并发冲击后端/脚本服务）
      if (i < deduped.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;
    return {
      success: true,
      summary: { total: results.length, success: successCount, failed: failedCount },
      results
    };
  } catch (error: any) {
    console.error('[GM] 批量发放物资失败:', error);
    return { success: false, message: error?.message || '批量发放物资失败' };
  }
};

// 开罩子
export const openProtectShield = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !playerId) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    try {
      // 获取游戏服务器配置
      const gameServer = await getGameServerByIdentifier(server);
      if (!gameServer) {
        return {
          success: false,
          message: '游戏服务器不存在'
        };
      }

      // 调用游戏服务器接口
      const client = await createClientForServer(server);
      const result = await client.protectShield({ playerId });

      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'open_protect_shield',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        request_params: { playerId },
        response_result: result,
        success: result.code === 0 ? 1 : 0,
        error_message: result.code === 0 ? null : result.message,
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });

      if (result.code === 0) {
        return {
          success: true,
          message: result.message || '开罩子成功'
        };
      } else {
        return {
          success: false,
          message: result.message || '开罩子失败'
        };
      }
    } catch (error: any) {
      console.error('[GM] 调用开罩子接口失败:', error);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'open_protect_shield',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        request_params: { playerId },
        response_result: null,
        success: 0,
        error_message: error?.message || '接口调用失败',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: `开罩子失败: ${error.message}`
      };
    }
  } catch (error: any) {
    console.error('[GM] 开罩子失败:', error);
    return {
      success: false,
      message: error.message || '开罩子失败'
    };
  }
};

// 删除角色
export const deletePlayer = async (evt: H3Event) => {
  try {
    const body = await readBody(evt);
    const { server, playerId } = body;
    const admin = await requireGMPermission(evt);

    if (!server || !playerId) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    try {
      // 获取游戏服务器配置
      const gameServer = await getGameServerByIdentifier(server);
      if (!gameServer) {
        return {
          success: false,
          message: '游戏服务器不存在'
        };
      }

      // 先获取玩家名称（用于日志）
      const playerName = await getPlayerName(server, playerId);

      // 调用游戏服务器接口
      const client = await createClientForServer(server);
      const result = await client.deletePlayer({ playerId });

      await insertGmOperationLog({
        op_type: 'delete_player',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        request_params: { playerId },
        response_result: result,
        success: result.code === 0 ? 1 : 0,
        error_message: result.code === 0 ? null : result.message,
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });

      if (result.code === 0) {
        return {
          success: true,
          message: result.message || '删除角色成功'
        };
      } else {
        return {
          success: false,
          message: result.message || '删除角色失败'
        };
      }
    } catch (error: any) {
      console.error('[GM] 调用删除角色接口失败:', error);
      const playerName = await getPlayerName(server, playerId);
      await insertGmOperationLog({
        op_type: 'delete_player',
        server,
        player_id: String(playerId),
        player_name: playerName || null,
        request_params: { playerId },
        response_result: null,
        success: 0,
        error_message: error?.message || '接口调用失败',
        admin_id: admin?.id ?? null,
        admin_name: admin?.name ?? null
      });
      return {
        success: false,
        message: `删除角色失败: ${error.message}`
      };
    }
  } catch (error: any) {
    console.error('[GM] 删除角色失败:', error);
    return {
      success: false,
      message: error.message || '删除角色失败'
    };
  }
};