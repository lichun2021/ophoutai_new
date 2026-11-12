import { createError } from 'h3';
import { isIPv4 } from 'node:net';
import type { OpWorldConfig } from './serverlist';

const INTER_PUBLISH_PATH = '/v2/Inter/World/publish';

function isPrivateIpv4(hostname: string): boolean {
  if (!isIPv4(hostname)) return false;
  const [first, second] = hostname.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export async function publishOpServerConfig(world: OpWorldConfig): Promise<void> {
  if (world._id !== 111) {
    throw createError({ statusCode: 403, message: '当前 OP 发布通道仅授权区服 111' });
  }
  let url: URL;
  let headers: Record<string, string>;
  let body: string | URLSearchParams;
  let inter = false;
  try {
    const configuredUrl = process.env.OP_WORLD_PUBLISH_URL?.trim() || '';
    url = new URL(configuredUrl);
    inter = url.pathname === INTER_PUBLISH_PATH;
    if (inter) {
      const base = new URL(process.env.GM_INTER_BASE_URL || '');
      const secret = process.env.GM_INTER_SECRET;
      const literalHost = /^http:\/\/([0-9.]+)(?=[:/])/i.exec(configuredUrl)?.[1];
      const privateHttp = url.protocol === 'http:' && literalHost === url.hostname && isPrivateIpv4(url.hostname);
      if ((url.protocol !== 'https:' && !privateHttp) || url.origin !== base.origin ||
        url.href !== `${url.origin}${INTER_PUBLISH_PATH}` || base.href !== `${base.origin}/` || !secret?.trim()) {
        throw new Error();
      }
      headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      body = new URLSearchParams({ code: secret, world: JSON.stringify(world) });
    } else {
      const token = process.env.OP_WORLD_PUBLISH_TOKEN?.trim();
      const localHttp = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.hash ||
        url.pathname !== '/v2/game_world/publish' || url.search !== '?env=1' || !token || !/^[a-f0-9]{64}$/.test(token)) {
        throw new Error();
      }
      headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      body = JSON.stringify(world);
    }
  } catch {
    throw createError({
      statusCode: 503,
      message: inter
        ? '请配置与游戏 Inter 基础地址同源的区服发布接口及 Inter 密钥，HTTP 须使用私网 IPv4'
        : '请配置 OP 区服发布的 HTTPS 接口或本机转发地址，以及专用发布令牌',
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw publishUnconfirmed();
  }

  if (response.status >= 400 && response.status < 500) {
    throw createError({
      statusCode: 502,
      message: `OP 拒绝发布请求（HTTP ${response.status}），请检查接口权限和区服配置`,
    });
  }

  try {
    if (!response.ok) throw new Error();
    const payload = await response.json();
    if (payload?.code !== 200 || payload.result?.reloaded !== true) throw new Error();
    const applied = payload.result.world;
    if (!applied || !Object.entries(world).every(([field, expected]) => {
      const actual = applied[field];
      if (field === 'wsurl' && expected === '') return actual === undefined;
      if (!Array.isArray(expected)) return actual === expected;
      return Array.isArray(actual) && actual.length === expected.length
        && expected.every((part, index) => actual[index] === part);
    })) throw new Error();
  } catch {
    throw publishUnconfirmed();
  }
}

function publishUnconfirmed() {
  return createError({
    statusCode: 502,
    message: 'OP 发布结果待确认，请先核对 OP 区服配置和节点刷新状态',
  });
}
