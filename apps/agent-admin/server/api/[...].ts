import { useBase, createRouter, defineEventHandler, getHeaders, getMethod, getRequestURL, readBody, getQuery, getCookie, createError, setResponseStatus, type H3Event } from "h3";
import { verifyApiSignature } from '../utils/apiSign';
import { signAdminSession } from '../utils/auth';
import { verifyAdminSession } from '../utils/auth';
import * as AdminCtrl from '../controller/admin';
import * as PaymentCtrl from '../controller/payment';
import * as SettlementsCtrl from '../controller/settlements';
import * as SystemParamsCtrl from '../controller/systemParams';
import { listActive } from '../model/gameServers';

const router = createRouter();

// 日志包装函数
const withLogging = (handler: Function, apiName: string) => {
  return defineEventHandler(async (event: H3Event) => {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
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
    
    console.log(`[API] ${method} ${url.pathname} | IP: ${ipAddress.split(',')[0]}`);

    let response: any = {};
    let error: any = null;
    let statusCode = 200;
    
    try {
      try {
        const url = getRequestURL(event);
        const method = getMethod(event) || 'GET';
        const pathname = url.pathname.replace(/\/$/, '');

        const skipSignature = (
          pathname === '/api/admin/login'
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
    
    if (error) {
      console.error(`[API] 错误: ${error.message}`);
    }
    console.log('==========================================');
    
    return response;
  });
};

// 管理员会话校验封装
const adminWrap = (handler: Function, apiName: string) => {
  return withLogging(async (event: H3Event) => {
    const sid = getCookie(event, 'admin_sid');
    const v = verifyAdminSession(sid);
    if (!v.ok) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
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
      delete event.node.req.headers['authorization'];
      delete event.node.req.headers['Authorization'];
      event.node.req.headers['authorization'] = String(v.adminId);
    } catch {}
    return await handler(event);
  }, apiName);
};

// ========== 管理员认证接口 ==========

router.post('/admin/login', defineEventHandler(async (event) => {
  const headers = getHeaders(event);
  let clientIp = 'unknown';
  if (headers['x-forwarded-for']) {
    clientIp = String(headers['x-forwarded-for']).split(',')[0].trim();
  } else if (headers['x-real-ip']) {
    clientIp = String(headers['x-real-ip']).trim();
  } else if (event.node.req.socket?.remoteAddress) {
    clientIp = event.node.req.socket.remoteAddress;
  }
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.substring(7);
  console.log(`[Admin Login] 登录请求 - IP: ${clientIp}`);

  const result: any = await AdminCtrl.login(event);
  try {
    const ok = !!(result && result.data);
    if (ok) {
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

router.get('/admin/list', adminWrap(AdminCtrl.read, '管理员列表'));
router.post('/admin/refresh-permissions', adminWrap(AdminCtrl.refreshPermissions, '刷新管理员权限'));
router.post('/admin/update-profile', adminWrap(AdminCtrl.updateProfile, '管理员更新个人信息'));
router.post('/admin/get-profile', adminWrap(AdminCtrl.getProfile, '获取管理员个人信息'));


// ========== 代理功能接口 ==========

router.post('/admin/platform-coin-balance', adminWrap(AdminCtrl.getAdminPlatformCoinBalance, '代理平台币余额'));
router.post('/admin/platform-coin-transactions', adminWrap(AdminCtrl.getAdminPlatformCoinTransactions, '代理间转账记录'));
router.post('/admin/transfer-platform-coins', adminWrap(AdminCtrl.adminTransferPlatformCoins, '代理间转账'));
router.post('/admin/platform-coin-to-player-transactions', adminWrap(AdminCtrl.getAdminToPlayerTransactions, '代理给玩家转账记录'));
router.post('/admin/transfer-to-player', adminWrap(AdminCtrl.adminTransferToPlayer, '代理给玩家转账'));
router.post('/admin/check-user-channel', adminWrap(AdminCtrl.checkUserChannel, '检查玩家渠道归属'));
router.post('/admin/filtered-games', adminWrap(AdminCtrl.getFilteredGames, '按权限过滤游戏列表'));
router.get('/admin/games', adminWrap(AdminCtrl.getAllGames, '获取所有游戏列表'));
router.post('/admin/check-edit-permission', defineEventHandler(AdminCtrl.checkEditPermission));
router.post('/admin/manageable-admins', adminWrap(AdminCtrl.getManageableAdmins, '可管理的下级管理员列表'));

// ========== 数据报表接口 ==========

router.get('/admin/users', adminWrap(AdminCtrl.getUsers, '用户注册记录'));
router.get('/admin/payments', adminWrap(AdminCtrl.getPaymentRecords, '充值记录'));
router.get('/admin/characters', adminWrap(AdminCtrl.getGameCharacters, '角色查询记录'));
router.get('/admin/user-login-logs', adminWrap(AdminCtrl.getUserLoginLogs, '用户登录记录'));
router.get('/admin/today-login-stats', adminWrap(AdminCtrl.getTodayLoginStats, '今日登录统计'));
router.post('/admin/get-child-channels', defineEventHandler(AdminCtrl.getChildChannels));
router.get('/admin/channel-codes', adminWrap(AdminCtrl.getChannelCodeOptions, '渠道代码下拉列表'));
router.get('/admin/data-overview', adminWrap(AdminCtrl.getDataOverview, '数据概览统计'));
router.get('/admin/daily-report-details', adminWrap(AdminCtrl.getDailyReportDetails, '日报详细数据'));
router.get('/admin/data-overview-details', adminWrap(AdminCtrl.getDataOverviewDetails, '数据概览详情表格'));
router.get('/admin/ltv-data', adminWrap(AdminCtrl.getLTVData, 'LTV数据'));
router.get('/admin/ltv-trend', adminWrap(AdminCtrl.getLTVTrendData, 'LTV趋势图'));
router.get('/admin/channel-data', adminWrap(AdminCtrl.getChannelData, '渠道数据'));
router.get('/admin/channel-settlement-data', adminWrap(AdminCtrl.getChannelSettlementData, '渠道结算数据'));

// ========== 结算接口 ==========

router.post('/admin/calculate-withdrawable-amount', defineEventHandler(SettlementsCtrl.calculateWithdrawableAmount));
router.post('/admin/submit-settlement-request', defineEventHandler(SettlementsCtrl.submitSettlementRequest));
router.post('/admin/settlement-records', defineEventHandler(SettlementsCtrl.getSettlementRecords));
router.post('/admin/get-u-address', defineEventHandler(SettlementsCtrl.getAdminUAddress));
router.post('/admin/update-u-address', adminWrap(SettlementsCtrl.updateAdminUAddress, '更新管理员U地址'));
router.post('/admin/child-settlement-requests', adminWrap(SettlementsCtrl.getChildSettlementRequests, '获取下级结算申请'));
router.post('/admin/review-settlement-request', adminWrap(SettlementsCtrl.reviewSettlementRequest, '审核结算申请'));

// ========== 公开系统参数（代理侧只读）==========

router.get('/admin/system-params', defineEventHandler(SystemParamsCtrl.getAllSystemParams));
router.get('/admin/system-params/:key', defineEventHandler(SystemParamsCtrl.getSystemParam));

// ========== 支付回调（共用）==========

router.get('/payment/cashier-notify', withLogging(PaymentCtrl.handleCashierPaymentNotify, '收银台支付回调通知接口'));
router.get('/payment/third-party-notify', withLogging(PaymentCtrl.handleThirdPartyNotify, '第三方支付回调通知接口'));

export default useBase('/api', router.handler);