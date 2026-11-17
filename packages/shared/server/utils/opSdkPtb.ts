import { createHmac, timingSafeEqual } from 'node:crypto';

export function isOpSdkPtb(params: Record<string, unknown>): boolean {
  const originalGameOrder = typeof params.xx === 'string' && isGameOrderId(params.xx.toLowerCase());
  // Web mall gifts have their own non-UUID order numbers. A game original order always uses SDK checkout.
  return String(params.z ?? '').toLowerCase() === 'ptb' && params.j === 'op'
    && (originalGameOrder || !String(params.server_url ?? '').startsWith('gift://'));
}

function isGameOrderId(value: string): boolean {
  return value.length === 36 && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
}

export function parseOpSdkPtb(params: Record<string, unknown>) {
  const { xx: id, tr: subAccount, h: world, x: wuid, k: sku, p: price, f: username } = params;
  if (typeof id !== 'string' || !isGameOrderId(id)
    || typeof wuid !== 'string' || !/^[1-9][0-9]{0,18}$/.test(wuid) || /[^0-9]/.test(wuid) || BigInt(wuid) > 9223372036854775807n
    || typeof sku !== 'string' || !sku || sku.length > 100 || /[^A-Za-z0-9._-]/.test(sku)
    || typeof username !== 'string' || !username || username !== username.trim() || username.length > 100) return null;
  const subAccountId = positiveInteger(subAccount);
  const worldId = positiveInteger(world);
  const amount = String(price ?? '');
  if (!subAccountId || !worldId || amount !== amount.trim() || !/^[0-9]{1,8}(?:\.[0-9]{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amountMinor <= 0) return null;
  return { id, subAccountId, wuid, worldId, sku, amountMinor, username };
}

function positiveInteger(value: unknown): number | undefined {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]{0,9}$/.test(text) || /[^0-9]/.test(text)) return;
  const number = Number(text);
  if (number <= 2147483647) return number;
}

type Checkout = NonNullable<ReturnType<typeof parseOpSdkPtb>>;

function authorizationMac(checkout: Checkout, userId: number, issuedAt: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Server authorization unavailable');
  return createHmac('sha256', secret).update(JSON.stringify([
    'op-sdk-ptb-v1', userId, issuedAt, checkout.id, checkout.subAccountId, checkout.wuid,
    checkout.worldId, checkout.sku, checkout.amountMinor, checkout.username,
  ])).digest('hex');
}

export function signOpSdkPtb(checkout: Checkout, userId: number): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  return `${userId}.${issuedAt}.${authorizationMac(checkout, userId, issuedAt)}`;
}

export function verifyOpSdkPtb(checkout: Checkout, header: string): number | null {
  const match = /^([1-9][0-9]{0,9})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(header);
  if (!match) return null;
  const userId = positiveInteger(match[1]);
  const issuedAt = Number(match[2]);
  const now = Math.floor(Date.now() / 1000);
  if (!userId || issuedAt > now + 5 || issuedAt < now - 60) return null;
  try {
    if (timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(authorizationMac(checkout, userId, issuedAt), 'hex'))) {
      return userId;
    }
  } catch {
    return null;
  }
  return null;
}
