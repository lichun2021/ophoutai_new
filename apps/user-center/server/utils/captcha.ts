/**
 * 图形验证码工具（纯 SVG，零依赖）
 * 生成带干扰线和随机旋转字符的 SVG 验证码
 *
 * generateCaptcha() → { token, image: 'data:image/svg+xml;base64,...' }
 * verifyCaptcha(token, input) → boolean
 */

import crypto from 'node:crypto';

interface CaptchaEntry { code: string; expireAt: number; }
const store = new Map<string, CaptchaEntry>();

// 每 10 分钟清理过期 token
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
        if (v.expireAt < now) store.delete(k);
    }
}, 10 * 60 * 1000);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY3456789';
const TTL_MS = 5 * 60 * 1000; // 5 分钟

function rnd(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function randomCode(len = 4) {
    return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

const COLORS = ['#7fe6db', '#f4a261', '#a8d8ea', '#e9c46a', '#e76f51', '#a9d6e5', '#cdb4db', '#90e0ef'];

function generateSVG(code: string): string {
    const W = 160, H = 52;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

    // 背景
    svg += `<rect width="${W}" height="${H}" fill="#1a1a2e" rx="6"/>`;

    // 干扰线
    for (let i = 0; i < 5; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<line x1="${rnd(0, W)}" y1="${rnd(0, H)}" x2="${rnd(0, W)}" y2="${rnd(0, H)}" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
    }

    // 干扰点
    for (let i = 0; i < 20; i++) {
        svg += `<circle cx="${rnd(0, W)}" cy="${rnd(0, H)}" r="1.5" fill="rgba(255,255,255,${rnd(0.1, 0.4).toFixed(2)})"/>`;
    }

    // 字符（每个字符随机颜色 + 随机旋转）
    for (let i = 0; i < code.length; i++) {
        const x = 22 + i * 34;
        const y = 34 + rnd(-4, 4);
        const rotate = rnd(-18, 18).toFixed(1);
        const fontSize = Math.floor(rnd(22, 28));
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" transform="rotate(${rotate},${x},${y})">${code[i]}</text>`;
    }

    svg += '</svg>';
    return svg;
}

/** 生成验证码，返回 token 和 base64 SVG 图片 */
export function generateCaptcha(): { token: string; image: string } {
    const code = randomCode(4);
    const token = crypto.randomBytes(16).toString('hex');

    store.set(token, { code: code.toUpperCase(), expireAt: Date.now() + TTL_MS });

    const svg = generateSVG(code);
    const base64 = Buffer.from(svg).toString('base64');
    const image = `data:image/svg+xml;base64,${base64}`;

    return { token, image };
}

/** 校验验证码（用完即删） */
export function verifyCaptcha(token: string, input: string): boolean {
    const entry = store.get(token);
    if (!entry) return false;
    store.delete(token); // 一次性
    if (entry.expireAt < Date.now()) return false;
    return entry.code === (input || '').toUpperCase().trim();
}

/** 验证码存储数量（供调试） */
export function captchaStoreSize(): number {
    return store.size;
}
