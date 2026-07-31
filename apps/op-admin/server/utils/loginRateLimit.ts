import { getRedisCluster } from './redis-cluster';

/**
 * 登录频率限制工具（基于 Redis）
 *
 * 两类限制（详见 sdkapi/login/dologin 需求）：
 *   1. IP 登录失败限制：同一 IP 在 1 分钟内失败 5 次即锁定 IP 30 分钟。
 *   2. 账号登录失败限制：同一账号在 10 分钟内失败 10 次即锁定账号 30 分钟。
 *
 * 登录成功后：清除该 IP / 账号的失败计数与失败锁（不再限制同一 IP 重复登录）。
 *
 * Redis 不可用时一律 fail-open（放行登录），仅在服务端记录告警日志，避免 Redis 抖动导致全员无法登录。
 * 用户名统一去空格、转小写后统计账号失败次数，防止大小写/空格绕过。
 */

// ===== 常量 =====
const IP_FAIL_WINDOW = 60;            // 60s  —— IP 失败计数窗口（1 分钟）
const IP_FAIL_THRESHOLD = 5;          // IP 在窗口内失败 5 次触发锁定
const IP_FAIL_LOCK_TTL = 30 * 60;     // 1800s —— IP 失败锁定 30 分钟
const ACCT_FAIL_WINDOW = 10 * 60;    // 600s —— 账号失败计数窗口（10 分钟）
const ACCT_FAIL_THRESHOLD = 10;       // 账号在窗口内失败 10 次触发锁定
const ACCT_FAIL_LOCK_TTL = 30 * 60;  // 1800s —— 账号失败锁定 30 分钟

// ===== Redis 键名 =====
const ipFailCntKey = (ip: string) => `login:ip_fail_cnt:${ip}`;
const ipFailLockKey = (ip: string) => `login:ip_fail_lock:${ip}`;
const acctFailCntKey = (name: string) => `login:acct_fail_cnt:${name}`;
const acctFailLockKey = (name: string) => `login:acct_fail_lock:${name}`;

// ===== 工具结果 =====
export interface LoginLimitResult {
  locked: boolean;
  retryAfter?: number;  // 剩余等待秒数
  message?: string;     // 提示文案
}

/**
 * 获取真实客户端 IP（阿里云 CDN 架构）。
 * 优先级：ali-cdn-real-ip → x-forwarded-for[0] → x-real-ip → 'unknown'。
 * 去除 IPv4-mapped IPv6 前缀 "::ffff:"。
 */
export function getClientIp(headers: Record<string, string>): string {
  const aliCdnRealIp = headers['ali-cdn-real-ip'] || '';
  const xForwardedFor = headers['x-forwarded-for'] || '';
  const xRealIp = headers['x-real-ip'] || '';
  let ip = aliCdnRealIp
    || (xForwardedFor ? xForwardedFor.split(',')[0].trim() : '')
    || xRealIp
    || 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip;
}

/**
 * 用户名归一化：去空格 + 转小写。
 * 仅用于账号失败计数键，防止大小写/空格绕过；不影响实际登录查询。
 */
export function normalizeUsername(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * 把剩余秒数格式化为 "X 分 Y 秒" / "X 小时 Y 分" 形式的等待文案。
 */
function formatWait(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.ceil((sec % 3600) / 60);
    return `${h} 小时 ${m} 分`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.ceil(sec % 60);
    return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
  }
  return `${sec} 秒`;
}

/**
 * 登录前预检失败锁：IP 失败锁 → 账号失败锁。
 * 任一命中即返回 { locked: true, retryAfter, message }。
 * IP 为 'unknown' 时跳过 IP 类检查，但仍检查账号锁。
 * Redis 异常时 fail-open（返回未锁定）。
 */
export async function checkLoginLimits(ip: string, username: string): Promise<LoginLimitResult> {
  const hasIp = !!(ip && ip !== 'unknown');
  const acct = normalizeUsername(username);

  try {
    const redis = getRedisCluster();

    if (hasIp) {
      // 1. IP 失败锁（1 分钟内失败 5 次触发，锁 30 分钟）
      const ipFailLockTtl = await redis.ttl(ipFailLockKey(ip));
      if (ipFailLockTtl > 0) {
        return { locked: true, retryAfter: ipFailLockTtl, message: `登录失败次数过多，IP 已被锁定，请 ${formatWait(ipFailLockTtl)} 后再试` };
      }
    }

    if (acct) {
      // 2. 账号失败锁（10 分钟内失败 10 次触发，锁 30 分钟）
      const acctFailLockTtl = await redis.ttl(acctFailLockKey(acct));
      if (acctFailLockTtl > 0) {
        return { locked: true, retryAfter: acctFailLockTtl, message: `该账号登录失败次数过多已被锁定，请 ${formatWait(acctFailLockTtl)} 后再试` };
      }
    }
  } catch (e: any) {
    // Redis 不可用：放行登录，避免影响正常用户
    console.warn(`[登录限流] 预检 Redis 异常，fail-open 放行: ${e?.message || e}`);
  }

  return { locked: false };
}

/**
 * 凭证错误后累加失败计数，达到阈值则写入 30 分钟锁。
 * 仅在“账号或密码错误”（用户未找到）分支调用，不用于封号/系统异常等非凭证失败。
 * Redis 异常时 fail-open（忽略）。
 */
export async function recordLoginFailure(ip: string, username: string): Promise<void> {
  const hasIp = !!(ip && ip !== 'unknown');
  const acct = normalizeUsername(username);

  try {
    const redis = getRedisCluster();

    if (hasIp) {
      // IP 失败计数：1 分钟窗口内累计 5 次即锁定 30 分钟
      const ipCnt = await redis.incr(ipFailCntKey(ip));
      if (ipCnt === 1) {
        await redis.expire(ipFailCntKey(ip), IP_FAIL_WINDOW);
      }
      if (ipCnt >= IP_FAIL_THRESHOLD) {
        await redis.set(ipFailLockKey(ip), '1', 'EX', IP_FAIL_LOCK_TTL);
        await redis.del(ipFailCntKey(ip));
        console.warn(`[登录限流] IP ${ip} 1 分钟内失败 ${ipCnt} 次，锁定 30 分钟`);
      }
    }

    if (acct) {
      // 账号失败计数：10 分钟窗口内累计 10 次即锁定 30 分钟
      const acctCnt = await redis.incr(acctFailCntKey(acct));
      if (acctCnt === 1) {
        await redis.expire(acctFailCntKey(acct), ACCT_FAIL_WINDOW);
      }
      if (acctCnt >= ACCT_FAIL_THRESHOLD) {
        await redis.set(acctFailLockKey(acct), '1', 'EX', ACCT_FAIL_LOCK_TTL);
        await redis.del(acctFailCntKey(acct));
        console.warn(`[登录限流] 账号 ${acct} 10 分钟内失败 ${acctCnt} 次，锁定 30 分钟`);
      }
    }
  } catch (e: any) {
    // Redis 不可用：不阻断登录失败响应本身
    console.warn(`[登录限流] 记录失败计数 Redis 异常，已忽略: ${e?.message || e}`);
  }
}

/**
 * 登录成功后：
 *   - 清除该 IP 的失败计数 / 失败锁；
 *   - 清除该账号的失败计数 / 失败锁。
 * 不再限制同一 IP 重复登录（登录成功后不写 IP 成功锁）。
 * Redis 异常时 fail-open（忽略）。
 */
export async function recordLoginSuccess(ip: string, username: string): Promise<void> {
  const hasIp = !!(ip && ip !== 'unknown');
  const acct = normalizeUsername(username);

  try {
    const redis = getRedisCluster();

    if (hasIp) {
      await redis.del(ipFailCntKey(ip));
      await redis.del(ipFailLockKey(ip));
      console.log(`[登录限流] IP ${ip} 登录成功，已清除失败计数`);
    }

    if (acct) {
      await redis.del(acctFailCntKey(acct));
      await redis.del(acctFailLockKey(acct));
    }
  } catch (e: any) {
    // Redis 不可用：不影响登录成功响应
    console.warn(`[登录限流] 记录成功状态 Redis 异常，已忽略: ${e?.message || e}`);
  }
}
