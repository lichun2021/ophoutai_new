import { isIPv4 } from 'node:net';

export interface OpPaymentOrderIdentity {
  id: string;
  worldId: number;
  wuid: string;
}

export interface OpPaymentOrderQuote extends OpPaymentOrderIdentity {
  sku: string;
  subAccountId: string;
  amountMinor: number;
  currency: 'CNY';
  expiresAt: number;
  status: 'created';
}

export interface OpPaymentReceipt extends OpPaymentOrderIdentity {
  sku: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  paidAt: number;
}

export interface OpPaymentInterConfig {
  readonly baseUrl: string;
  readonly secret: string;
  readonly timeoutMs: number;
}

export interface OpPaymentOrderConfig extends OpPaymentInterConfig {
  readonly orderUrl: string;
}

const ORDER_PATH = '/v2/Inter/Payment/order';
const PAYMENT_PATH = '/v2/Inter/done_pay_tranid';
const MAX_WUID = 9223372036854775807n;
const MAX_UNIX_SECONDS = 9_999_999_999;

function privateHttpOrigin(raw: string, url: URL): boolean {
  const literal = /^http:\/\/([0-9.]+)(?=[:/]|$)/i.exec(raw)?.[1];
  if (url.protocol !== 'http:' || literal !== url.hostname || !isIPv4(url.hostname)) return false;
  const [first, second] = url.hostname.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function getOpPaymentInterConfig(): OpPaymentInterConfig {
  const rawUrl = process.env.GM_INTER_BASE_URL?.trim() || '';
  const secret = process.env.GM_INTER_SECRET;
  const timeoutMs = Number(process.env.GM_TIMEOUT_MS || '10000');
  try {
    const url = new URL(rawUrl);
    if ((url.protocol !== 'https:' && !privateHttpOrigin(rawUrl, url)) ||
      url.href !== `${url.origin}/` || /[\u0000-\u0020\u007f\\@?#]/.test(rawUrl) ||
      !secret?.trim() || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
      throw new Error();
    }
    return { baseUrl: url.origin, secret, timeoutMs };
  } catch {
    throw new Error('OP 到账通道配置无效');
  }
}

export function getOpPaymentOrderConfig(): OpPaymentOrderConfig {
  const config = getOpPaymentInterConfig();
  const rawUrl = process.env.OP_SDK_PAYMENT_ORDER_URL?.trim() || '';
  try {
    const url = new URL(rawUrl);
    const path = /^https?:\/\/[^/]+(\/.+)$/i.exec(rawUrl)?.[1];
    if (url.origin !== config.baseUrl || path !== ORDER_PATH || url.pathname !== ORDER_PATH ||
      (url.protocol !== 'https:' && !privateHttpOrigin(rawUrl, url)) || /[\u0000-\u0020\u007f\\@?#]/.test(rawUrl)) {
      throw new Error();
    }
    return { ...config, orderUrl: url.href };
  } catch {
    throw new Error('OP 原订单查询通道未配置或不符合 Inter 地址和路径要求');
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validOrderIdentity({ id, worldId, wuid }: OpPaymentOrderIdentity): boolean {
  return typeof id === 'string' && id.length === 36 && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) &&
    positiveInteger(worldId) &&
    typeof wuid === 'string' && /^[1-9]\d{0,18}$/.test(wuid) && !/[^0-9]/.test(wuid) && BigInt(wuid) <= MAX_WUID;
}

function validReceipt(receipt: OpPaymentReceipt): boolean {
  return validOrderIdentity(receipt) && typeof receipt.sku === 'string' && !!receipt.sku.trim() &&
    typeof receipt.paymentId === 'string' && !!receipt.paymentId.trim() &&
    positiveInteger(receipt.amountMinor) &&
    typeof receipt.currency === 'string' && receipt.currency.length === 3 && /^[A-Z]{3}$/.test(receipt.currency) &&
    positiveInteger(receipt.paidAt) && receipt.paidAt <= MAX_UNIX_SECONDS;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

async function postInter(url: string, config: OpPaymentInterConfig, body: URLSearchParams) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (response.status !== 200) throw new Error();
  const payload = record(await response.json());
  if (payload?.code !== 200) throw new Error();
  return record(payload.result);
}

export async function getOpPaymentOrder(config: OpPaymentOrderConfig, identity: OpPaymentOrderIdentity): Promise<OpPaymentOrderQuote> {
  if (!validOrderIdentity(identity)) throw new Error('OP 原订单编号、区服或角色无效');
  const { id, worldId, wuid } = identity;
  const body = new URLSearchParams({ id, worldId: String(worldId), wuid, code: config.secret });

  let order: Record<string, unknown> | undefined;
  try {
    order = record((await postInter(config.orderUrl, config, body))?.order);
  } catch {
    throw new Error('OP 原订单查询未确认');
  }
  if (!order || order.status !== 'created' || order.id !== id || order.worldId !== worldId || order.wuid !== wuid ||
    typeof order.sku !== 'string' || !order.sku.trim() || order.sku !== order.sku.trim() ||
    typeof order.subAccountId !== 'string' || !/^[1-9]/.test(order.subAccountId) || /[^0-9]/.test(order.subAccountId) ||
    !positiveInteger(order.amountMinor) || order.currency !== 'CNY' ||
    !positiveInteger(order.expiresAt) || order.expiresAt > MAX_UNIX_SECONDS || order.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('OP 原订单凭据无效或已过期');
  }
  return {
    id, worldId, wuid,
    sku: order.sku,
    subAccountId: order.subAccountId,
    amountMinor: order.amountMinor,
    currency: order.currency,
    expiresAt: order.expiresAt,
    status: 'created',
  };
}

export async function notifyOpPayment(config: OpPaymentInterConfig, receipt: OpPaymentReceipt): Promise<'paid' | 'delivered'> {
  if (!validReceipt(receipt)) throw new Error('OP 到账凭据字段无效');
  const body = new URLSearchParams({
    code: config.secret,
    id: receipt.id,
    worldId: String(receipt.worldId),
    wuid: receipt.wuid,
    sku: receipt.sku,
    paymentId: receipt.paymentId,
    amountMinor: String(receipt.amountMinor),
    currency: receipt.currency,
    paidAt: String(receipt.paidAt),
  });

  try {
    const status = (await postInter(`${config.baseUrl}${PAYMENT_PATH}`, config, body))?.status;
    if (status === 'paid' || status === 'delivered') return status;
  } catch {
    // A lost or rejected reply is not a basis to refund or charge again.
  }
  throw new Error('OP 到账回执待确认');
}
