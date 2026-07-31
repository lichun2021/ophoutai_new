import { getRedisCluster } from './redis-cluster';

/**
 * 登录频率限制工具（基于 Redis）
 *
 * 三类限制（详见 sdkapi/login/dologin 需求 + 防撞库加固）：
 *   1. IP 登录失败限制：同一 IP 在 1 分钟内失败 5 次即锁定 IP 30 分钟。
 *   2. 账号登录失败限制：同一账号在 10 分钟内失败 10 次即锁定账号 30 分钟。
 *   3. IP 黑名单：一个 IP 触发“IP 失败锁”累计达到 3 次（即反复撞库），升级为 24 小时黑名单，
 *      guard 层最先检查，命中直接 403，不进入业务逻辑。
 *
 * 防撞库加固：请求被 IP 失败锁拦截时（账号锁尚未触发），仍对该请求的用户名累计一次账号失败计数，
 *   使被撞的账号更快达到阈值被账号锁锁死（攻击者换 IP 也登不进这些账号）。
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
const IP_BLACKLIST_TTL = 24 * 60 * 60; // 86400s —— IP 黑名单封禁 24 小时
const IP_BLACKLIST_TRIGGER = 3;        // IP 触发“IP 失败锁”累计 3 次升级为 24h 黑名单

// ===== Redis 键名 =====
const ipFailCntKey = (ip: string) => `login:ip_fail_cnt:${ip}`;
const ipFailLockKey = (ip: string) => `login:ip_fail_lock:${ip}`;
const ipLockTriggerCntKey = (ip: string) => `login:ip_lock_trigger_cnt:${ip}`; // IP 触发失败锁的累计次数（用于升级黑名单）
const ipBlacklistKey = (ip: string) => `login:ip_blacklist:${ip}`;
const acctFailCntKey = (name: string) => `login:acct_fail_cnt:${name}`;
const acctFailLockKey = (name: string) => `login:acct_fail_lock:${name}`;

// ===== 工具结果 =====
export interface LoginLimitResult {
  locked: boolean;
  retryAfter?: number;  // 剩余等待秒数
  message?: string;     // 提示文案
  /** 命中的锁类型：blacklist | ip_fail | account（便于 guard 区分处理） */
  reason?: 'blacklist' | 'ip_fail' | 'account';
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
 * IP 黑名单预检：命中黑名单的 IP 直接判定为封禁（24h）。
 * guard 层最先调用，命中即返回 403，不进入业务逻辑、不累计任何计数。
 * Redis 异常时 fail-open（放行）。
 */
export async function checkIpBlacklist(ip: string): Promise<LoginLimitResult> {
  if (!ip || ip === 'unknown') return { locked: false };
  try {
    const redis = getRedisCluster();
    const ttl = await redis.ttl(ipBlacklistKey(ip));
    if (ttl > 0) {
      return { locked: true, reason: 'blacklist', retryAfter: ttl, message: `该 IP 因频繁攻击已被封禁，请 ${formatWait(ttl)} 后再试` };
    }
  } catch (e: any) {
    console.warn(`[登录限流] 黑名单预检 Redis 异常，fail-open 放行: ${e?.message || e}`);
  }
  return { locked: false };
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
        return { locked: true, reason: 'ip_fail', retryAfter: ipFailLockTtl, message: `登录失败次数过多，IP 已被锁定，请 ${formatWait(ipFailLockTtl)} 后再试` };
      }
    }

    if (acct) {
      // 2. 账号失败锁（10 分钟内失败 10 次触发，锁 30 分钟）
      const acctFailLockTtl = await redis.ttl(acctFailLockKey(acct));
      if (acctFailLockTtl > 0) {
        return { locked: true, reason: 'account', retryAfter: acctFailLockTtl, message: `该账号登录失败次数过多已被锁定，请 ${formatWait(acctFailLockTtl)} 后再试` };
      }
    }
  } catch (e: any) {
    // Redis 不可用：放行登录，避免影响正常用户
    console.warn(`[登录限流] 预检 Redis 异常，fail-open 放行: ${e?.message || e}`);
  }

  return { locked: false };
}

/**
 * 累加账号失败计数（私有）：10 分钟窗口内累计 10 次即锁定 30 分钟。
 * 抽出供 recordLoginFailure（凭证错误）与防撞库加固（IP 锁拦截时）复用。
 */
async function incrAccountFailure(redis: any, acct: string): Promise<void> {
  if (!acct) return;
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

        // 升级黑名单：该 IP 触发“IP 失败锁”累计达到 3 次，说明在反复撞库，升级为 24h 黑名单
        const triggerCnt = await redis.incr(ipLockTriggerCntKey(ip));
        if (triggerCnt === 1) {
          // 触发次数计数保留较长时间（7 天），用于统计该 IP 历史撞库次数
          await redis.expire(ipLockTriggerCntKey(ip), 7 * 24 * 60 * 60);
        }
        if (triggerCnt >= IP_BLACKLIST_TRIGGER) {
          await redis.set(ipBlacklistKey(ip), '1', 'EX', IP_BLACKLIST_TTL);
          console.warn(`[登录限流] IP ${ip} 反复撞库（触发失败锁 ${triggerCnt} 次），升级 24h 黑名单`);
        }
      }
    }

    // 账号失败计数
    await incrAccountFailure(redis, acct);
  } catch (e: any) {
    // Redis 不可用：不阻断登录失败响应本身
    console.warn(`[登录限流] 记录失败计数 Redis 异常，已忽略: ${e?.message || e}`);
  }
}

/**
 * 防撞库加固：请求被 IP 失败锁拦截（账号锁尚未触发）时，仍对该请求的用户名累计一次账号失败计数。
 * 使被撞的账号更快达到阈值被账号锁锁死——攻击者换 IP 也登不进这些账号。
 * 仅累计账号维度（IP 维度已在 recordLoginFailure 处理，此处不重复）。
 * Redis 异常时 fail-open（忽略）。
 */
export async function incrementAccountFailure(username: string): Promise<void> {
  const acct = normalizeUsername(username);
  if (!acct) return;
  try {
    const redis = getRedisCluster();
    await incrAccountFailure(redis, acct);
  } catch (e: any) {
    console.warn(`[登录限流] 防撞库账号计数 Redis 异常，已忽略: ${e?.message || e}`);
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
