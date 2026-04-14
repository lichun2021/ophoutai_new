import { useBase, createRouter, defineEventHandler, getHeaders, getMethod, getRequestURL, readBody, getQuery, getCookie, createError, setResponseStatus, type H3Event } from "h3";
import { verifyApiSignature } from '../utils/apiSign';
import * as UserCtrl from '../controller/user';
import * as PaymentCtrl from '../controller/payment';
import * as UserClientCtrl from '../controller/userClient';
import * as CDKCtrl from '../controller/cdk';
import { listActive, listCdkRedeemable } from '../model/gameServers';
import * as SystemParamsCtrl from '../controller/systemParams';
import * as PaymentSettingsCtrl from '../controller/paymentSettings';

const router = createRouter();

// 日志包装函数
const withLogging = (handler: Function, apiName: string) => {
  return defineEventHandler(async (event: H3Event) => {
    const startTime = Date.now();
    const headers = getHeaders(event);
    const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
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

        // 用户中心公开接口，跳过签名
        const skipSignature = (
          pathname === '/api/user/login' ||
          pathname === '/api/user/register' ||
          pathname === '/api/user/check' ||
          pathname === '/api/user/check-channel' ||
          pathname === '/api/user/token' ||
          pathname === '/api/client/cdk/servers' ||
          pathname === '/api/client/cdk/redeem' ||
          pathname === '/api/client/servers' ||
          pathname === '/api/payment/cashier-notify' ||
          pathname === '/api/payment/third-party-notify'
        );
        if (!skipSignature) {
          await verifyApiSignature(event, url.pathname, method, queryParams, requestBody);
        }
      } catch (sigErr: any) {
        throw createError({ statusCode: 401, statusMessage: sigErr?.statusMessage || 'invalid_sign' });
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

// ========== 用户认证接口 ==========

/**
 * 第三方 token 快速注册
 * @route GET /api/user/token
 */
router.get('/user/token', defineEventHandler(UserCtrl.quickreg));

/**
 * 用户检查（第三方跳转用）
 * @route POST /api/user/check
 */
router.post('/user/check', defineEventHandler(UserCtrl.checkUser));

/**
 * 验证代理账号状态
 * @route GET /api/user/check-channel
 */
router.get('/user/check-channel', defineEventHandler(UserCtrl.checkChannelStatus));

/**
 * 用户网页登录
 * @route POST /api/user/login
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
 * 用户注册
 * @route POST /api/user/register
 */
router.post('/user/register', withLogging(UserCtrl.register, '用户注册接口'));

/**
 * 关联游戏 wuid
 * @route POST /api/user/reg
 */
router.post('/user/reg', withLogging(UserCtrl.updateSubUserWuid, '关联游戏wuid'));

/**
 * 根据第三方 UID 获取用户信息
 * @route GET /api/user/get/:thirdparty_uid
 */
router.get('/user/get/:thirdparty_uid', withLogging(UserCtrl.getNewOne, '根据第三方UID获取用户'));

/**
 * 获取用户订单（GET）
 * @route GET /api/user/undo/:thirdparty_uid
 */
router.get('/user/undo/:thirdparty_uid', defineEventHandler(UserCtrl.getorders));

/**
 * 获取用户订单（POST）
 * @route POST /api/user/undop
 */
router.post('/user/undop', defineEventHandler(UserCtrl.getpostorders));

// ========== 用户侧系统参数（只读公开）==========

router.get('/user/system-params/ptb_exchange_rate', defineEventHandler(SystemParamsCtrl.getPublicPTBRate));
router.get('/user/system-params/:key', defineEventHandler(SystemParamsCtrl.getPublicParamByKey));

// ========== 用户侧支付设置（只读）==========

router.get('/user/payment-settings/active', defineEventHandler(PaymentSettingsCtrl.getActivePaymentSettingsForUser));

// ========== 用户侧物品配置（只读）==========

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

// ========== 收银台支付接口 ==========

/**
 * 收银台支付（用户登录后调用）
 * @route POST /api/user/cashier/pay
 */
router.post('/user/cashier/pay', defineEventHandler(PaymentCtrl.doPayment));

/**
 * 支付订单询单
 * @route POST /api/user/payment/query
 */
router.post('/user/payment/query', defineEventHandler(PaymentCtrl.queryPaymentOrder));

// ========== 客户端用户接口 ==========

router.get('/client/user/profile/:id', withLogging(UserClientCtrl.getUserProfile, '客户端-获取用户个人信息'));
router.get('/client/user/home-stats', withLogging(UserClientCtrl.getUserHomeStats, '客户端-获取首页统计'));
router.get('/client/user/stats/:id', withLogging(UserClientCtrl.getUserStats, '客户端-获取个人资料统计'));

// ========== 余额接口 ==========

router.get('/client/balance', withLogging(UserClientCtrl.getUserBalance, '客户端-获取余额'));

// ========== 礼包商城接口 ==========

router.get('/client/gift-packages', withLogging(UserClientCtrl.getPublicGiftPackages, '客户端-获取礼包列表'));
router.get('/client/gift-packages/categories', withLogging(UserClientCtrl.getGiftPackageCategories, '客户端-获取礼包分类'));
router.post('/client/gift-packages/purchase', withLogging(UserClientCtrl.userPurchaseGiftPackage, '客户端-平台币购买礼包'));
router.get('/client/packages', withLogging(UserClientCtrl.getAvailableGiftPackages, '客户端-获取可用礼包'));
router.get('/client/player-gift-packages', withLogging(UserClientCtrl.getPlayerGiftPackageRecords, '客户端-获取玩家礼包记录'));

// ========== 历史记录接口 ==========

router.get('/client/purchase-history', withLogging(UserClientCtrl.getUserPurchaseHistory, '客户端-获取购买记录'));
router.get('/client/recharge-history', withLogging(UserClientCtrl.getUserRechargeHistory, '客户端-获取充值记录'));
router.get('/client/spend-history', withLogging(UserClientCtrl.getUserPlatformCoinSpendHistory, '客户端-获取平台币消费记录'));

// ========== 角色信息 ==========

router.get('/client/getUserCharacters', withLogging(UserClientCtrl.getUserCharacters, '客户端-获取角色列表'));

// ========== 游戏服务器列表（公开）==========

router.get('/client/servers', withLogging(async () => {
  const active = await listActive();
  const data = active
    .map(s => ({ name: s.name, bname: s.bname, server_id: s.server_id ?? null }))
    .filter(s => s.name && s.bname);
  return { success: true, data };
}, '客户端获取服务器列表'));

// ========== CDK 兑换（公开，无需登录）==========

router.post('/client/cdk/redeem', defineEventHandler(CDKCtrl.redeem));

router.get('/client/cdk/servers', withLogging(async () => {
  const active = await listCdkRedeemable();
  const data = active
    .map(s => ({ name: s.name, bname: s.bname, server_id: s.server_id ?? null }))
    .filter(s => s.name && s.bname);
  return { success: true, data };
}, 'CDK获取服务器列表'));

// ========== 充值链接（SDK 调用）==========

router.post('/rechargeurl/get', withLogging(PaymentCtrl.paymentNewReps, '获取充值链接'));

// ========== 支付状态查询 ==========

router.get('/payment/check/:tranId', withLogging(PaymentCtrl.checkOrder, '检查订单状态'));
router.get('/payment/trans/:transaction_id', defineEventHandler(PaymentCtrl.getPaymentByTransId));
router.get('/payment/user/:user_id', defineEventHandler(PaymentCtrl.getPaymentByUserID));

// ========== 支付回调（第三方通知）==========

router.get('/payment/third-party-notify', withLogging(PaymentCtrl.handleThirdPartyNotify, '第三方支付回调通知'));
router.get('/payment/cashier-notify', withLogging(PaymentCtrl.handleCashierPaymentNotify, '收银台支付回调通知'));

// 内部API：支付询单（供后台脚本调用，无需认证）
router.post('/internal/payment/query', defineEventHandler(PaymentCtrl.queryPaymentOrder));

export default useBase('/api', router.handler);