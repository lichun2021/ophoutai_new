import { config } from '../config';
import * as ApisModel from '../model/apis';
import * as crypto from 'crypto';



// 实际第三方token验证（GET方法）
export const verifyThirdPartyToken = async (token: string): Promise<{code: number, data: any}> => {
    try {


        // // 读取配置文件中的apiUrls
        // const apiUrls = config.thirdPartyConfig.apiUrls;
        // // 按顺序读取一直到获取的到有效的URL
        // const randomIndex = Math.floor(Math.random() * Object.keys(apiUrls).length);
        // const randomUrl = apiUrls[randomIndex];
        // console.log("随机获取的URL:", randomUrl)
        // // 读取URL文件内容
        // const res1 = await fetch(randomUrl, {
        //     method: 'GET',
        //     headers: {
        //         'Content-Type': 'application/json'
        //     },
        //     signal: AbortSignal.timeout(THIRD_PARTY_API.TIMEOUT)
        // });
        // if (!res1.ok) {
        //     throw new Error('无法获取URL文件内容');
        // }
        // const hostUrl = await res1.text();
        const hostUrl = await ApisModel.getApiUrl()
        const reqUrl = "https://"+ hostUrl + config.thirdPartyConfig.sApi;
        // 解析URL文件内容为JSON对象
        console.log("获取的URL:", reqUrl)
        // 解析URL文件内容为JSON对象

        const response = await fetch(reqUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(5000)
        });
        const data = await response.json();
        return {
            code:data.code,
            data:data
        }
    } catch (error) {
        console.error('请求失败:', error);
        return {
            code: 500,
            data: null
        }
    }
};

import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

const bytesToBase32 = (buf: Buffer): string => {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const b of buf) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
};

const base32ToBytes = (input: string): Buffer => {
    const clean = String(input || '')
        .toUpperCase()
        .replace(/=+$/g, '')
        .replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = BASE32_ALPHABET.indexOf(ch);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
};

const generateTotpAtCounter = (secret: string, counter: number): string => {
    const key = base32ToBytes(secret);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const codeInt =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const mod = 10 ** TOTP_DIGITS;
    return String(codeInt % mod).padStart(TOTP_DIGITS, '0');
};

// ===== 管理员会话签名/验证 =====
const getAdminSecret = (): string => {
    const secret = process.env.ADMIN_SESSION_SECRET || 'q1w21124124!@!@#E@!';
    return secret || 'PLEASE_CHANGE_ADMIN_SESSION_SECRET';
}

/**
 * 生成 Google 2FA 密钥和二维码
 * @param adminName 管理员名称
 */
export const generate2FASecret = async (adminName: string) => {
    // 20 字节随机密钥，编码成 Base32（Google Authenticator 标准）
    const secret = bytesToBase32(crypto.randomBytes(20));
    
    // 手动拼接 otpauth 链接，不再依赖可能缺失的 keyuri 函数
    const label = encodeURIComponent(`QuantumAdmin:${adminName}`);
    const issuer = encodeURIComponent('QuantumAdmin');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    
    const qrCodeUrl = await QRCode.toDataURL(otpauth);
    return { secret, qrCodeUrl };
};

/**
 * 验证 Google 2FA 验证码
 * @param token 用户输入的6位验证码
 * @param secret 数据库存储的密钥
 */
export const verify2FAToken = (token: string, secret: string): boolean => {
    try {
        const normalizedToken = String(token || '').trim();
        const normalizedSecret = String(secret || '').trim();
        if (!/^\d{6}$/.test(normalizedToken) || !normalizedSecret) return false;

        const nowCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
        for (let delta = -1; delta <= 1; delta++) {
            const expected = generateTotpAtCounter(normalizedSecret, nowCounter + delta);
            if (expected === normalizedToken) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error('2FA校验过程发生崩溃:', err);
        return false;
    }
};

export const signAdminSession = (adminId: number | string, maxAgeSeconds: number = 4 * 60 * 60): string => {
    const id = String(adminId);
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + maxAgeSeconds;
    const base = `${id}.${iat}.${exp}`;
    const h = crypto.createHmac('sha256', getAdminSecret()).update(base).digest('hex');
    return `${base}.${h}`;
}

export const verifyAdminSession = (value: string | undefined | null): { ok: boolean, adminId?: number } => {
    try {
        const v = String(value || '');
        const parts = v.split('.');
        if (parts.length !== 4) return { ok: false };
        const [idStr, iatStr, expStr, sig] = parts;
        const base = `${idStr}.${iatStr}.${expStr}`;
        const expect = crypto.createHmac('sha256', getAdminSecret()).update(base).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return { ok: false };
        const now = Math.floor(Date.now() / 1000);
        if (now > parseInt(expStr)) return { ok: false };
        const adminId = parseInt(idStr);
        if (isNaN(adminId) || adminId <= 0) return { ok: false };
        return { ok: true, adminId };
    } catch {
        return { ok: false };
    }
}
