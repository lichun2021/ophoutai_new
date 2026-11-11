import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { getRedisCluster } from './redis-cluster';

const SESSION_TTL_SECONDS = 15 * 60;
const TICKET_TTL_SECONDS = 60;
const JWS_HEADER = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

type TicketSigner = {
    environment: string;
    key: KeyObject;
};

let signer: TicketSigner | undefined;

function getSigner(): TicketSigner | undefined {
    if (signer) return signer;

    const environment = process.env.SDK_GAME_TICKET_ENVIRONMENT?.trim();
    const pem = process.env.SDK_GAME_TICKET_PRIVATE_KEY?.trim();
    if (!environment && !pem) return undefined;
    if (!environment || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(environment) || !pem) {
        throw new Error('SDK 游戏签票配置无效');
    }

    const key = createPrivateKey(pem.replace(/\\r\\n|\\n/g, '\n'));
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
        throw new Error('SDK 游戏签票需要至少 2048 位的 RSA 私钥');
    }
    signer = { environment, key };
    return signer;
}

function requireSigner(): TicketSigner {
    const configured = getSigner();
    if (!configured) throw new Error('SDK 游戏签票尚未配置');
    return configured;
}

function sessionKey(environment: string, token: string): string {
    const digest = createHash('sha256').update(token).digest('hex');
    return `sdk:game-session:${environment}:${digest}`;
}

export async function createSdkGameSession(userId: number): Promise<string | undefined> {
    const configured = getSigner();
    if (!configured) return undefined;
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('SDK 游戏会话用户 ID 无效');

    const token = randomBytes(32).toString('hex');
    const key = sessionKey(configured.environment, token);
    const result = await getRedisCluster().set(key, String(userId), 'EX', SESSION_TTL_SECONDS, 'NX');
    if (result !== 'OK') throw new Error('无法存储 SDK 游戏会话');
    return token;
}

export async function readSdkGameSession(token: string): Promise<number | null> {
    const key = sessionKey(requireSigner().environment, token);
    const stored = await getRedisCluster().get(key);
    const userId = Number(stored);
    return Number.isSafeInteger(userId) && userId > 0 && String(userId) === stored ? userId : null;
}

export function signSdkGameTicket(subAccountId: string): string {
    const { environment, key } = requireSigner();
    const issuedAt = Math.floor(Date.now() / 1000);
    const claims = {
        iss: 'oph-sdk',
        aud: 'op',
        env: environment,
        sub: subAccountId,
        iat: issuedAt,
        exp: issuedAt + TICKET_TTL_SECONDS,
        jti: randomBytes(16).toString('hex'),
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const message = `${JWS_HEADER}.${payload}`;
    const signature = sign('RSA-SHA256', Buffer.from(message), key).toString('base64url');
    return `${message}.${signature}`;
}
