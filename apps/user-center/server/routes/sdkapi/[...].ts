import { useBase, createRouter, defineEventHandler } from "h3";
import { verifySdkSign } from '../../utils/sdkSign';
import type { H3Event } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import * as UserCtrl from '../../controller/user';
import * as AdminCtrl from '../../controller/admin';
import * as PaymentSettingsCtrl from '../../controller/paymentSettings';
import * as PaymentCtrl from '../../controller/payment';
import { sdkMessages } from '../../utils/i18n';

const router = createRouter();

// 日志包装函数
const withLogging = (handler: Function, apiName: string) => {
  return defineEventHandler(async (event) => {
    const startTime = Date.now();
    const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // ========== 访问日志 ==========
    const headers = getHeaders(event);
    const ipAddress = (headers['x-forwarded-for'] as string) || (headers['x-real-ip'] as string) || 'unknown';
    const userAgent = (headers['user-agent'] as string) || 'unknown';
    const method = getMethod(event);
    const url = getRequestURL(event);
    
    let requestBody: any = {};
    try {
      const parsed = await readBody(event);
      // 确保为对象，防止为 null/字符串导致属性访问报错
      requestBody = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      requestBody = {};
    }
    
    // 访问日志
    const maskIpForPrivacy = apiName.includes('登录');
    console.log(`[IN] 时间: ${new Date().toISOString()}`);
    console.log(`[IN] 路径: ${method} ${url.pathname}${url.search}`);
    console.log(`[IN] IP: ${maskIpForPrivacy ? '[masked]' : ipAddress}, ${userAgent.split(' ')[0]}`);
    console.log(`[IN] 参数: 用户名=${(requestBody as any)?.z ?? 'N/A'}, 登录类型=${(requestBody as any)?.c ?? 'N/A'}, 游戏ID=${(requestBody as any)?.d ?? 'N/A'}, 代理ID=${(requestBody as any)?.f ?? 'N/A'}`);
    console.log(`[IN] 请求体: ${JSON.stringify(requestBody)}`);
    console.log('=========================================');

    let response: any = {};
    let error: any = null;
    
    try {
      // ========== 可选的时间戳有效性校验（ts） ==========
      // 若请求携带 ts（秒或毫秒），则要求与服务器当前时间误差 <= 50 秒
      // 兼容 GET ?ts= 和 POST body { ts }
      try {
        const tsFromBody: any = (requestBody as any)?.ts ?? (requestBody as any)?.TS;
        const tsFromQuery: any = (url.searchParams ? url.searchParams.get('ts') : undefined);
        const tsRaw: any = tsFromBody ?? tsFromQuery;
        if (tsRaw !== undefined && tsRaw !== null && tsRaw !== '') {
          const n = Number(tsRaw);
          if (!Number.isFinite(n)) {
            throw new Error('无效的时间戳');
          }
          // 秒或毫秒判断
          const tsSec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
          const nowSec = Math.floor(Date.now() / 1000);
          if (Math.abs(nowSec - tsSec) > 50) {
            throw new Error('请求已过期');
          }
        }
      } catch (tsErr: any) {
        throw new Error(tsErr?.message || '时间戳校验失败');
      }

      // 调用实际的处理函数
      response = await handler(event);
    } catch (e: any) {
      error = e;
      // 根据接口类型返回不同格式的错误响应
      if (apiName.includes('支付') || apiName.includes('getPayWay')) {
        response = {
          code: "0",
          data: [],
          msg: e.message || sdkMessages.payment.systemError(),
          djq: null,
          ttb: null,
          discount: null,
          flb: 0
        };
      } else if (apiName.includes('游戏订单查询')) {
        response = {
          code: -1,
          msg: e.message || sdkMessages.payment.systemError(),
          amount: "0"
        };
      } else {
        response = {
          z: -1,
          x: e.message || sdkMessages.login.systemError(),
          b: "",
          c: "",
          d: "",
          sid: requestBody.sid || "",
          e: Date.now().toString()
        };
      }
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // 出口日志
    console.log(`[OUT] ${apiName} 耗时: ${processingTime}ms, 状态: ${
      response && response.code !== undefined 
        ? `码=${response.code}, ${String(response.code) === '1' ? '成功' : '失败'}`
        : response && response.z !== undefined
        ? `码=${response.z}, ${response.z === 0 ? '成功' : '失败'}`
        : '未知'
    }${error ? `, 错误: ${error.message}` : ''}`);
    
    // 写入结构化日志
    try {
      let logEntry: any = {
        requestId,
        apiName,
        timestamp: new Date().toISOString(),
        method,
        path: url.pathname,
        clientIp: ipAddress,
        userAgent,
        processingTime,
        error: error?.message || null
      };

      // 根据接口类型记录不同的请求和响应信息
      if (apiName.includes('支付') || apiName.includes('getPayWay')) {
        logEntry.request = {
          gameId: (requestBody as any)?.z,
          username: (requestBody as any)?.zz,
          channelId: (requestBody as any)?.b,
          agentId: (requestBody as any)?.bb,
          money: (requestBody as any)?.money
        };
        logEntry.response = response ? {
          code: response.code,
          message: response.msg,
          success: response.code === "1"
        } : { code: 'undefined', message: 'no response', success: false };
      } else {
        logEntry.request = {
          username: (requestBody as any)?.z,
          loginType: (requestBody as any)?.c,
          gameId: (requestBody as any)?.d,
          agentId: (requestBody as any)?.f
        };
        logEntry.response = response ? {
          code: response.z,
          message: response.x,
          success: response.z === 0
        } : { code: 'undefined', message: 'no response', success: false };
      }

    } catch (logError) {
      console.error('[ERROR] 日志记录失败:', logError);
    }
    
    return response;
  });
};

// 签名校验包装（所有 /sdkapi/ 接口统一校验）
const withSign = (handler: Function) => {
  return defineEventHandler(async (event) => {
    const ok = await verifySdkSign(event);
    if (!ok) {
      // 抛错交由上层包装（withLogging）统一格式化返回
      throw new Error('签名无效');
    }
    return handler(event);
  });
};

// 组合包装：签名校验 + 日志
const withSignAndLogging = (handler: Function, apiName: string) => withLogging(withSign(handler), apiName);

/**
 * SDK登录接口
 * @route POST /sdkapi/login/dologin
 * @body {z: string, b: string, c: number, d: string, e: string, f: string, x: string, h: string, i: string, vs: string, sid: string, o: string, p: string, q: string, r: string, s: string, si: string}
 * @returns {Object} SDK登录结果
 */
router.post('/login/dologin', withSignAndLogging(UserCtrl.sdkLogin, 'SDK登录接口'));

/**
 * 获取子账号列表接口
 * @route POST /sdkapi/login/xiaohao
 * @body {z: string, c: string, e: string, f: string}
 * @returns {Object} 子账号列表结果
 */
router.post('/login/xiaohao', withSignAndLogging(UserCtrl.getSubAccountList, '获取子账号列表接口'));

/**
 * 添加子账号接口
 * @route POST /sdkapi/login/addxiaohao
 * @body {z: string, c: string, e: string, f: string, x: string}
 * @returns {Object} 添加子账号结果
 */
router.post('/login/addxiaohao', withSignAndLogging(UserCtrl.addSubAccount, '添加子账号接口'));

/**
 * 编辑子账号昵称接口
 * @route POST /sdkapi/login/editSubAccount
 * @body {username: string, gid: string, cpsId: string, appid: string, nickname: string, subAccount: string}
 * @returns {Object} 编辑结果
 */
router.post('/login/editSubAccount', withSignAndLogging(UserCtrl.editSubAccountNickname, '编辑子账号昵称接口'));

/**
 * 获取支付方式接口
 * @route POST /sdkapi/Pay/payway
 * @body {username: string, gid: number, money: number} (form-data格式)
 * @returns {Object} 支付方式列表
 */
router.post('/Pay/payway', withSignAndLogging(PaymentSettingsCtrl.getPayWay, '获取支付方式接口'));

/**
 * 角色上报接口
 * @route POST /sdkapi/user/setRole
 * @body {z: string, b: string, i: string, xh: string, c: string, d: string, e: number, f: number, x: string, h: string}
 * @returns {Object} 角色上报结果
 */
router.post('/user/setRole', withSignAndLogging(UserCtrl.reportRole, '角色上报接口'));

// /**
//  * 登录日志上报接口
//  * @route POST /sdkapi/index/adddllog
//  * @body {username: string, cpsId: string, gid: string, xh: string, login_device: string}
//  * @returns {Object} 登录日志上报结果
//  */
// router.post('/index/adddllog', withLogging(UserCtrl.reportLoginLog, '登录日志上报接口'));

/**
 * 支付请求接口
 * @route GET/POST /sdkapi/Pay/doPay
 * @body {各种支付参数}
 * @returns {Object} 支付结果或支付链接
 */
router.post('/Unipay/pay', withLogging(PaymentCtrl.doPayment, '支付请求接口(代理)'));

/**
 * 游戏订单查询接口
 * @route GET/POST /sdkapi/game/order
 * @query {oid: string} - 商户订单ID (mch_order_id) [GET方式]
 * @body {oid: string} - 商户订单ID (mch_order_id) [POST方式]
 * @returns {Object} {code: int, msg: string, amount: string}
 */
router.post('/game/order', withSignAndLogging(PaymentCtrl.getGameOrder, '游戏订单查询接口'));


// =====================
// SDK版 /api/user 同步接口
// =====================
/**
 * 获取用户token（快速注册）
 * @route GET /sdkapi/user/token
 */
router.get('/user/token', withSignAndLogging(UserCtrl.quickreg, 'SDK 获取用户token'));

/**
 * 检查用户
 * @route POST /sdkapi/user/check
 */
router.post('/user/check', withSignAndLogging(UserCtrl.checkUser, 'SDK 检查用户'));

/**
 * 用户登录（设置同 /api 的 Cookie）
 * @route POST /sdkapi/user/login
 */
router.post('/user/login', withSignAndLogging(async (event: H3Event) => {
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
}, 'SDK 用户登录'));

/**
 * 在子帐户关联游戏 wuid（与 /api/user/reg 一致）
 * @route POST /sdkapi/user/reg
 */
router.post('/user/reg', withSignAndLogging(UserCtrl.updateSubUserWuid, 'SDK 在子帐户关联游戏 wuid'));

/**
 * 用户注册接口
 * @route POST /sdkapi/user/register
 */
router.post('/user/register', withSignAndLogging(UserCtrl.register, 'SDK 用户注册接口'));

/**
 * 封号/解封用户接口
 * @route POST /sdkapi/user/ban
 */
router.post('/user/ban', withSignAndLogging(UserCtrl.banUser, 'SDK 封号/解封用户接口'));

/**
 * 根据第三方用户ID获取用户信息
 * @route GET /sdkapi/user/get/:thirdparty_uid
 */
router.get('/user/get/:thirdparty_uid', withSignAndLogging(UserCtrl.getNewOne, 'SDK 根据第三方用户ID获取用户信息'));

/**
 * 获取用户订单（未完成）
 * @route GET /sdkapi/user/undo/:thirdparty_uid
 */
router.get('/user/undo/:thirdparty_uid', withSignAndLogging(defineEventHandler(UserCtrl.getorders), 'SDK 获取用户订单(未完成)'));

/**
 * POST方式获取用户订单（未完成）
 * @route POST /sdkapi/user/undop
 */
router.post('/user/undop', withSignAndLogging(defineEventHandler(UserCtrl.getpostorders), 'SDK POST获取用户订单(未完成)'));

/**
 * 生成唯一UUID接口
 * @route GET/POST /sdkapi/utils/uuid
 * @returns {Object} {code: "1", msg: string, data: { uuid: string }}
 */
router.get('/utils/uuid', withSignAndLogging(async (event: H3Event) => {
  const id = uuidv4();
  return { code: "1", msg: "success", data: { uuid: id } };
}, '生成唯一UUID接口'));
router.post('/utils/uuid', withSignAndLogging(async (event: H3Event) => {
  const id = uuidv4();
  return { code: "1", msg: "success", data: { uuid: id } };
}, '生成唯一UUID接口'));


export default useBase('/sdkapi', router.handler);