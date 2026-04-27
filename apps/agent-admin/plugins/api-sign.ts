// 纯前端 MD5（避免依赖 Node/第三方包）
function md5Hex(s: string): string {
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
  return hex(md51(toUtf8(s)));
}
function formatYmd(d: Date) {
  // 使用 UTC，避免前后端本地时区差异
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}${m}${day}`;
}
function calcDailyToken(at: Date, key: string) { return md5Hex(`${formatYmd(at)}${key}`); }
function buildSignBase(params: Record<string, any>) {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== undefined && v !== null)
    .map(([k, v]) => [String(k), String(v)] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const apiKey = config.public?.apiSignKey || 'q12eiedu24fi3rf434g34g';
  // 全局记录已签名的请求（用 WeakSet 记录 options 对象，避免内存泄漏）
  const signedRequests = new WeakSet<any>();

  // 包装 $fetch：把 ts/nonce/sign 附加到 query（通过 options.params）
  const signedFetch = $fetch.create({
    onRequest({ request, options }) {
      // 内部标记：已签名则直接放行
      if (signedRequests.has(options)) {
        // try { console.log('[API_SIGN][plugin]', { env: (typeof window === 'undefined') ? 'server' : 'client', path: typeof request === 'string' ? request : 'unknown', skipped: true }); } catch {}
        return;
      }
      if ((options as any).__api_signed) return;

      if (typeof request !== 'string') return;
      const baseOrigin = (process as any).server ? 'http://localhost' : (globalThis as any).window?.location?.origin || 'http://localhost';
      const url = new URL(request, baseOrigin);
      const pathname = url.pathname || '';
      if (!pathname.startsWith('/api')) return;

      // 跳过用户登录接口（已有自己的签名机制：ts+sig）
      if (pathname === '/api/user/login') return;

      (options as any).credentials = 'include';

      // 已签名检测：检查 URL、params、query 是否已有 __signed 标记
      const extraParams: any = (options as any).params || (options as any).query || {};
      if (url.searchParams.has('__signed') || extraParams.__signed) {
        (options as any).headers = { ...(options?.headers as any || {}), 'x-signed': '1' } as any;
        (options as any).__api_signed = true;
        // try { console.log('[API_SIGN][plugin]', { env: (typeof window === 'undefined') ? 'server' : 'client', path: pathname, reused: true }); } catch {}
        return;
      }
      const urlSigned = url.searchParams.has('ts') && url.searchParams.has('nonce') && url.searchParams.has('sign');
      const methodUpper = String((options as any)?.method || 'GET').toUpperCase();
      let bodySigned = false;
      if (!urlSigned && methodUpper !== 'GET' && methodUpper !== 'HEAD') {
        const b: any = (options as any).body;
        if (b instanceof FormData) {
          bodySigned = b.has('ts') && b.has('nonce') && b.has('sign');
        } else if (b && typeof b === 'object') {
          bodySigned = ('ts' in b) && ('nonce' in b) && ('sign' in b);
        }
      }
      if (urlSigned || bodySigned) {
        (options as any).headers = { ...(options?.headers as any || {}), 'x-signed': '1' } as any;
        (options as any).__api_signed = true;
        // try { console.log('[API_SIGN][plugin]', { env: (typeof window === 'undefined') ? 'server' : 'client', path: pathname, reused: true }); } catch {}
        return;
      }

      // extraParams 已在上面读取过了，这里直接使用

      // 生成 ts 与 nonce，并计算 sign
      const ts = Math.floor(Date.now() / 1000);
      const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const dateForToken = new Date(ts * 1000);
      const ymd = formatYmd(dateForToken);
      const token = calcDailyToken(dateForToken, apiKey);
      const payload = { ts: String(ts), nonce } as any;
      const sign = md5Hex(buildSignBase(payload) + token);



      // 生成签名
      const method2 = methodUpper;
      if (method2 === 'GET' || method2 === 'HEAD') {
        // GET/HEAD：将签名参数放到 query，并加 __signed 标记
        const finalParams = { ...(extraParams || {}), ts, nonce, sign, __signed: '1' } as any;
        (options as any).params = finalParams;
      } else {
        // 非 GET：优先写入 body
        if (options.body instanceof FormData) {
          try {
            (options.body as FormData).set('ts', String(ts));
            (options.body as FormData).set('nonce', nonce);
            (options.body as FormData).set('sign', sign);
          } catch {
            // 回退到 query
            const finalParams = { ...(extraParams || {}), ts, nonce, sign } as any;
            (options as any).params = finalParams;
          }
        } else if (options.body && typeof options.body === 'object') {
          (options.body as any).ts = ts;
          (options.body as any).nonce = nonce;
          (options.body as any).sign = sign;
          (options.body as any).__signed = '1';
          // 清理 params 防止重复，但保留 __signed 标记
          (options as any).params = extraParams && Object.keys(extraParams).length ? { ...extraParams, __signed: '1' } : { __signed: '1' };
        } else {
          // 无 body：创建 JSON body
          (options as any).body = { ts, nonce, sign } as any;
          (options as any).params = extraParams && Object.keys(extraParams).length ? { ...extraParams, __signed: '1' } : { __signed: '1' };
          (options as any).headers = { ...(options?.headers as any || {}), 'Content-Type': 'application/json' } as any;
        }
      }

      (options as any).headers = { ...(options?.headers as any || {}), 'x-signed': '1' } as any;
      (options as any).__api_signed = true;
      signedRequests.add(options);

      // console.log('[API_SIGN][plugin]', {
      //   env: (typeof window === 'undefined') ? 'server' : 'client',
      //   path: pathname,
      //   ts,
      //   nonce,
      //   sign,
      //   salt: apiKey,
      //   token,
      //   base: buildSignBase(payload),
      //   ymd
      // });
    }
  });

  // 将带签名的 fetch 暴露为全局与 nuxt 实例的 $fetch
  try { (globalThis as any).$fetch = signedFetch as any; } catch { }
  try { (nuxtApp as any).$fetch = signedFetch as any; } catch { }

  // 兜底：拦截原生 fetch（仅处理未被 $fetch 签名的请求）
  if (typeof window !== 'undefined' && typeof (globalThis as any).fetch === 'function') {
    const originalFetch = (globalThis as any).fetch.bind(globalThis);
    (globalThis as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const baseOrigin = (globalThis as any).window?.location?.origin || 'http://localhost';
        const method = String((init && (init as any).method) || 'GET').toUpperCase();
        const url = new URL(typeof input === 'string' ? input : (input as any).url ?? String(input), baseOrigin);
        const pathname = url.pathname || '';
        const sameOrigin = url.origin === baseOrigin;
        if (!sameOrigin || !pathname.startsWith('/api')) return originalFetch(input as any, init as any);

        // 跳过用户登录接口（已有自己的签名机制：ts+sig）
        if (pathname === '/api/user/login') return originalFetch(input as any, init as any);

        const newInit: RequestInit = { ...(init || {}) };
        newInit.credentials = 'include';

        // 若 URL 已带 __signed 标记，说明已被 $fetch 签名，直接放行
        if (url.searchParams.has('__signed')) {
          return originalFetch(url.toString(), newInit);
        }
        // 若已带完整签名参数，直接放行
        if (url.searchParams.has('ts') && url.searchParams.has('nonce') && url.searchParams.has('sign')) {
          return originalFetch(url.toString(), newInit);
        }
        // POST 等：检查 body 是否已带 __signed 标记
        if (method !== 'GET' && method !== 'HEAD') {
          const b: any = init?.body;
          if (typeof b === 'string') {
            try {
              const parsed = JSON.parse(b);
              if (parsed && parsed.__signed === '1') {
                return originalFetch(url.toString(), newInit);
              }
            } catch { }
          }
        }

        // 生成签名
        const ts = Math.floor(Date.now() / 1000);
        const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const dateForToken = new Date(ts * 1000);
        const ymd = formatYmd(dateForToken);
        const token = calcDailyToken(dateForToken, apiKey);
        const base = buildSignBase({ ts: String(ts), nonce });
        const sign = md5Hex(base + token);

        const existingHeaders = (init?.headers as any) || {};
        const newHeaders = { ...existingHeaders, 'x-signed': '1' };

        if (method === 'GET' || method === 'HEAD') {
          url.searchParams.set('ts', String(ts));
          url.searchParams.set('nonce', nonce);
          url.searchParams.set('sign', sign);
          url.searchParams.set('__signed', '1');
        } else {
          // POST 等：尝试写入 body
          if (typeof newInit.body === 'string') {
            try {
              const parsed = JSON.parse(newInit.body);
              if (parsed && typeof parsed === 'object') {
                parsed.ts = ts;
                parsed.nonce = nonce;
                parsed.sign = sign;
                newInit.body = JSON.stringify(parsed);
                newHeaders['Content-Type'] = 'application/json';
              } else {
                url.searchParams.set('ts', String(ts));
                url.searchParams.set('nonce', nonce);
                url.searchParams.set('sign', sign);
              }
            } catch {
              url.searchParams.set('ts', String(ts));
              url.searchParams.set('nonce', nonce);
              url.searchParams.set('sign', sign);
            }
          } else if (newInit.body instanceof FormData) {
            try {
              (newInit.body as FormData).set('ts', String(ts));
              (newInit.body as FormData).set('nonce', nonce);
              (newInit.body as FormData).set('sign', sign);
            } catch {
              url.searchParams.set('ts', String(ts));
              url.searchParams.set('nonce', nonce);
              url.searchParams.set('sign', sign);
            }
          } else if (newInit.body && (newInit.body as any) instanceof URLSearchParams) {
            (newInit.body as URLSearchParams).set('ts', String(ts));
            (newInit.body as URLSearchParams).set('nonce', nonce);
            (newInit.body as URLSearchParams).set('sign', sign);
          } else if (!newInit.body) {
            newInit.body = JSON.stringify({ ts, nonce, sign });
            newHeaders['Content-Type'] = 'application/json';
          } else {
            url.searchParams.set('ts', String(ts));
            url.searchParams.set('nonce', nonce);
            url.searchParams.set('sign', sign);
          }
        }

        newInit.headers = newHeaders;
        // console.log('[API_SIGN][fetch-fallback]', { 
        //   path: pathname, 
        //   ts, 
        //   nonce, 
        //   sign, 
        //   salt: apiKey, 
        //   token, 
        //   base, 
        //   ymd 
        // });
        return originalFetch(url.toString(), newInit);
      } catch {
        return originalFetch(input as any, init as any);
      }
    };
  }
});


