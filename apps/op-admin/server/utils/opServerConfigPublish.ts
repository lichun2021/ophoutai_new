import { createError } from 'h3';
import type { OpWorldConfig } from './serverlist';

export async function publishOpServerConfig(world: OpWorldConfig): Promise<void> {
  if (world._id !== 111) {
    throw createError({ statusCode: 403, message: '当前 OP 发布通道仅授权区服 111' });
  }
  const token = process.env.OP_WORLD_PUBLISH_TOKEN?.trim();
  let url: URL;
  try {
    url = new URL(process.env.OP_WORLD_PUBLISH_URL || '');
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.hash ||
      url.pathname !== '/v2/game_world/publish' || url.search !== '?env=1' || !token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error();
    }
  } catch {
    throw createError({
      statusCode: 503,
      message: '请配置 OP 区服发布的 HTTPS 接口或本机转发地址，以及专用发布令牌',
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(world),
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
