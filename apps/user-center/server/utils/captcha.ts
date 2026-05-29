/**
 * 图形验证码工具（纯 SVG，零依赖）
 * 存储后端：Redis（跨进程共享，解决多 worker 场景下 token 丢失问题）
 * 降级：Redis 不可用时回退到内存 Map（单进程可用）
 *
 * generateCaptcha() → { token, image: 'data:image/svg+xml;base64,...' }
 * verifyCaptcha(token, input) → boolean
 */

import crypto from 'node:crypto';
import { getRedisCluster } from './redis-cluster';

const CAPTCHA_PREFIX = 'captcha:';
const TTL_SEC = 120; // 2 分钟

// ── 降级内存 Map（Redis 不可用时使用）
interface CaptchaEntry { code: string; expireAt: number; }
const memStore = new Map<string, CaptchaEntry>();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memStore) if (v.expireAt < now) memStore.delete(k);
}, 5 * 60 * 1000);

// ── 字符集（去掉 0/O/1/I 等易混淆字符）
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY3456789';
function rnd(min: number, max: number) { return Math.random() * (max - min) + min; }
function randomCode(len = 4) {
    return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

const COLORS = ['#7fe6db', '#f4a261', '#a8d8ea', '#e9c46a', '#e76f51', '#cdb4db', '#90e0ef'];

function generateSVG(code: string): string {
    const W = 180, H = 56;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    svg += `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#16213e"/></linearGradient></defs>`;
    svg += `<rect width="${W}" height="${H}" fill="url(#bg)" rx="7"/>`;

    // 干扰线
    for (let i = 0; i < 6; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<line x1="${rnd(0, W)}" y1="${rnd(0, H)}" x2="${rnd(0, W)}" y2="${rnd(0, H)}" stroke="${color}" stroke-width="1.5" opacity="0.4"/>`;
    }
    // 干扰点
    for (let i = 0; i < 30; i++) {
        svg += `<circle cx="${rnd(5, W - 5)}" cy="${rnd(5, H - 5)}" r="${rnd(1, 2.5)}" fill="rgba(255,255,255,${rnd(0.2, 0.4).toFixed(2)})"/>`;
    }
    // 字符（旋转 ±12°，字号 24-32px）
    for (let i = 0; i < code.length; i++) {
        const x = 25 + i * 38;
        const y = 36 + rnd(-3, 3);
        const rotate = rnd(-12, 12).toFixed(1);
        const fontSize = Math.floor(rnd(24, 32));
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<text x="${x}" y="${y}" font-family="Arial Black,Arial,sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}" transform="rotate(${rotate},${x},${y})">${code[i]}</text>`;
    }
    svg += '</svg>';
    return svg;
}

/** 生成验证码，返回 token 和 base64 SVG 图片 */
export async function generateCaptcha(): Promise<{ token: string; image: string }> {
    const code = randomCode(4);
    const token = crypto.randomBytes(16).toString('hex');
    const codeUp = code.toUpperCase();

    // 优先写 Redis
    try {
        const redis = getRedisCluster();
        await redis.set(`${CAPTCHA_PREFIX}${token}`, codeUp, 'EX', TTL_SEC);
        console.log(`[captcha] generated(redis) token=${token.slice(0, 8)}... code=${codeUp}`);
    } catch (e) {
        // 降级内存
        memStore.set(token, { code: codeUp, expireAt: Date.now() + TTL_SEC * 1000 });
        console.warn(`[captcha] Redis unavailable, fallback to memStore. token=${token.slice(0, 8)}...`);
    }

    const svg = generateSVG(code);
    const base64 = Buffer.from(svg).toString('base64');
    return { token, image: `data:image/svg+xml;base64,${base64}` };
}

/** 校验验证码（用完即删，防重放） */
export async function verifyCaptcha(token: string, input: string): Promise<boolean> {
    const inputUp = (input || '').toUpperCase().trim();
    const key = `${CAPTCHA_PREFIX}${token}`;

    // 优先查 Redis
    try {
        const redis = getRedisCluster();
        const stored = await redis.get(key);
        console.log(`[captcha] verify(redis) token=${(token || '').slice(0, 8)}... found=${!!stored} input="${inputUp}" expected="${stored}"`);
        if (!stored) return false;
        await redis.del(key); // 一次性使用
        const ok = stored === inputUp;
        console.log(`[captcha] result=${ok}`);
        return ok;
    } catch (e) {
        console.warn(`[captcha] Redis unavailable, fallback to memStore`);
        // 降级内存
        const entry = memStore.get(token);
        console.log(`[captcha] verify(mem) token=${(token || '').slice(0, 8)}... found=${!!entry} input="${inputUp}" expected="${entry?.code}"`);
        if (!entry) return false;
        memStore.delete(token);
        if (entry.expireAt < Date.now()) return false;
        return entry.code === inputUp;
    }
}
