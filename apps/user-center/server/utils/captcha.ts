/**
 * 图形验证码工具（纯 SVG，零依赖）
 * generateCaptcha() → { token, image: 'data:image/svg+xml;base64,...' }
 * verifyCaptcha(token, input) → boolean
 */

import crypto from 'node:crypto';

interface CaptchaEntry { code: string; expireAt: number; }
const store = new Map<string, CaptchaEntry>();

// 每 5 分钟清理过期 token
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
        if (v.expireAt < now) store.delete(k);
    }
}, 5 * 60 * 1000);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY3456789'; // 去掉 0/O/1/I 等易混淆字符
const TTL_MS = 2 * 60 * 1000; // 2 分钟

function rnd(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function randomCode(len = 4) {
    return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

const COLORS = ['#7fe6db', '#f4a261', '#a8d8ea', '#e9c46a', '#e76f51', '#cdb4db', '#90e0ef'];

function generateSVG(code: string): string {
    const W = 180, H = 56;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

    // 背景渐变
    svg += `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#16213e"/></linearGradient></defs>`;
    svg += `<rect width="${W}" height="${H}" fill="url(#bg)" rx="7"/>`;

    // 干扰线（较少、较淡）
    for (let i = 0; i < 4; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<line x1="${rnd(0, W)}" y1="${rnd(0, H)}" x2="${rnd(0, W)}" y2="${rnd(0, H)}" stroke="${color}" stroke-width="1" opacity="0.3"/>`;
    }

    // 干扰点
    for (let i = 0; i < 15; i++) {
        svg += `<circle cx="${rnd(5, W-5)}" cy="${rnd(5, H-5)}" r="${rnd(1, 2)}" fill="rgba(255,255,255,${rnd(0.1, 0.25).toFixed(2)})"/>`;
    }

    // 字符：旋转角度降低到 ±8°，字号更大，对比度更强
    for (let i = 0; i < code.length; i++) {
        const x = 25 + i * 38;
        const y = 36 + rnd(-3, 3);
        const rotate = rnd(-8, 8).toFixed(1);   // ★ 原来是 ±18°，现在降为 ±8°
        const fontSize = Math.floor(rnd(26, 30)); // ★ 原来 22-28，现在 26-30
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        svg += `<text x="${x}" y="${y}" font-family="Arial Black,Arial,sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}" transform="rotate(${rotate},${x},${y})" style="text-shadow:0 0 4px rgba(0,0,0,0.8)">${code[i]}</text>`;
    }

    svg += '</svg>';
    return svg;
}

/** 生成验证码，返回 token 和 base64 SVG 图片 */
export function generateCaptcha(): { token: string; image: string } {
    const code = randomCode(4);
    const token = crypto.randomBytes(16).toString('hex');

    store.set(token, { code: code.toUpperCase(), expireAt: Date.now() + TTL_MS });
    console.log(`[captcha] generated token=${token.slice(0, 8)}... code=${code} storeSize=${store.size}`);

    const svg = generateSVG(code);
    const base64 = Buffer.from(svg).toString('base64');
    const image = `data:image/svg+xml;base64,${base64}`;

    return { token, image };
}

/** 校验验证码（用完即删） */
export function verifyCaptcha(token: string, input: string): boolean {
    const entry = store.get(token);
    const inputUp = (input || '').toUpperCase().trim();
    console.log(`[captcha] verify token=${(token || '').slice(0, 8)}... found=${!!entry} storeSize=${store.size} input="${inputUp}" expected="${entry?.code}"`);

    if (!entry) return false;
    store.delete(token); // 一次性使用
    if (entry.expireAt < Date.now()) {
        console.log(`[captcha] token expired`);
        return false;
    }
    const ok = entry.code === inputUp;
    console.log(`[captcha] result=${ok}`);
    return ok;
}

/** 验证码存储数量（供调试） */
export function captchaStoreSize(): number {
    return store.size;
}
