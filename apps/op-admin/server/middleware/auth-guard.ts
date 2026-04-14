import { defineEventHandler, getRequestURL, getCookie, setResponseStatus, sendRedirect, createError, getHeader } from 'h3';
import { verifyAdminSession } from '../utils/auth';

// 服务端中间件：拦截受保护的页面路由（不拦 /sdkapi/** 与公开页）
// 仅针对页面请求（SSR/直访）；API与 /sdkapi/** 保持现有逻辑
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const rawPath = url.pathname || '/';
  // 统一去掉结尾斜杠，避免 /game-list/ 绕过精确匹配
  const path = (rawPath.replace(/\/+$/, '') || '/');
  const host = String(getHeader(event, 'host') || '').toLowerCase();

  // 域名级别拦截：cashier 域名不允许访问后台登录与GM接口
  if (host === 'cashier.redalert66.com') {
    if (path === '/admin/login' || path === '/api/admin/login' || path.startsWith('/api/gm/')) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden on this domain' });
    }
  }

  // 0) 统一会话读取（API 与 页面均使用）
  const logged = getCookie(event, 'auth_logged_in');
  const isUser = getCookie(event, 'auth_is_user');

  // 显式放行 /sdkapi/**
  if (path.startsWith('/sdkapi/')) return;

  // 1) API 接口鉴权与白名单
  if (path.startsWith('/api/')) {
    // 白名单：不需要登录
    const apiPublicAllow = (
      // 支付回调（仅这两类回调对外开放）
      path.startsWith('/api/payment/third-party-notify') ||
      path.startsWith('/api/payment/cashier-notify') ||
      // 内部API（供后台脚本调用，无需认证）
      path.startsWith('/api/internal/') ||
      // 登录/注册/校验（对外开放以便登录流程）
      path === '/api/admin/login' ||
      path === '/api/user/login' ||
      path === '/api/user/register' ||
      path === '/api/user/check-channel' ||
      path === '/api/user/check' ||
      // Google 2FA 绑定（对外开放以便初始化流程）
      path === '/api/admin/2fa/generate' ||
      path === '/api/admin/2fa/confirm' ||
      // 第三方 token 下发（外部触发的快速注册）
      path === '/api/user/token' ||
      // CDK 兑换（对外开放）
      path === '/api/client/cdk/redeem' ||
      // CDK 服务器列表（对外开放，用于CDK页拉取区服）
      path === '/api/client/cdk/servers' ||
      // 客户端服务器列表（用于CDK页拉取区服）
      path === '/api/client/servers'
    );
    if (apiPublicAllow) return;

    // 路由前缀要求角色
    if (path.startsWith('/api/admin/') || path.startsWith('/api/gm/')) {
      // 管理端与 GM 接口：必须有有效的管理员签名会话，并与 Authorization 一致
      const sid = getCookie(event, 'admin_sid');
      const v = verifyAdminSession(sid);
      const authz = getHeader(event, 'authorization');
      const authId = authz ? parseInt(String(authz)) : NaN;
      if (!v.ok) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
      }
      // 如提供了 header，且与 cookie 解出的 id 不一致，则拒绝
      if (!isNaN(authId) && authId !== v.adminId) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
      }
      // 将管理员ID写入上下文，便于控制器读取
      try {
        // @ts-ignore
        event.context.adminId = v.adminId;
      } catch {}
      // 若缺少 authorization 头，自动注入，兼容依赖该头的控制器
      if (!authz) {
        try {
          // @ts-ignore Node 原始 headers 可写入（用于向下游兼容）
          event.node.req.headers['authorization'] = String(v.adminId);
        } catch {}
      }
      // 仅管理员可访问
      if (isUser === 'true') {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
      }
      return; // 管理端通过
    }

    // 需登录（非管理端/GM）
    if (!logged) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }

    if (path.startsWith('/api/client/')) {
      // 仅普通用户可访问
      if (isUser !== 'true') {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
      }
    }
    return; // 通过
  }

  // 2) 公开页面放行（登录/注册/支付展示页等）
  const publicPages = new Set<string>([
    '/',
    '/admin/login',
    '/user/login',
    '/user/register',
    '/user/payment-success',
    '/user/qrcode',
    '/user/customer-service-payment',
    '/user/balance-insufficient',
    '/user/cdk-redeem',
  ]);
  if (publicPages.has(path)) return;

  // 3) 仅对页面路由做保护：/admin/**、/data/**、/pages 下的后台页面等
  const isAdminArea = (
    path.startsWith('/admin') ||
    path.startsWith('/data') ||
    path === '/home' ||
    path === '/game-list' ||
    path === '/channel-list' ||
    path.startsWith('/pages/admin')
  );
  const needAuth = isAdminArea;
  if (!needAuth) return;

  // 4) 简单会话检查：读取前端已有的 localStorage 无法在服务端使用，这里从 Cookie 读取占位会话
  //    后续可改为登录成功后设置 HttpOnly Cookie: auth_logged_in=true; Path=/; Secure; SameSite=Lax

  // 未登录：重定向到对应登录页（后台默认跳转管理员登录，用户页跳用户登录）
  if (!logged) {
    const target = isAdminArea ? '/admin/login' : '/user/login';
    // SSR 环境用 302 跳转
    setResponseStatus(event, 302);
    return sendRedirect(event, target);
  }

  // 普通用户禁止访问 /admin/**
  if (isUser === 'true' && path.startsWith('/admin')) {
    setResponseStatus(event, 302);
    return sendRedirect(event, '/user/home');
  }
});


