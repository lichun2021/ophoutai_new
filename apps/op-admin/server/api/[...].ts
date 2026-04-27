import { useBase, createRouter, defineEventHandler, getHeaders, getMethod, getRequestURL, readBody, getQuery, getCookie, createError, setResponseStatus, type H3Event } from "h3";
import { verifyApiSignature } from '../utils/apiSign';
import { signAdminSession } from '../utils/auth';
import { verifyAdminSession } from '../utils/auth';
import * as UserCtrl from '../controller/user';
import * as PaymentCtrl from '../controller/payment';
import * as UserClientCtrl from '../controller/userClient';
import * as AdminCtrl from '../controller/admin';
import * as PaymentSettingsCtrl from '../controller/paymentSettings';
import * as PaymentChannelCtrl from '../controller/paymentChannel';
import * as PaymentRoutingCtrl from '../controller/paymentRouting';
import * as PlayerDetailCtrl from '../controller/playerDetail';
import * as SystemParamsCtrl from '../controller/systemParams';
import * as SettlementsCtrl from '../controller/settlements';
import * as GMCtrl from '../controller/gm';
import * as CDKCtrl from '../controller/cdk';
import * as ServerCfgCtrl from '../controller/serverConfig';
import * as GmLogsCtrl from '../controller/gmLogs';
import { getGameDatabases } from '../db/gameDb';
import { listActive, listCdkRedeemable, extractWorldIdFromBName } from '../model/gameServers';
import { createGameServerClient } from '../controller/gameServerClient';

const router = createRouter();

// 日志包装函数
const withLogging = (handler: Function, apiName: string) => {
  return defineEventHandler(async (event: H3Event) => {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // ========== 访问日志 ==========
    const headers = getHeaders(event);
    const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
    const userAgent = (headers['user-agent'] as string) || 'unknown';
    const method = getMethod(event);
    const url = getRequestURL(event);
    
    let requestBody: any = {};
    let queryParams: any = {};
    try {
      if (method === 'POST' || method === 'PUT') {
        requestBody = await readBody(event);
      }
      queryParams = getQuery(event);
    } catch (e) {
      requestBody = {};
    }
    
    // 访问日志（仅记录关键信息）
    console.log(`[API] ${method} ${url.pathname} | IP: ${ipAddress.split(',')[0]}`);

    let response: any = {};
    let error: any = null;
    let statusCode = 200;
    
    try {
      // 调用实际的处理函数
      // 在处理前校验签名（跳过公开接口）
      try {
        const url = getRequestURL(event);
        const method = getMethod(event) || 'GET';
        const pathname = url.pathname.replace(/\/$/, ''); // 移除末尾斜杠

        // 公开接口跳过签名验证
        const skipSignature = (
          pathname === '/api/user/login' ||
          pathname === '/api/client/cdk/servers' ||
          pathname === '/api/client/cdk/redeem' ||
          pathname === '/api/client/servers' ||
          pathname === '/api/admin/2fa/generate' ||
          pathname === '/api/admin/2fa/confirm'
        );
        if (!skipSignature) {
          await verifyApiSignature(event, url.pathname, method, queryParams, requestBody);
        }
      } catch (sigErr: any) {
        throw createError({ statusCode: 401, statusMessage: sigErr?.statusMessage || 'invalid_sign 1' });
      }
      response = await handler(event);
    } catch (e: any) {
      error = e;
      statusCode = e.statusCode || 500;
      response = {
        success: false,
        message: e.statusMessage || e.message || "系统错误",
        data: null
      };
      try { setResponseStatus(event, statusCode); } catch {}
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    
    // 判断响应是否成功
    let isSuccess = false;
    if (response && typeof response === 'object') {
      if (response.success !== undefined) {
        isSuccess = response.success;
      } else if (response.code !== undefined) {
        isSuccess = response.code === 200 || response.code === "200";
      } else if (response.status !== undefined) {
        isSuccess = response.status === 'success';
      } else if (!error && statusCode < 400) {
        isSuccess = true;
      }
    } else if (!error && statusCode < 400) {
      isSuccess = true;
    }
    
    if (error) {
      console.error(`[API] 错误: ${error.message}`);
    }
    
    // console.log(`[OUT] 响应体: ${JSON.stringify(response)}`);
    console.log('==========================================');
    
    // 写入结构化日志
    try {
      const logEntry = {
        requestId,
        apiName,
        timestamp: new Date().toISOString(),
        method,
        path: url.pathname,
        clientIp: ipAddress,
        userAgent,
        processingTime,
        statusCode,
        success: isSuccess,
        error: error?.message || null,
        request: {
          query: queryParams,
          body: requestBody
        },
        response: response
      };
      
      // 这里可以扩展为写入日志文件或日志系统
      // console.log('[LOG] 结构化日志:', JSON.stringify(logEntry));
    } catch (logError) {
      console.error('[ERROR] 日志记录失败:', logError);
    }
    
    return response;
  });
};

// 管理员会话校验封装：验证 admin_sid，并将 adminId 注入到请求头 authorization
const adminWrap = (handler: Function, apiName: string) => {
  return withLogging(async (event: H3Event) => {
    const sid = getCookie(event, 'admin_sid');
    const v = verifyAdminSession(sid);
    if (!v.ok) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    // 阻断通过 query/body 传入的 adminId/admin_id 越权
    const q: any = getQuery(event) || {};
    const qId = q.adminId ?? q.admin_id;
    if (qId !== undefined && String(qId) !== String(v.adminId)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden: adminId mismatch' });
    }
    if (['POST','PUT','PATCH','DELETE'].includes((getMethod(event) || 'GET').toUpperCase())) {
      try {
        const body: any = await readBody(event);
        const bId = body?.adminId ?? body?.admin_id;
        if (bId !== undefined && String(bId) !== String(v.adminId)) {
          throw createError({ statusCode: 403, statusMessage: 'Forbidden: adminId mismatch' });
        }
      } catch {}
    }
    try {
      // 🔐 身份加固：强制清理可能存在的伪造 Header，确保 authorization 仅来自经过验证的 Session
      delete event.node.req.headers['authorization'];
      delete event.node.req.headers['Authorization'];
      
      // 统一从会话注入管理员ID，禁止通过参数伪造
      event.node.req.headers['authorization'] = String(v.adminId);
    } catch {}
    return await handler(event);
  }, apiName);
};

// ========== 管理员接口 ==========

/**
 * 管理员登录接口
 * @route POST /api/admin/login
 */
router.post('/admin/login', defineEventHandler(async (event) => {
  // 获取客户端 IP（提前获取，用于日志）
  const headers = getHeaders(event);
  
  // 调试：打印所有相关的 IP 头信息
  console.log(`[Admin Login][DEBUG] 所有 IP 相关头信息:`, {
    'cf-connecting-ip': headers['cf-connecting-ip'] || '无',
    'x-real-ip': headers['x-real-ip'] || '无',
    'x-forwarded-for': headers['x-forwarded-for'] || '无',
    'socket': event.node.req.socket?.remoteAddress || '无'
  });
  
  // 优先级：X-Forwarded-For 第一个 IP > CF-Connecting-IP > X-Real-IP > socket
  // 适配 Cloudflare + Web Proxy + 源站 的架构
  let clientIp = 'unknown';
  let ipSource = 'unknown';
  
  if (headers['x-forwarded-for']) {
    // X-Forwarded-For: 真实客户端IP, Cloudflare IP, ...
    // 取第一个 IP（真实客户端 IP）
    const forwardedIps = String(headers['x-forwarded-for']).split(',').map(ip => ip.trim());
    clientIp = forwardedIps[0] || 'unknown';
    ipSource = 'x-forwarded-for[0]';
    console.log(`[Admin Login][DEBUG] X-Forwarded-For 解析:`, forwardedIps);
  } else if (headers['cf-connecting-ip']) {
    // Cloudflare 直接传递过来的真实 IP
    clientIp = String(headers['cf-connecting-ip']).trim();
    ipSource = 'cf-connecting-ip';
  } else if (headers['x-real-ip']) {
    // Web Proxy 从 CF-Connecting-IP 转换过来的 X-Real-IP
    clientIp = String(headers['x-real-ip']).trim();
    ipSource = 'x-real-ip';
  } else if (event.node.req.socket?.remoteAddress) {
    // 直连 socket IP（无代理时）
    clientIp = event.node.req.socket.remoteAddress;
    ipSource = 'socket';
  }
  
  // 清理 IPv6 前缀（::ffff:192.168.1.1 -> 192.168.1.1）
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.substring(7);
  }
  
  console.log(`[Admin Login] 登录请求 - 客户端IP: ${clientIp} (来源: ${ipSource})`);
  
  // IP 白名单检查（动态读取配置文件，支持热更新）
  let whitelist = '*';
  let configFound = false;
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // 开发环境路径
      path.join(process.cwd(), 'server/config/security.json'),
      // 生产环境路径（相对于.output）
      path.join(process.cwd(), '../server/config/security.json'),
      // 生产环境实际路径（基于 nuxt3 目录结构）
      path.join(process.cwd(), 'nuxt3/server/config/security.json'),
      '/data/nuxt3/server/config/security.json',
      // 用户指定的兼容路径
      '/data/config/security.json',
      path.join(process.cwd(), 'config/security.json'),
      // 绝对路径（如果设置了环境变量）
      process.env.SECURITY_CONFIG_PATH || ''
    ];
    
    console.log(`[Admin Login] 当前工作目录: ${process.cwd()}`);
    console.log(`[Admin Login] 尝试查找配置文件...`);
    
    let configPath = '';
    for (const tryPath of possiblePaths) {
      if (tryPath && fs.existsSync(tryPath)) {
        configPath = tryPath;
        configFound = true;
        console.log(`[Admin Login] ✅ 找到安全配置文件: ${configPath}`);
        break;
      }
    }
    
    if (configPath) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const securityConfig = JSON.parse(configContent);
      whitelist = String(securityConfig.adminLoginIpWhitelist || '*').trim();
      console.log(`[Admin Login] IP 白名单配置: ${whitelist}`);
    } else {
      console.warn('[Admin Login] ❌ 未找到安全配置文件，使用默认值 * (不限制)');
      console.warn('[Admin Login] 尝试过的路径:', possiblePaths.filter(Boolean));
    }
  } catch (err) {
    console.error('[Admin Login] 读取安全配置失败，使用默认值 *', err);
  }
  
  // 白名单验证
  if (whitelist !== '*') {
    const allowedIps = whitelist.split(',').map((ip: string) => ip.trim()).filter(Boolean);
    console.log(`[Admin Login] 开始验证 IP: ${clientIp}, 允许列表: [${allowedIps.join(', ')}]`);
    
    const isAllowed = allowedIps.some((allowedIp: string) => {
      // 支持 CIDR 或精确匹配
      if (allowedIp.includes('/')) {
        // 简单 CIDR 匹配（可以后续扩展为完整 CIDR 库）
        const [network, bits] = allowedIp.split('/');
        const prefix = network.split('.').slice(0, Math.ceil(parseInt(bits) / 8)).join('.');
        const matched = clientIp.startsWith(prefix);
        console.log(`[Admin Login] CIDR 匹配: ${clientIp} vs ${allowedIp} (prefix: ${prefix}) => ${matched}`);
        return matched;
      }
      const matched = clientIp === allowedIp;
      console.log(`[Admin Login] 精确匹配: ${clientIp} vs ${allowedIp} => ${matched}`);
      return matched;
    });
    
    if (!isAllowed) {
      console.log(`[Admin Login] ❌ IP 白名单拦截: ${clientIp}, 允许列表: ${whitelist}`);
      throw createError({ 
        statusCode: 403, 
        statusMessage: 'IP not allowed' 
      });
    }
    
    console.log(`[Admin Login] ✅ IP 验证通过: ${clientIp}`);
  } else {
    console.log(`[Admin Login] ⚠️ 白名单为 *，不限制访问 (IP: ${clientIp})`);
  }
  
  const result: any = await AdminCtrl.login(event);
  try {
    // 登录成功则设置短期会话 Cookie（占位实现，可后续改为真正签名会话）
    const ok = !!(result && result.data);
    if (ok) {
      // 识别管理员/用户，这里管理员登录：auth_is_user=false
      const adminId = result.data.id || result.data.admin_id || 0;
      const sid = signAdminSession(adminId);
      event.node.res.setHeader('Set-Cookie', [
        'auth_logged_in=true; Path=/; HttpOnly; SameSite=Lax',
        'auth_is_user=false; Path=/; HttpOnly; SameSite=Lax',
        `admin_sid=${sid}; Path=/; HttpOnly; SameSite=Lax`
      ]);
    }
  } catch {}
  return result;
}));

/**
 * 获取管理员列表
 * @route GET /api/admin/list
 */
router.get('/admin/list', adminWrap(AdminCtrl.read, '管理员列表'));

/**
 * 刷新管理员权限
 * @route POST /api/admin/refresh-permissions
 */
router.post('/admin/refresh-permissions', adminWrap(AdminCtrl.refreshPermissions, '刷新管理员权限'));

// 已禁用：修改管理员密码功能
// router.post('/admin/change-password', adminWrap(AdminCtrl.changePassword, '管理员修改密码'));

/**
 * 更新管理员个人信息
 * @route POST /api/admin/update-profile
 */
router.post('/admin/update-profile', adminWrap(AdminCtrl.updateProfile, '管理员更新个人信息'));

/**
 * 获取管理员个人信息
 * @route POST /api/admin/get-profile
 */
router.post('/admin/get-profile', adminWrap(AdminCtrl.getProfile, '获取管理员个人信息'));

/**
 * 获取代理平台币余额
 * @route POST /api/admin/platform-coin-balance
 */
router.post('/admin/platform-coin-balance', adminWrap(AdminCtrl.getAdminPlatformCoinBalance, '代理平台币余额'));

/**
 * 获取代理间转账记录
 * @route POST /api/admin/platform-coin-transactions
 */
router.post('/admin/platform-coin-transactions', adminWrap(AdminCtrl.getAdminPlatformCoinTransactions, '代理间转账记录'));

/**
 * 代理间转账
 * @route POST /api/admin/transfer-platform-coins
 */
router.post('/admin/transfer-platform-coins', adminWrap(AdminCtrl.adminTransferPlatformCoins, '代理间转账'));

/**
 * 获取代理给玩家转账记录
 * @route POST /api/admin/platform-coin-to-player-transactions
 */
router.post('/admin/platform-coin-to-player-transactions', adminWrap(AdminCtrl.getAdminToPlayerTransactions, '代理给玩家转账记录'));

/**
 * 代理给玩家转账
 * @route POST /api/admin/transfer-to-player
 */
router.post('/admin/transfer-to-player', adminWrap(AdminCtrl.adminTransferToPlayer, '代理给玩家转账'));

/**
 * 检查玩家是否属于指定代理渠道
 * @route POST /api/admin/check-user-channel
 */
router.post('/admin/check-user-channel', adminWrap(AdminCtrl.checkUserChannel, '检查玩家渠道归属'));

/**
 * 获取管理员被授权的游戏列表
 * @route POST /api/admin/filtered-games
 */
router.post('/admin/filtered-games', adminWrap(AdminCtrl.getFilteredGames, '按权限过滤游戏列表'));

/**
 * 获取所有游戏列表
 * @route GET /api/admin/games
 */
router.get('/admin/games', adminWrap(AdminCtrl.getAllGames, '获取所有游戏列表'));

/**
 * 添加游戏
 * @route POST /api/admin/games/create
 */
router.post('/admin/games/create', adminWrap(AdminCtrl.createGame, '添加游戏'));

/**
 * 更新游戏信息
 * @route POST /api/admin/games/update
 */
router.post('/admin/games/update', adminWrap(AdminCtrl.updateGame, '更新游戏'));

/**
 * 删除游戏
 * @route POST /api/admin/games/delete
 */
router.post('/admin/games/delete', adminWrap(AdminCtrl.deleteGame, '删除游戏'));

/**
 * 切换游戏状态
 * @route POST /api/admin/games/toggle-status
 */
router.post('/admin/games/toggle-status', adminWrap(AdminCtrl.toggleGameStatus, '切换游戏状态'));

/**
 * 检查管理员编辑权限
 * @route POST /api/admin/check-edit-permission
 */
router.post('/admin/check-edit-permission', defineEventHandler(AdminCtrl.checkEditPermission));

/**
 * 获取可管理的下级管理员列表
 * @route POST /api/admin/manageable-admins
 */
router.post('/admin/manageable-admins', adminWrap(AdminCtrl.getManageableAdmins, '可管理的下级管理员列表'));

/**
 * 更新游戏权限
 * @route POST /api/admin/update-game-permissions
 */
router.post('/admin/update-game-permissions', adminWrap(AdminCtrl.updateGamePermissions, '更新游戏权限'));

/**
 * 同步所有代理游戏权限
 * @route POST /api/admin/sync-all-game-permissions
 */
router.post('/admin/sync-all-game-permissions', adminWrap(AdminCtrl.syncAllGamePermissions, '同步所有代理游戏权限'));

/**
 * Google 2FA 绑定
 */
router.get('/admin/2fa/generate', withLogging(AdminCtrl.generate2FABinding, '生成2FA绑定信息(GET)'));
router.post('/admin/2fa/generate', withLogging(AdminCtrl.generate2FABinding, '生成2FA绑定信息(POST)'));
router.post('/admin/2fa/confirm', withLogging(AdminCtrl.confirm2FABinding, '确认绑定2FA'));
router.post('/admin/2fa/unbind', adminWrap(AdminCtrl.unbind2FA, '解绑2FA'));

/**
 * 创建代理
 * @route POST /api/admin/create-promoter
 */
router.post('/admin/create-promoter', adminWrap(AdminCtrl.createPromoter, '创建代理'));

/**
 * 更新代理信息
 * @route POST /api/admin/update-promoter
 */
// 暂时禁用编辑功能 - 防止账号被异常修改
// router.post('/admin/update-promoter', defineEventHandler(AdminCtrl.updatePromoter));

/**
 * 删除代理
 * @route POST /api/admin/delete-promoter
 */
// 暂时禁用删除功能 - 防止账号被异常删除
// router.post('/admin/delete-promoter', defineEventHandler(AdminCtrl.deletePromoter));

/**
 * 切换代理状态
 * @route POST /api/admin/toggle-promoter-status
 */
router.post('/admin/toggle-promoter-status', adminWrap(AdminCtrl.togglePromoterStatus, '切换代理状态'));

/**
 * 检查和修复代理关系
 * @route POST /api/admin/check-fix-agent-relationships
 */
router.post('/admin/check-fix-agent-relationships', adminWrap(AdminCtrl.checkAndFixAgentRelationships, '检查修复代理关系'));

/**
 * 设置初始游戏权限
 * @route POST /api/admin/set-initial-game-permissions
 */
router.post('/admin/set-initial-game-permissions', defineEventHandler(AdminCtrl.setInitialGamePermissions));

/**
 * 手动确认支付 - 已注释，不能随意使用
 * @route POST /api/admin/payment/confirm
 */
// router.post('/admin/payment/confirm', defineEventHandler(PaymentCtrl.confirmPayment));

/**
 * 获取所有支付设置
 * @route GET /api/admin/payment-settings
 */
router.get('/admin/payment-settings', defineEventHandler(PaymentSettingsCtrl.getAllPaymentSettings));

/**
 * 获取启用的支付设置
 * @route GET /api/admin/payment-settings/active
 */

// 用户侧接口（需用户登录 Cookie，不需要管理员权限）
router.get('/user/payment-settings/active', defineEventHandler(PaymentSettingsCtrl.getActivePaymentSettingsForUser));

router.get('/user/system-params/ptb_exchange_rate', defineEventHandler(SystemParamsCtrl.getPublicPTBRate));
router.get('/user/system-params/:key', defineEventHandler(SystemParamsCtrl.getPublicParamByKey));

// 用户侧：收银台支付（无需 SDK 签名，要求用户登录）
router.post('/user/cashier/pay', defineEventHandler(PaymentCtrl.doPayment));

// 用户侧：支付订单询单（查询第三方支付状态）
router.post('/user/payment/query', defineEventHandler(PaymentCtrl.queryPaymentOrder));

// 内部API：支付订单询单（供后台脚本调用，无需认证）
router.post('/internal/payment/query', defineEventHandler(PaymentCtrl.queryPaymentOrder));

/**
 * 支付渠道管理
 */
// 获取所有支付渠道配置
router.get('/admin/payment-channels', adminWrap(PaymentChannelCtrl.getAllPaymentChannels, '获取支付渠道列表'));
// 切换默认支付渠道
router.post('/admin/payment-channels/switch', adminWrap(PaymentChannelCtrl.switchPaymentChannel, '切换默认支付渠道'));
// 获取支付渠道统计
router.get('/admin/payment-channels/stats', adminWrap(PaymentChannelCtrl.getPaymentChannelStats, '获取支付渠道统计'));
// 渠道手动创建平台币充值订单
router.post('/admin/payment-channels/manual-platform-coin', adminWrap(PaymentChannelCtrl.createPlatformCoinOrder, '渠道平台币充值'));

/**
 * 支付路由规则管理
 */
// 获取所有路由规则
router.get('/admin/payment-routing/rules', adminWrap(PaymentRoutingCtrl.getAllRules, '获取路由规则列表'));
// 创建路由规则
router.post('/admin/payment-routing/rules/create', adminWrap(PaymentRoutingCtrl.createRule, '创建路由规则'));
// 更新路由规则
router.post('/admin/payment-routing/rules/update', adminWrap(PaymentRoutingCtrl.updateRule, '更新路由规则'));
// 删除路由规则
router.post('/admin/payment-routing/rules/delete', adminWrap(PaymentRoutingCtrl.deleteRule, '删除路由规则'));
// 切换规则启用状态
router.post('/admin/payment-routing/rules/toggle', adminWrap(PaymentRoutingCtrl.toggleRule, '切换规则状态'));
// 重置每日额度
router.post('/admin/payment-routing/rules/reset-quota', adminWrap(PaymentRoutingCtrl.resetDailyQuota, '重置每日额度'));
router.get('/admin/payment-routing/settings', adminWrap(PaymentRoutingCtrl.getRoutingSettings, '获取路由配置'));
router.post('/admin/payment-routing/settings/update', adminWrap(PaymentRoutingCtrl.updateRoutingSettings, '更新路由配置'));

/**
 * 玩家详情查询
 */
router.post('/admin/player/detail', adminWrap(PlayerDetailCtrl.getPlayerDetail, '获取玩家详情'));

/**
 * 创建支付设置
 * @route POST /api/admin/payment-settings/create
 */
router.post('/admin/payment-settings/create', adminWrap(PaymentSettingsCtrl.createPaymentSetting, '创建支付设置'));

/**
 * 更新支付设置
 * @route PUT /api/admin/payment-settings/update
 */
router.put('/admin/payment-settings/update', adminWrap(PaymentSettingsCtrl.updatePaymentSetting, '更新支付设置'));

/**
 * 删除支付设置
 * @route DELETE /api/admin/payment-settings/delete/:id
 */
router.delete('/admin/payment-settings/delete/:id', adminWrap(PaymentSettingsCtrl.deletePaymentSetting, '删除支付设置'));

// 用户侧：物品配置（只读）
router.get('/user/item-config', defineEventHandler(async (event: H3Event) => {
  const { getAllItems, searchItems } = await import('../utils/itemConfig');
  const q: any = getQuery(event) || {};
  const action = String(q.action || 'list');
  const page = Number(q.page) || 1;
  const pageSize = Math.min(Number(q.pageSize) || 1000, 20000);
  if (action === 'search') {
    const term = String(q.q || '').trim();
    if (!term) {
      return { success: true, data: { list: [], total: 0, page, pageSize, totalPages: 0 } };
    }
    const results = searchItems(term);
    const total = results.length;
    const offset = (page - 1) * pageSize;
    const paged = results.slice(offset, offset + pageSize).map(r => ({ id: r.id, n: r.name, cn: r.name }));
    return { success: true, data: { list: paged, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }
  const all = getAllItems();
  const total = all.length;
  const offset = (page - 1) * pageSize;
  const paged = all.slice(offset, offset + pageSize).map(it => ({ id: it.id, n: it.name, cn: it.name }));
  return { success: true, data: { list: paged, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
}));

/**
 * 获取所有系统参数
 * @route GET /api/admin/system-params
 */
router.get('/admin/system-params', defineEventHandler(SystemParamsCtrl.getAllSystemParams));

/**
 * 获取单个系统参数
 * @route GET /api/admin/system-params/:key
 */
router.get('/admin/system-params/:key', defineEventHandler(SystemParamsCtrl.getSystemParam));

/**
 * 创建系统参数
 * @route POST /api/admin/system-params/create
 */
router.post('/admin/system-params/create', defineEventHandler(SystemParamsCtrl.createSystemParam));

/**
 * 更新系统参数
 * @route PUT /api/admin/system-params/update
 */
router.put('/admin/system-params/update', defineEventHandler(SystemParamsCtrl.updateSystemParam));

/**
 * 删除系统参数
 * @route DELETE /api/admin/system-params/delete/:key
 */
router.delete('/admin/system-params/delete/:key', defineEventHandler(SystemParamsCtrl.deleteSystemParam));

/**
 * 获取支付说明
 * @route GET /api/admin/payment-message
 */
router.get('/admin/payment-message', defineEventHandler(SystemParamsCtrl.getPaymentMessage));

/**
 * 设置支付说明
 * @route POST /api/admin/payment-message
 */
router.post('/admin/payment-message', defineEventHandler(SystemParamsCtrl.setPaymentMessage));

/**
 * 获取API到账开关
 * @route GET /api/admin/payment-api-delivery
 */
router.get('/admin/payment-api-delivery', defineEventHandler(SystemParamsCtrl.getApiDeliveryEnabled));

/**
 * 设置API到账开关
 * @route POST /api/admin/payment-api-delivery
 */
router.post('/admin/payment-api-delivery', defineEventHandler(SystemParamsCtrl.setApiDeliveryEnabled));

/**
 * 获取API到账测试玩家role_id
 * @route GET /api/admin/payment-api-delivery-test-role
 */
router.get('/admin/payment-api-delivery-test-role', defineEventHandler(SystemParamsCtrl.getApiDeliveryTestRoleId));

/**
 * 设置API到账测试玩家role_id
 * @route POST /api/admin/payment-api-delivery-test-role
 */
router.post('/admin/payment-api-delivery-test-role', defineEventHandler(SystemParamsCtrl.setApiDeliveryTestRoleId));

/**
 * 计算代理可提现金额
 * @route POST /api/admin/calculate-withdrawable-amount
 */
router.post('/admin/calculate-withdrawable-amount', defineEventHandler(SettlementsCtrl.calculateWithdrawableAmount));

/**
 * 提交结算申请
 * @route POST /api/admin/submit-settlement-request
 */
router.post('/admin/submit-settlement-request', defineEventHandler(SettlementsCtrl.submitSettlementRequest));

/**
 * 获取结算记录
 * @route POST /api/admin/settlement-records
 */
router.post('/admin/settlement-records', defineEventHandler(SettlementsCtrl.getSettlementRecords));

/**
 * 获取管理员U地址
 * @route POST /api/admin/get-u-address
 */
router.post('/admin/get-u-address', defineEventHandler(SettlementsCtrl.getAdminUAddress));

/**
 * 更新管理员U地址
 * @route POST /api/admin/update-u-address
 */
router.post('/admin/update-u-address', adminWrap(SettlementsCtrl.updateAdminUAddress, '更新管理员U地址'));

/**
 * 获取下级代理的结算申请
 * @route POST /api/admin/child-settlement-requests
 */
router.post('/admin/child-settlement-requests', adminWrap(SettlementsCtrl.getChildSettlementRequests, '获取下级结算申请'));

/**
 * 审核结算申请（通过/拒绝）
 * @route POST /api/admin/review-settlement-request
 */
router.post('/admin/review-settlement-request', adminWrap(SettlementsCtrl.reviewSettlementRequest, '审核结算申请'));

/**
 * 获取用户登录记录
 * @route GET /api/admin/user-login-logs
 * @query {page: number, pageSize: number, username?: string, startDate?: string, endDate?: string, success?: boolean}
 * @returns {Object} 登录记录列表
 */
router.get('/admin/user-login-logs', adminWrap(AdminCtrl.getUserLoginLogs, '用户登录记录'));

/**
 * 获取今日登录统计
 * @route GET /api/admin/today-login-stats
 * @returns {Object} 今日登录统计
 */
router.get('/admin/today-login-stats', adminWrap(AdminCtrl.getTodayLoginStats, '今日登录统计'));

/**
 * 获取下级渠道代码列表
 * @route POST /api/admin/get-child-channels
 * @body {channel_code: string} 父渠道代码
 * @returns {Object} 下级渠道代码列表
 */
router.post('/admin/get-child-channels', defineEventHandler(AdminCtrl.getChildChannels));

/**
 * 获取用户注册记录
 * @route GET /api/admin/users
 * @query {page: number, pageSize: number, username?: string, iphone?: string, thirdparty_uid?: string, channel_code?: string, startDate?: string, endDate?: string}
 * @returns {Object} 用户注册记录列表
 */
router.get('/admin/users', adminWrap(AdminCtrl.getUsers, '用户注册记录'));

/**
 * 修改指定用户密码（管理员）
 * @route POST /api/admin/users/change-password
 * body: { user_id: number, new_password: string }
 */
router.post('/admin/users/change-password', adminWrap(AdminCtrl.changeUserPassword, '管理员修改用户密码'));

/**
 * 修改指定用户渠道（管理员）
 * @route POST /api/admin/users/change-channel
 * body: { user_id: number, new_channel_code: string }
 */
router.post('/admin/users/change-channel', adminWrap(AdminCtrl.changeUserChannel, '管理员修改用户渠道'));
router.get('/admin/channel-codes', adminWrap(AdminCtrl.getChannelCodeOptions, '渠道代码下拉列表'));

/**
 * 验证指定用户密码（管理员）
 * @route POST /api/admin/users/verify-password
 * body: { user_id: number, password: string }
 */
router.post('/admin/users/verify-password', adminWrap(AdminCtrl.verifyUserPassword, '管理员验证用户密码'));

/**
 * 获取充值记录
 * @route GET /api/admin/payments
 * @query {page: number, pageSize: number, transaction_id?: string, user_id?: string, mch_order_id?: string, payment_status?: string, startDate?: string, endDate?: string, statsOnly?: boolean}
 * @returns {Object} 充值记录列表和统计数据
 */
router.get('/admin/payments', adminWrap(AdminCtrl.getPaymentRecords, '充值记录'));

/**
 * 获取渠道支付统计（最近7天）
 * @route GET /api/admin/payment-channel-stats
 */
router.get('/admin/payment-channel-stats', adminWrap(AdminCtrl.getChannelPaymentStats, '渠道支付统计'));

/**
 * 获取礼包发放记录（管理员权限）
 * @route GET /api/admin/gift-package-records
 * @query {page: number, pageSize: number, user_id?: number, thirdparty_uid?: string, packageType?: string, status?: string, game_delivery_status?: string, startDate?: string, endDate?: string, package_name?: string}
 * @returns {Object} 礼包发放记录列表和统计数据
 */
router.get('/admin/gift-package-records', adminWrap(AdminCtrl.getGiftPackageRecords, '礼包发放记录（管理员）'));

/**
 * GM实际到账查询（recharge_daily）
 * @route GET /api/admin/game-checkorder
 * @query {page: number, pageSize: number, serverId: string, playerId?: string, startDate?: string, endDate?: string}
 */
router.get('/admin/game-checkorder', adminWrap(AdminCtrl.getRechargeDailyRecords, 'GM实际到账查询'));

/**
 * 获取角色查询记录
 * @route GET /api/admin/characters
 * @query {page: number, pageSize: number, user_id?: string, character_name?: string, uuid?: string, game_id?: string, server_id?: string, startDate?: string, endDate?: string, statsOnly?: boolean}
 * @returns {Object} 角色记录列表和统计数据
 */
router.get('/admin/characters', adminWrap(AdminCtrl.getGameCharacters, '角色查询记录'));

/**
 * 获取数据概览统计
 * @route GET /api/admin/data-overview
 * @query {startDate?: string, endDate?: string, channelCode?: string, adminId?: string}
 * @returns {Object} 数据概览统计结果
 */
router.get('/admin/data-overview', adminWrap(AdminCtrl.getDataOverview, '数据概览统计'));

/**
 * 获取日报详细数据
 * @route GET /api/admin/daily-report-details
 * @query {startDate?: string, endDate?: string, channelCode?: string, adminId?: string, gameId?: string, groupBy?: string}
 * @returns {Object} 日报详细数据结果
 */
router.get('/admin/daily-report-details', adminWrap(AdminCtrl.getDailyReportDetails, '日报详细数据'));

/**
 * 获取数据概览详情表格
 * @route GET /api/admin/data-overview-details
 * @query {startDate?: string, endDate?: string, groupBy?: string, adminId?: string, page?: number, pageSize?: number}
 * @returns {Object} 数据概览详情表格
 */
router.get('/admin/data-overview-details', adminWrap(AdminCtrl.getDataOverviewDetails, '数据概览详情表格'));

/**
 * 获取LTV数据
 * @route GET /api/admin/ltv-data
 * @query {startDate: string, endDate: string, channelCode?: string, gameId?: string, adminId?: string, page?: number, pageSize?: number}
 * @returns {Object} LTV数据列表和汇总统计
 */
router.get('/admin/ltv-data', adminWrap(AdminCtrl.getLTVData, 'LTV数据'));

/**
 * 获取渠道数据
 * @route GET /api/admin/channel-data
 * @query {startDate: string, endDate: string, channelCode?: string, gameId?: string, adminId?: string, page?: number, pageSize?: number}
 * @returns {Object} 渠道数据列表和分页信息
 */
router.get('/admin/channel-data', adminWrap(AdminCtrl.getChannelData, '渠道数据'));

/**
 * 获取渠道结算数据
 * @route GET /api/admin/channel-settlement-data
 * @query {admin_id: number}
 * @returns {Object} 渠道结算数据列表
 */
router.get('/admin/channel-settlement-data', adminWrap(AdminCtrl.getChannelSettlementData, '渠道结算数据'));

/**
 * 获取LTV趋势图数据
 * @route GET /api/admin/ltv-trend
 * @query {startDate: string, endDate: string, channelCode?: string, gameId?: string, adminId?: string}
 * @returns {Object} LTV趋势图数据
 */
router.get('/admin/ltv-trend', adminWrap(AdminCtrl.getLTVTrendData, 'LTV趋势图'));

/**
 * 第三方会发来的token 只有不存在的时候有用
 * @route GET /api/user/token
 * @returns {Object} 快速注册结果
 */
router.get('/user/token', defineEventHandler(UserCtrl.quickreg));

/**
 * 用户检查接口
 * @route POST /api/user/check
 * @body {username: string, iphone: string, password: string}
 * @returns {Object} 检查结果
 */
router.post('/user/check', defineEventHandler(UserCtrl.checkUser));

/**
 * 用户网页登录接口
 * @route POST /api/user/login
 * @body {username: string, password: string}
 * @returns {Object} 登录结果
 */
router.post('/user/login', defineEventHandler(async (event) => {
  const result: any = await UserCtrl.userLogin(event);
  try {
    const ok = !!(result && result.data && result.data.user);
    if (ok) {
      event.node.res.setHeader('Set-Cookie', [
        'auth_logged_in=true; Path=/; HttpOnly; SameSite=Lax',
        'auth_is_user=true; Path=/; HttpOnly; SameSite=Lax'
      ]);
    }
  } catch {}
  return result;
}));

/**
 * 用户注册接口
 * @route POST /api/user/reg
 * @body {username: string, iphone: string, password: string, uid: string, channel_code: string}
 * @returns {Object} 注册结果
 */
router.post('/user/reg', withLogging(UserCtrl.updateSubUserWuid, '在子帐户关联游戏 wuid'));

/**
 * 用户注册接口
 * @route POST /api/user/reg
 * @body {username: string, iphone: string, password: string, uid: string, channel_code: string}
 * @returns {Object} 注册结果
 */
/**
 * 验证代理账号状态（公开接口）
 * @route GET /api/user/check-channel
 * @query {channel_code: string}
 * @returns {Object} 代理账号状态
 */
router.get('/user/check-channel', defineEventHandler(UserCtrl.checkChannelStatus));

router.post('/user/register', withLogging(UserCtrl.register, '用户注册接口'));

/**
 * 封号/解封用户接口（超级管理员专用）
 * @route POST /api/user/ban
 * @body {user_id: number, status: number, admin_id: number}
 * @returns {Object} 操作结果
 */
router.post('/user/ban', withLogging(UserCtrl.banUser, '封号/解封用户接口'));

/**
 * 根据第三方用户ID获取用户信息
 * @route GET /api/user/get/:thirdparty_uid
 * @param {string} thirdparty_uid - 第三方用户ID
 * @returns {User|null} 用户信息
 */
router.get('/user/get/:thirdparty_uid', withLogging(UserCtrl.getNewOne, '根据第三方用户ID获取用户信息'));

/**
 * 获取用户订单
 * @route GET /api/user/undo/:thirdparty_uid
 * @param {string} thirdparty_uid - 第三方用户ID
 * @returns {Object} 订单信息
 */
router.get('/user/undo/:thirdparty_uid', defineEventHandler(UserCtrl.getorders));

/**
 * POST方式获取用户订单
 * @route POST /api/user/undop
 * @body {thirdparty_uid: string}
 * @returns {Object} 订单信息
 */
router.post('/user/undop', defineEventHandler(UserCtrl.getpostorders));

/**
 * 获取用户个人信息
 * @route GET /api/client/user/profile/:id
 * @param {string} id - 用户ID
 * @returns {Object} 用户信息和统计数据
 */
router.get('/client/user/profile/:id', withLogging(UserClientCtrl.getUserProfile, '客户端-获取用户个人信息'));

/**
 * 获取用户首页统计数据
 * @route GET /api/client/user/home-stats
 * @query {number} user_id - 用户ID
 * @returns {Object} 首页统计数据（累计充值、购买次数、最近订单）
 */
router.get('/client/user/home-stats', withLogging(UserClientCtrl.getUserHomeStats, '客户端-获取首页统计'));

/**
 * 获取用户个人资料统计数据
 * @route GET /api/client/user/stats/:id
 * @param {number} id - 用户ID
 * @returns {Object} 个人资料统计数据（累计充值、购买次数）
 */
router.get('/client/user/stats/:id', withLogging(UserClientCtrl.getUserStats, '客户端-获取个人资料统计'));

/**
 * 获取公开的礼包列表（用户端）
 * @route GET /api/client/gift-packages
 * @query {string} category - 礼包分类(可选)
 * @returns {Object} 礼包列表
 */
router.get('/client/gift-packages', withLogging(UserClientCtrl.getPublicGiftPackages, '客户端-获取礼包列表'));

/**
 * 获取礼包分类列表
 * @route GET /api/client/gift-packages/categories
 * @returns {Object} 分类列表
 */
router.get('/client/gift-packages/categories', withLogging(UserClientCtrl.getGiftPackageCategories, '客户端-获取礼包分类'));

/**
 * 获取当前用户的平台币余额
 * @route GET /api/client/balance
 * @header {string} Authorization - 用户ID
 * @returns {Object} 余额信息
 */
router.get('/client/balance', withLogging(UserClientCtrl.getUserBalance, '客户端-获取余额'));

/**
 * 用户购买礼包
 * @route POST /api/client/gift-packages/purchase
 * @body {number} user_id - 用户ID
 * @body {number} package_id - 礼包ID
 * @body {number} quantity - 购买数量(可选,默认1)
 * @returns {Object} 购买结果
 */
router.post('/client/gift-packages/purchase', withLogging(UserClientCtrl.userPurchaseGiftPackage, '客户端-平台币购买礼包'));


/**
 * 获取用户购买记录
 * @route GET /api/client/purchase-history
 * @query {number} user_id - 用户ID
 * @query {number} page - 页码(可选,默认1)
 * @query {number} pageSize - 每页数量(可选,默认10)
 * @returns {Object} 购买记录列表
 */
router.get('/client/purchase-history', withLogging(UserClientCtrl.getUserPurchaseHistory, '客户端-获取购买记录'));

/**
 * 获取用户充值记录（从PaymentRecords表）
 * @route GET /api/client/recharge-history
 * @query {number} user_id - 用户ID
 * @query {number} page - 页码(可选,默认1)
 * @query {number} pageSize - 每页数量(可选,默认10)
 * @returns {Object} 充值记录列表
 */
router.get('/client/recharge-history', withLogging(UserClientCtrl.getUserRechargeHistory, '客户端-获取充值记录'));

/**
 * 获取用户平台币消费记录（从PaymentRecords表）
 * @route GET /api/client/spend-history
 * @query {number} user_id - 用户ID
 * @query {number} page - 页码(可选,默认1)
 * @query {number} pageSize - 每页数量(可选,默认10)
 * @returns {Object} 平台币消费记录列表
 */
router.get('/client/spend-history', withLogging(UserClientCtrl.getUserPlatformCoinSpendHistory, '客户端-获取平台币消费记录'));

/**
 * 获取可用的礼包列表
 * @route GET /api/client/packages
 * @query {string} category - 礼包分类(可选)
 * @returns {Object} 礼包列表
 */
router.get('/client/packages', withLogging(UserClientCtrl.getAvailableGiftPackages, '客户端-获取可用礼包'));


/**
 * 获取充值链接
 * @route POST /api/rechargeurl/get
 * @body {amount: number, channel_id: number, uid: number}
 * @returns {Object} 充值链接信息
 */
router.post('/rechargeurl/get', withLogging(PaymentCtrl.paymentNewReps, '获取充值链接'));

/**
 * 检查订单状态
 * @route GET /api/payment/check/:tranId
 * @param {string} tranId - 交易ID
 * @returns {Object} 订单状态信息
 */
router.get('/payment/check/:tranId', withLogging(PaymentCtrl.checkOrder, '检查订单状态'));

/**
 * 第三方支付回调通知接口
 * @route GET /api/payment/third-party-notify
 * @query {第三方支付平台回调参数} - 支持GET查询参数和POST请求体
 * @returns {string} 处理结果(success/fail)
 */
router.get('/payment/third-party-notify', withLogging(PaymentCtrl.handleThirdPartyNotify, '第三方支付回调通知接口'));

/**
 * 收银台支付回调通知接口 - 专门处理平台币充值
 * @route GET /api/payment/cashier-notify
 * @query {第三方支付平台回调参数} - 支持GET查询参数和POST请求体
 * @returns {string} 处理结果(success/fail)
 */
router.get('/payment/cashier-notify', withLogging(PaymentCtrl.handleCashierPaymentNotify, '收银台支付回调通知接口'));

/**
 * 根据交易ID获取支付信息
 * @route GET /api/payment/trans/:transaction_id
 * @param {string} transaction_id - 交易ID
 * @returns {Object} 支付信息
 */
router.get('/payment/trans/:transaction_id', defineEventHandler(PaymentCtrl.getPaymentByTransId));

/**
 * 根据用户ID获取支付信息
 * @route GET /api/payment/user/:user_id
 * @param {string} user_id - 用户ID
 * @returns {Object} 支付信息
 */
router.get('/payment/user/:user_id', defineEventHandler(PaymentCtrl.getPaymentByUserID));

/**
 * 获取用户子账号和角色信息
 * @route GET /api/client/getUserCharacters
 */
router.get('/client/getUserCharacters', withLogging(UserClientCtrl.getUserCharacters, '客户端-获取角色列表'));

/**
 * 获取可用的游戏服务器列表（公开接口）
 * @route GET /api/client/servers
 */
router.get('/client/servers', withLogging(async () => {
  // 返回 { name, bname, server_id }，供前端展示 name、提交 server_id
  const active = await listActive();
  const data = active
    .map(s => ({ name: s.name, bname: s.bname, server_id: s.server_id ?? null }))
    .filter(s => s.name && s.bname);
  return { success: true, data };
}, '客户端获取服务器列表'));

/**
 * 根据用户ID查询礼包购买记录
 * @route GET /api/client/player-gift-packages
 * @query {number} user_id - 用户ID
 * @query {number} page - 页码(可选,默认1)
 * @query {number} pageSize - 每页数量(可选,默认10)
 * @query {string} startDate - 开始日期(可选,格式:YYYY-MM-DD)
 * @query {string} endDate - 结束日期(可选,格式:YYYY-MM-DD)
 * @query {string} packageType - 礼包类型(可选,all=全部,purchased=购买,daily=每日,cumulative=累计,默认all)
 * @returns {Object} 礼包购买记录列表
 */
router.get('/client/player-gift-packages', withLogging(UserClientCtrl.getPlayerGiftPackageRecords, '客户端-获取玩家礼包记录'));

// ========== GM管理接口 ==========

/**
 * 获取游戏服务器列表
 * @route GET /api/gm/servers
 */
router.get('/gm/servers', withLogging(GMCtrl.getServers, 'GM获取服务器列表'));

/**
 * 获取玩家列表
 * @route GET /api/gm/players
 */
router.get('/gm/players', withLogging(GMCtrl.getPlayers, 'GM获取玩家列表'));

/**
 * 封号
 * @route POST /api/gm/ban
 */
router.post('/gm/ban', adminWrap(GMCtrl.banPlayer, 'GM封号'));

/**
 * 解封
 * @route POST /api/gm/unban
 */
router.post('/gm/unban', adminWrap(GMCtrl.unbanPlayer, 'GM解封'));

/**
 * 发放物资
 * @route POST /api/gm/send-items
 */
router.post('/gm/send-items', adminWrap(GMCtrl.sendItems, 'GM发放物资'));

  /**
   * 批量发放物资（顺序执行，0.5s 间隔，上限 50 人）
   * @route POST /api/gm/send-items-batch
   */
  router.post('/gm/send-items-batch', adminWrap(GMCtrl.sendItemsBatch, 'GM批量发放物资'));

/**
 * GM充值
 * @route POST /api/gm/recharge
 */
router.post('/gm/recharge', adminWrap(GMCtrl.rechargePlayer, 'GM充值'));

/**
 * 发送邮件
 * @route POST /api/gm/send-mail
 */
router.post('/gm/send-mail', adminWrap(GMCtrl.sendMail, 'GM发送邮件'));

/**
 * 检查目标puid
 * @route POST /api/gm/check-target-puid
 */
router.post('/gm/check-target-puid', withLogging(GMCtrl.checkTargetPuid, 'GM检查目标puid'));

/**
 * 迁移平台
 * @route POST /api/gm/migrate-platform
 */
router.post('/gm/migrate-platform', withLogging(GMCtrl.migratePlatform, 'GM迁移平台'));

/**
 * 开罩子
 * @route POST /api/gm/open-protect-shield
 */
router.post('/gm/open-protect-shield', withLogging(GMCtrl.openProtectShield, 'GM开罩子'));

/**
 * 删除角色
 * @route POST /api/gm/delete-player
 */
router.post('/gm/delete-player', withLogging(GMCtrl.deletePlayer, 'GM删除角色'));

/**
 * GM操作日志查询
 * @route GET /api/admin/gm-operation-logs
 */
router.get('/admin/gm-operation-logs', adminWrap(GmLogsCtrl.listLogs, 'GM操作日志查询'));

// ========== GameServers 配置接口 ==========
router.get('/admin/servers', adminWrap(ServerCfgCtrl.list, '服务器配置列表'));
router.post('/admin/servers/create', adminWrap(ServerCfgCtrl.create, '服务器配置创建'));
router.post('/admin/servers/update', adminWrap(ServerCfgCtrl.update, '服务器配置更新'));
router.post('/admin/servers/remove', adminWrap(ServerCfgCtrl.remove, '服务器配置删除'));

/**
 * 获取游戏服状态（注册数/在线数）
 * @route GET /api/admin/server-status
 */
router.get('/admin/server-status', defineEventHandler(async (event) => {
  const sid = getCookie(event, 'admin_sid');
  const v = verifyAdminSession(sid);
  if (!v.ok) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const servers = (await listActive()).filter(s => (s as any).count_online !== 0);

  const results = await Promise.allSettled(servers.map(async (s) => {
    const worldId = ((s as any).server_id ?? extractWorldIdFromBName(s.bname || '')) || s.id || 1;
    const areaId = Number(worldId);

    try {
      const webhost = (s.webhost || '').replace(/\/$/, '');
      const client = createGameServerClient(webhost, 'idip', 3000);
      const resp = await client.getServerStatus({ serverId: String(worldId), areaId });
      const data = resp.data || {} as any;

      console.log(`[服务器状态] ${s.name} - 总在线: ${data.onlineCount}, iOS: ${data.onlineIOS}, Android: ${data.onlineAndroid}, 注册数: ${data.registerCount}`);

      return {
        id: s.id,
        name: s.name,
        bname: s.bname,
        webhost: s.webhost,
        areaId,
        register: data.registerCount || 0,
        online: data.onlineCount || 0,
        onlineAndroid: data.onlineAndroid || 0,
        onlineIOS: data.onlineIOS || 0,
        svrName: data.serverName || s.name
      };
    } catch (err: any) {
      return {
        id: s.id,
        name: s.name,
        bname: s.bname,
        webhost: s.webhost,
        areaId,
        register: 0,
        online: 0,
        onlineAndroid: 0,
        onlineIOS: 0,
        svrName: s.name,
        error: err?.message || 'fetch_failed'
      };
    }
  }));

  const data = results.map((r) => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
  return { success: true, data };
}));

// ========== CDK 管理接口 ==========
// 类型
router.post('/admin/cdk/type/create', defineEventHandler(CDKCtrl.createType));
router.post('/admin/cdk/type/update', defineEventHandler(CDKCtrl.updateType));
router.get('/admin/cdk/type/list', defineEventHandler(CDKCtrl.listTypes));
// 码
router.post('/admin/cdk/code/create', defineEventHandler(CDKCtrl.createCodes));
router.get('/admin/cdk/code/list', defineEventHandler(CDKCtrl.listCodes));
// 领取记录查询
router.get('/admin/cdk/redemptions', defineEventHandler(CDKCtrl.listRedemptions));

// ========== CDK 兑换（公开，无需登录） ==========
router.post('/client/cdk/redeem', defineEventHandler(CDKCtrl.redeem));

/**
 * 获取CDK领取可用的游戏服务器列表（公开接口）
 * @route GET /api/client/cdk/servers
 */
router.get('/client/cdk/servers', withLogging(async () => {
  // 只返回允许CDK领取的服务器
  const active = await listCdkRedeemable();
  const data = active
    .map(s => ({ name: s.name, bname: s.bname, server_id: s.server_id ?? null }))
    .filter(s => s.name && s.bname);
  return { success: true, data };
}, 'CDK获取服务器列表'));

export default useBase('/api', router.handler);