import { H3Event, getHeader, getCookie, setCookie, createError } from 'h3';
import jwt from 'jsonwebtoken';

// JWT Payload 类型定义
export interface JWTPayload {
  userId: number;           // 用户ID
  username: string;         // 用户名
  channelCode: string;      // 渠道代码
  iat: number;              // 签发时间 (issued at)
  exp: number;              // 过期时间 (expiration)
}

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '4h';
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'quantum_auth_token';
const JWT_COOKIE_MAX_AGE = parseInt(process.env.JWT_COOKIE_MAX_AGE || '14400000'); // 4小时 (毫秒)

/**
 * 生成 JWT Token
 * @param payload 用户信息 (不包含 iat, exp)
 * @returns JWT token 字符串
 */
export function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 环境变量未配置');
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * 验证 JWT Token
 * @param token JWT token 字符串
 * @returns 解析后的 payload
 * @throws 如果 token 无效或过期
 */
export function verifyJWT(token: string): JWTPayload {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET 环境变量未配置');
  }

  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token 已过期，请重新登录');
    } else if (err.name === 'JsonWebTokenError') {
      throw new Error('Token 无效');
    } else {
      throw new Error('Token 验证失败');
    }
  }
}

/**
 * 从请求中提取 JWT Token (支持多种来源，按优先级)
 * 1. Authorization header (Bearer token)
 * 2. HttpOnly Cookie
 * @param event H3Event 对象
 * @returns token 字符串，如果不存在则返回 null
 */
function extractToken(event: H3Event): string | null {
  // 优先从 Authorization header 获取 (标准 REST API 方式)
  const authHeader = getHeader(event, 'authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 其次从 HttpOnly Cookie 获取 (浏览器环境更安全)
  const cookieToken = getCookie(event, JWT_COOKIE_NAME);
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * 认证中间件 - 从请求中提取并验证 JWT，返回用户信息
 * @param event H3Event 对象
 * @returns 验证通过的 JWTPayload
 * @throws 401 错误 (未登录或 token 无效)
 */
export async function requireAuth(event: H3Event): Promise<JWTPayload> {
  const token = extractToken(event);

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: '未登录或登录已过期，请先登录'
    });
  }

  try {
    const payload = verifyJWT(token);

    // 将用户信息存储到 event.context，方便后续使用
    event.context.auth = payload;

    return payload;
  } catch (err: any) {
    throw createError({
      statusCode: 401,
      statusMessage: err.message || 'Token 验证失败，请重新登录'
    });
  }
}

/**
 * 可选认证中间件 - 如果有 token 则验证，没有则返回 null (不抛出错误)
 * 用于某些接口既支持游客访问，也支持登录用户访问的场景
 * @param event H3Event 对象
 * @returns 验证通过的 JWTPayload 或 null
 */
export async function optionalAuth(event: H3Event): Promise<JWTPayload | null> {
  const token = extractToken(event);

  if (!token) {
    return null;
  }

  try {
    const payload = verifyJWT(token);
    event.context.auth = payload;
    return payload;
  } catch (err) {
    // Token 无效时，视为未登录 (不抛出错误)
    return null;
  }
}

/**
 * 设置 JWT Token 到 HttpOnly Cookie
 * @param event H3Event 对象
 * @param token JWT token 字符串
 * @param maxAge Cookie 过期时间 (秒)，默认使用环境变量配置
 */
export function setAuthCookie(event: H3Event, token: string, maxAge?: number): void {
  const cookieMaxAge = maxAge || Math.floor(JWT_COOKIE_MAX_AGE / 1000); // 转换为秒

  setCookie(event, JWT_COOKIE_NAME, token, {
    httpOnly: true,           // 防止 XSS 攻击
    secure: process.env.NODE_ENV === 'production',  // 生产环境强制 HTTPS
    sameSite: 'lax',          // CSRF 防护
    path: '/',
    maxAge: cookieMaxAge,
  });
}

/**
 * 清除认证 Cookie (用于登出)
 * @param event H3Event 对象
 */
export function clearAuthCookie(event: H3Event): void {
  setCookie(event, JWT_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,  // 立即过期
  });
}

/**
 * 刷新 Token (延长有效期)
 * 通常在 token 快过期时调用，生成新的 token
 * @param oldToken 旧的 JWT token
 * @returns 新的 JWT token
 */
export function refreshJWT(oldToken: string): string {
  const payload = verifyJWT(oldToken);

  // 生成新 token (移除 iat, exp)
  const { iat, exp, ...userInfo } = payload;
  return signJWT(userInfo);
}
