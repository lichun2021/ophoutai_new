import { getRequestURL, type H3Event } from 'h3';

const REDACTED = '[redacted]';
const credentialField = /password|passwd|passphrase|pwd|token|secret|signature|cookie|authorization|session|ticket|proof|apikey|accesskey|privatekey|credential|verificationcode|totp|captcha/i;

function stripUrlCredentials(url: string): string {
  const delimiter = url.search(/[?#]/);
  const path = delimiter === -1 ? url : `${url.slice(0, delimiter)}?${REDACTED}`;
  return path.replace(/^(https?:\/\/)?[^/\s]+@/i, '$1');
}

function logResponse(event: H3Event, httpStatus: number, body: unknown) {
  const path = getRequestURL(event).pathname;
  if (path !== '/sdkapi' && !path.startsWith('/sdkapi/')) return;

  const sdkRoute = path.replace(/\/+$/, '').toLowerCase();
  const legacyLogin = sdkRoute === '/sdkapi/login/dologin';
  const externalTokenCheck = sdkRoute === '/sdkapi/user/check';
  const paymentCheckout = sdkRoute === '/sdkapi/unipay/pay';
  const entry = JSON.stringify({ method: event.method, path, httpStatus, body }, (key, value) => {
    const field = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (value !== null && value !== undefined && (
      credentialField.test(field) || field === 'sign' || field === 'signkey' ||
      (legacyLogin && (field === 'c' || field === 'd')) ||
      (externalTokenCheck && field === 'data') ||
      (paymentCheckout && field === 'data' && typeof value === 'string' && value.length > 0)
    )) return REDACTED;

    if (typeof value === 'bigint') return String(value);
    if (typeof value !== 'string') return value;
    if (value.startsWith('/')) return stripUrlCredentials(value);
    return value.replace(/https?:\/\/[^\s<>"']+/gi, stripUrlCredentials);
  });
  console.info(`[SDK][返回] ${entry}`);
}

export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('afterResponse', (event, response) => {
    logResponse(event, event.node.res.statusCode, response?.body);
  });

  nitroApp.hooks.hook('error', (error, { event, tags }) => {
    // Nitro's error handler sends thrown HTTP errors directly and skips afterResponse.
    if (event && tags?.includes('request') && !tags.includes('response')) {
      const statusCode = error.statusCode || 500;
      logResponse(event, statusCode, { statusCode, statusMessage: error.statusMessage });
    }
  });
});
