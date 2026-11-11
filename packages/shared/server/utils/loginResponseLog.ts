import type { H3Event } from 'h3';

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function redactedLoginUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '[invalid URL]';
    const params = new URLSearchParams();
    if (url.searchParams.has('t')) params.set('t', '[redacted]');
    if (url.searchParams.get('auto_login') === 'true') params.set('auto_login', 'true');
    const redirect = url.searchParams.get('redirect');
    if (redirect?.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\')) {
      const target = new URL(redirect, url.origin);
      if (target.origin === url.origin) params.set('redirect', target.pathname);
    }
    const query = params.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return '[invalid URL]';
  }
}

export function logLoginResponse<T>(label: string, response: T, httpStatus: number): T {
  const result = fields(response);
  const data = fields(result.data);
  const user = fields(data.user);
  const code = integer(result.code);
  const z = integer(result.z);
  const requires2fa = code === 202 && data.require_2fa === true;
  const userId = integer(user.id) ?? integer(data.id) ?? integer(data.admin_id);
  const success = httpStatus < 400 && (z === 1 || code === 200 || (z === undefined && code === undefined && userId !== undefined));

  // Log an explicit projection. Response rows and SDK fields may contain credentials.
  console.info(`[${label}][返回] ${JSON.stringify({
    httpStatus, code, z,
    outcome: requires2fa ? '需要二步验证' : success ? '成功' : '失败',
    fields: Object.keys(result),
    dataFields: Object.keys(data),
    userFields: Object.keys(user),
    userId,
    level: integer(data.level),
    rechargeUrl: redactedLoginUrl(result.rechargeUrl ?? data.rechargeUrl),
    mallUrl: redactedLoginUrl(result.mallUrl ?? data.mallUrl),
    cdkUrl: redactedLoginUrl(result.cdkUrl ?? data.cdkUrl),
  })}`);
  return response;
}

export function withLoginResponseLog<T>(label: string, handler: (event: H3Event) => Promise<T>) {
  return async (event: H3Event): Promise<T> => {
    try {
      return logLoginResponse(label, await handler(event), event.node.res.statusCode);
    } catch (error) {
      const details = fields(error);
      logLoginResponse(label, null, integer(details.statusCode ?? details.status) ?? 500);
      throw error;
    }
  };
}
