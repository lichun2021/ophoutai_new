import { H3Event, createError } from 'h3';
import { getRedisCluster } from './redis-cluster';

const DEFAULT_SALT = process.env.API_SIGN_KEY || 'q12eiedu24fi3rf434g34g';
const DEFAULT_SKEW_SECONDS = parseInt(process.env.API_SIGN_SKEW_SEC || '60', 10); // 1 分钟

// 启动时打印一次，确认运行时使用的 salt 值
console.log('[API_SIGN][INIT] ================================');
console.log('[API_SIGN][INIT] process.env.API_SIGN_KEY =', process.env.API_SIGN_KEY ? `"${process.env.API_SIGN_KEY}"` : '(未设置，使用默认值)');
console.log('[API_SIGN][INIT] DEFAULT_SALT =', `"${DEFAULT_SALT}"`);
console.log('[API_SIGN][INIT] ================================');

// 使用与前端完全一致的 MD5 实现
function md5(input: string): string {
  // 与前端保持一致：unescape(encodeURIComponent(str)) 将 Unicode 正确转为 UTF-8 字节
  function toUtf8(str: string) { return unescape(encodeURIComponent(str)); }
  function rhex(n: number) {
    const hex = '0123456789abcdef';
    let s = '';
    for (let j = 0; j < 4; j++) s += hex.charAt((n >> (j * 8 + 4)) & 0x0f) + hex.charAt((n >> (j * 8)) & 0x0f);
    return s;
  }
  function add32(a: number, b: number) { return (a + b) & 0xffffffff; }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(c ^ (b | ~d), a, b, x, s, t);
  function md5blk(s: string) {
    const md5blks = Array(16) as number[];
    for (let i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  function md5cycle(x: number[], k: number[]) {
    let [a, b, c, d] = x;
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = hh(a, b, c, d, k[5], 4, -1444681467); d = hh(d, a, b, c, k[8], 11, -51403784); c = hh(c, d, a, b, k[11], 16, 1735328473); b = hh(b, c, d, a, k[14], 23, -1926607734);
    a = hh(a, b, c, d, k[1], 4, -378558); d = hh(d, a, b, c, k[4], 11, -2022574463); c = hh(c, d, a, b, k[7], 16, 1839030562); b = hh(b, c, d, a, k[10], 23, -35309556);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function md51(str: string) {
    let n = str.length, i = 0;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(str.substring(i - 64, i)));
    str = str.substring(i - 64);
    const tail = Array(16).fill(0) as number[];
    for (i = 0; i < str.length; i++) tail[i >> 2] |= str.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8; md5cycle(state, tail);
    return state;
  }
  function hex(x: number[]) { return rhex(x[0]) + rhex(x[1]) + rhex(x[2]) + rhex(x[3]); }
  return hex(md51(toUtf8(input)));
}

function formatYmd(d: Date): string {
  // 使用 UTC，避免客户端与服务端本地时区差异导致日期不同
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}${m}${day}`;
}

export function calcDailyToken(at: Date, key: string = DEFAULT_SALT): string {
  return md5(`${formatYmd(at)}${key}`);
}

function normalizeTs(raw: any): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // 支持秒或毫秒
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

export function buildSignBase(params: Record<string, any>): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== undefined && v !== null)
    .map(([k, v]) => [String(k), String(v)] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0])); // ASCII 升序
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}

export function calcSign(params: Record<string, any>, token: string): string {
  const base = buildSignBase(params);
  return md5(base + token);
}

export function shouldBypass(pathname: string): boolean {
  // 第三方回调等无法携带签名的接口，放行
  const bypassList = [
    '/api/payment/third-party-notify',
    '/api/payment/cashier-notify',
    '/api/client/cdk/redeem',
    '/api/internal/',  // 内部API（供后台脚本调用）
  ];
  return bypassList.some(p => pathname.startsWith(p));
}

export async function verifyApiSignature(
  event: H3Event,
  pathname: string,
  method: string,
  queryParams: any,
  requestBody: any,
  options?: { skewSeconds?: number; salt?: string }
) {
  if (shouldBypass(pathname)) return; // 放行

  const skew = options?.skewSeconds ?? DEFAULT_SKEW_SECONDS;
  const salt = options?.salt ?? DEFAULT_SALT;

  const params: Record<string, any> = {
    ...(queryParams || {}),
    ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || 'GET').toUpperCase()) ? (requestBody || {}) : {})
  };


  const ts = normalizeTs(params.ts);
  const providedSign = String(params.sign || '');
  const nonce = String(params.nonce || '');


  if (!ts || !providedSign) {
    console.error('[API_SIGN][FAIL] 缺少 ts 或 sign!', { ts, providedSign });
    throw createError({ statusCode: 401, statusMessage: 'missing_ts_or_sign' });
  }
  if (!nonce) {
    console.error('[API_SIGN][FAIL] 缺少 nonce!');
    throw createError({ statusCode: 401, statusMessage: 'missing_nonce' });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skewDiff = Math.abs(nowSec - ts);
  if (skewDiff > skew) {
    console.error('[API_SIGN][FAIL] 时间偏差过大!', { nowSec, ts, diff: skewDiff, skew });
    throw createError({ statusCode: 401, statusMessage: 'ts_skew' });
  }

  const dateForToken = new Date(ts * 1000);
  const ymdForLog = formatYmd(dateForToken);
  const token = calcDailyToken(dateForToken, salt);
  const baseForLog = buildSignBase({ ts, nonce });
  // 仅使用固定参数参与签名：ts 与 nonce
  const expected = calcSign({ ts, nonce }, token);

  if (expected !== providedSign) {
    const base = buildSignBase({ ts, nonce });
    const ymd = formatYmd(dateForToken);
    console.warn('[API_SIGN][server] invalid_sign', {
      path: pathname,
      method,
      ts,
      salt,
      nonce,
      expected,
      provided: providedSign,
      token,
      base,
      ymd
    });
    throw createError({ statusCode: 401, statusMessage: 'invalid_sign' });
  }

  // Redis 去重：nonce + 路径 + 方法
  try {
    const redis = getRedisCluster();
    const key = `api:nonce:${method}:${pathname}:${nonce}`;
    // @ts-ignore ioredis supports set with NX EX
    const result = await redis.set(key, '1', 'EX', skew, 'NX');
    if (result !== 'OK') {
      throw createError({ statusCode: 401, statusMessage: 'replay_detected' });
    }
  } catch (e: any) {
    if (e?.statusCode) throw e;
    // 如果Redis不可用，保守起见仍然允许请求通过，避免业务中断；可改为拒绝
    // console.error('Nonce check skipped due to Redis error:', e?.message || e);
  }
}


