import { createHmac, timingSafeEqual } from 'node:crypto';

interface UserIdentity {
  id: number;
  password?: string | null;
  thirdparty_uid?: string | null;
}

const tokenPattern = /^v2\.([1-9]\d{0,15})\.([a-f0-9]{64})$/;

export function parseUserAutoLoginId(token: unknown): number | null {
  if (typeof token !== 'string') return null;
  const match = tokenPattern.exec(token);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

function signature(user: UserIdentity): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 环境变量未配置');
  // The current credentials make the link stable across logins and invalidate it when they change.
  const payload = JSON.stringify(['user-auto-login-v2', Number(user.id), user.thirdparty_uid ?? '', user.password ?? '']);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createUserAutoLoginToken(user: UserIdentity): string {
  const id = Number(user.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('用户 ID 无效');
  return `v2.${id}.${signature(user)}`;
}

export function verifyUserAutoLoginToken(token: unknown, user: UserIdentity): boolean {
  if (typeof token !== 'string' || parseUserAutoLoginId(token) !== Number(user.id)) return false;
  const received = Buffer.from(token.slice(-64), 'hex');
  return timingSafeEqual(received, Buffer.from(signature(user), 'hex'));
}
