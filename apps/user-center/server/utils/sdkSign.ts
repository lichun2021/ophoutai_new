import crypto from 'crypto';
import type { H3Event } from 'h3';
import { getQuery, readBody } from 'h3';
import { getSystemParam } from './systemConfig';

/**
 * 生成 SDK 签名（与客户端保持一致）：
 * 1) 过滤 null/undefined/空字符串
 * 2) 排除 sign 字段
 * 3) 按 key ASCII 升序拼接为 key=value&key2=value2
 * 4) 拼接 secret 在末尾：sorted + secret
 * 5) 使用 secret 作为 HMAC key 计算 HMAC-SHA256，输出 hex 小写
 */
export function computeSdkSign(params: Record<string, any>, secret: string): string {
  // 过滤空值与 sign
  const filtered: Record<string, string> = {};
  Object.keys(params || {}).forEach((key) => {
    if (key === 'sign') return;
    const value = (params as any)[key];
    if (value === null || value === undefined) return;
    const str = String(value).trim();
    // 将 'null' / 'undefined' 字符串视为无效值，避免客户端用字面量字符串导致参与字段不一致
    if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return;
    filtered[key] = str;
  });

  // 按 ASCII 升序
  const sortedKeys = Object.keys(filtered).sort();
  const sortedParams = sortedKeys
    .map((k) => `${k}=${filtered[k]}`)
    .join('&');

  // 拼接 secret
  const dataToSign = `${sortedParams}${secret}`;
  //这里加一个打印 
  const sign = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

  // HMAC-SHA256(hex 小写)
  return sign;
}

/**
 * 从 H3Event 读取 query 与 body，合并为一个对象（body 覆盖同名 query）。
 */
export async function collectSdkParams(event: H3Event): Promise<Record<string, any>> {
  const query = getQuery(event) || {};
  let body: any = {};
  try {
    const parsed = await readBody(event);
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    body = {};
  }
  return { ...query, ...body };
}

/**
 * 校验 SDK 签名，返回 true/false。
 * 默认从系统参数读取全局密钥：sdk_sign_secret（可在后台 SystemParams 设置）。
 */
export async function verifySdkSign(event: H3Event, secretOverride?: string): Promise<boolean> {
  const params = await collectSdkParams(event);
  const provided = String((params as any).sign ?? '').trim().toLowerCase();
  if (!provided) return false;

  const secret = secretOverride ?? (await getSystemParam('sdk_sign_secret', 'AQE!@#a123JNJKO$@#fg1'));
  const expect = computeSdkSign(params, secret);
  return expect === provided;
}


