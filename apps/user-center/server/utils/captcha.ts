/**
 * 图形验证码工具（纯 SVG，零依赖）
 * 存储后端：Redis（跨进程共享，解决多 worker 场景下 token 丢失问题）
 * 降级：Redis 不可用时回退到内存 Map（单进程可用）
 *
 * generateCaptcha() → { token, image: 'data:image/svg+xml;base64,...' }
 * verifyCaptcha(token, input) → boolean
 * generateSliderCaptcha() → { token, background, piece, y, pieceSize }
 * verifySliderCaptcha(token, x) → boolean
 */

import crypto from 'node:crypto';
import { getRedisCluster } from './redis-cluster';

const CAPTCHA_PREFIX = 'captcha:';
const SLIDER_CAPTCHA_PREFIX = 'slider_captcha:';
const TTL_SEC = 120; // 2 分钟
const SLIDER_W = 350;
const SLIDER_H = 150;
const PIECE_SIZE = 42;
const SLIDER_TOLERANCE = 5;

// ── 降级内存 Map（Redis 不可用时使用）
interface CaptchaEntry { code: string; expireAt: number; }
interface SliderCaptchaEntry { x: number; expireAt: number; }
const memStore = new Map<string, CaptchaEntry>();
const sliderMemStore = new Map<string, SliderCaptchaEntry>();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memStore) if (v.expireAt < now) memStore.delete(k);
    for (const [k, v] of sliderMemStore) if (v.expireAt < now) sliderMemStore.delete(k);
}, 5 * 60 * 1000);

// ── 字符集（去掉 0/O/1/I 等易混淆字符）
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY3456789';
function rnd(min: number, max: number) { return Math.random() * (max - min) + min; }
function randomCode(len = 4) {
    return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}
function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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

function generateSceneDefs(): string {
    return `<defs>
        <linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe7e3"/><stop offset="52%" stop-color="#ffd8d0"/><stop offset="100%" stop-color="#c9f3ee"/></linearGradient>
        <linearGradient id="pieceBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffddd7"/><stop offset="50%" stop-color="#ffd2c9"/><stop offset="100%" stop-color="#bceee8"/></linearGradient>
    </defs>`;
}

function addSceneNoise(): string {
    let svg = '';
    for (let i = 0; i < 30; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<circle cx="${rnd(8, SLIDER_W - 8).toFixed(1)}" cy="${rnd(8, SLIDER_H - 8).toFixed(1)}" r="${rnd(2, 7).toFixed(1)}" fill="${color}" opacity="${rnd(0.22, 0.46).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 12; i++) {
        svg += `<path d="M ${rnd(0, SLIDER_W).toFixed(1)} ${rnd(0, SLIDER_H).toFixed(1)} C ${rnd(0, SLIDER_W).toFixed(1)} ${rnd(0, SLIDER_H).toFixed(1)}, ${rnd(0, SLIDER_W).toFixed(1)} ${rnd(0, SLIDER_H).toFixed(1)}, ${rnd(0, SLIDER_W).toFixed(1)} ${rnd(0, SLIDER_H).toFixed(1)}" fill="none" stroke="#a83206" stroke-width="1.4" opacity="0.18"/>`;
    }
    return svg;
}

function generateSliderBackground(targetX: number, targetY: number): string {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDER_W}" height="${SLIDER_H}" viewBox="0 0 ${SLIDER_W} ${SLIDER_H}">`;
    svg += generateSceneDefs();
    svg += `<rect width="${SLIDER_W}" height="${SLIDER_H}" rx="12" fill="url(#sbg)"/>`;
    svg += addSceneNoise();
    svg += `<rect x="${targetX}" y="${targetY}" width="${PIECE_SIZE}" height="${PIECE_SIZE}" rx="9" fill="rgba(255,220,214,0.56)" stroke="rgba(120,76,66,0.58)" stroke-width="2"/>`;
    svg += `<circle cx="${targetX + 10}" cy="${targetY + 9}" r="4" fill="#7fe6db" opacity="0.32"/>`;
    svg += `<circle cx="${targetX + 30}" cy="${targetY + 29}" r="5" fill="#f4a261" opacity="0.26"/>`;
    svg += `<path d="M ${targetX + 7} ${targetY + 26} C ${targetX + 15} ${targetY + 18}, ${targetX + 25} ${targetY + 30}, ${targetX + 35} ${targetY + 17}" fill="none" stroke="#a83206" stroke-width="1.2" opacity="0.18"/>`;
    svg += '</svg>';
    return svg;
}

function generateSliderPiece(): string {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIECE_SIZE}" height="${PIECE_SIZE}" viewBox="0 0 ${PIECE_SIZE} ${PIECE_SIZE}">`;
    svg += generateSceneDefs();
    svg += `<rect x="1" y="1" width="${PIECE_SIZE - 2}" height="${PIECE_SIZE - 2}" rx="9" fill="url(#pieceBg)" stroke="rgba(120,76,66,0.58)" stroke-width="2"/>`;
    svg += `<circle cx="11" cy="9" r="4" fill="#7fe6db" opacity="0.38"/>`;
    svg += `<circle cx="31" cy="29" r="5" fill="#f4a261" opacity="0.34"/>`;
    svg += `<path d="M7 26 C15 18, 25 30, 35 17" fill="none" stroke="#a83206" stroke-width="1.4" opacity="0.22"/>`;
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

    return { token, image: svgDataUrl(generateSVG(code)) };
}

/** 生成滑动拼图验证码，答案只保存后端 */
export async function generateSliderCaptcha(): Promise<{ token: string; background: string; piece: string; y: number; pieceSize: number }> {
    const token = crypto.randomBytes(16).toString('hex');
    const x = Math.floor(rnd(90, SLIDER_W - PIECE_SIZE - 14));
    const y = Math.floor(rnd(22, SLIDER_H - PIECE_SIZE - 16));
    const entry = { x, expireAt: Date.now() + TTL_SEC * 1000 };

    try {
        const redis = getRedisCluster();
        await redis.set(`${SLIDER_CAPTCHA_PREFIX}${token}`, JSON.stringify({ x }), 'EX', TTL_SEC);
        console.log(`[slider-captcha] generated(redis) token=${token.slice(0, 8)}...`);
    } catch (e) {
        sliderMemStore.set(token, entry);
        console.warn(`[slider-captcha] Redis unavailable, fallback to memStore. token=${token.slice(0, 8)}...`);
    }

    return {
        token,
        background: svgDataUrl(generateSliderBackground(x, y)),
        piece: svgDataUrl(generateSliderPiece()),
        y,
        pieceSize: PIECE_SIZE,
    };
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

/** 校验滑动验证码（用完即删，防重放） */
export async function verifySliderCaptcha(token: string, x: number): Promise<boolean> {
    if (!token || !Number.isFinite(x)) return false;
    const key = `${SLIDER_CAPTCHA_PREFIX}${token}`;

    try {
        const redis = getRedisCluster();
        const stored = await redis.get(key);
        console.log(`[slider-captcha] verify(redis) token=${token.slice(0, 8)}... found=${!!stored}`);
        if (!stored) return false;
        await redis.del(key);
        const parsed = JSON.parse(stored) as { x?: number };
        return Math.abs(Number(parsed.x) - x) <= SLIDER_TOLERANCE;
    } catch (e) {
        console.warn(`[slider-captcha] Redis unavailable, fallback to memStore`);
        const entry = sliderMemStore.get(token);
        if (!entry) return false;
        sliderMemStore.delete(token);
        if (entry.expireAt < Date.now()) return false;
        return Math.abs(entry.x - x) <= SLIDER_TOLERANCE;
    }
}
