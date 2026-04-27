import { sql } from '../db';

interface SystemConfig {
    kefu_line?: string;
    pay_suc_url?: string;
    kefu_order_url?: string;
    notify_game_url?: string;
    gift_url?: string;
    user_login_url?: string;
    qrcode_url?: string;
    notify_url?: string;              // 基础站点地址（用于拼接通知等）
}

// 缓存配置，避免频繁查询数据库
let configCache: SystemConfig | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 获取环境变量中的基础URL
const getBaseUrl = () => {
    return process.env.BASE_URL || 'http://localhost:3000';
};

/**
 * 获取系统参数
 * @param key 参数键
 * @param defaultValue 默认值
 * @returns 参数值
 */
export async function getSystemParam(key: string, defaultValue: string = ''): Promise<string> {
    try {
        const result = await sql({
            query: 'SELECT content FROM systemparams WHERE `key` = ?',
            values: [key],
        }) as any[];
        
        return result.length > 0 ? result[0].content : defaultValue;
    } catch (error) {
        console.error(`获取系统参数失败: ${key}`, error);
        return defaultValue;
    }
}

/**
 * 获取系统配置（带缓存）
 * @returns 系统配置对象
 */
export async function getSystemConfig(): Promise<SystemConfig> {
    const now = Date.now();
    
    // 检查缓存是否有效
    if (configCache && now < cacheExpiry) {
        return configCache;
    }
    
    try {
        const baseUrl = getBaseUrl();
        
        // 并行获取所有配置
        const [kefuLine, paySucUrl, kefuOrderUrl, notifyGameUrl, giftUrl, userLoginUrl, qrcodeUrl, notifyUrlParam] = await Promise.all([
            getSystemParam('kefu_line', 'https://lin.ee/vG027VR'),
            getSystemParam('pay_suc_url', `${baseUrl}/user/payment-success`),
            getSystemParam('kefu_order_url', `${baseUrl}/user/customer-service-payment`),
            getSystemParam('notify_game_url', 'http://160.202.240.19:8888/update_pay_status'),
            getSystemParam('gift_url', `http://160.202.240.19:8888/send_mail`),
            getSystemParam('user_login_url', `${baseUrl}/user/login`),
            getSystemParam('qrcode_url', `${baseUrl}/user/qrcode`),
            getSystemParam('notify_url', baseUrl)
        ]);
        
        configCache = {
            kefu_line: kefuLine,
            pay_suc_url: paySucUrl,
            kefu_order_url: kefuOrderUrl,
            notify_game_url: notifyGameUrl,
            gift_url: giftUrl,
            user_login_url: userLoginUrl,
            qrcode_url: qrcodeUrl,
            notify_url: notifyUrlParam
        };
        
        cacheExpiry = now + CACHE_DURATION;
        
        return configCache;
    } catch (error) {
        console.error('获取系统配置失败:', error);
        
        const baseUrl = getBaseUrl();
        
        // 返回默认配置
        return {
            kefu_line: 'https://lin.ee/vG027VR',
            pay_suc_url: `${baseUrl}/user/payment-success`,
            kefu_order_url: `${baseUrl}/user/customer-service-payment`,
            notify_game_url: 'http://160.202.240.19:8888/update_pay_status',
            gift_url: `http://160.202.240.19:8888/send_mail`,
            user_login_url: `${baseUrl}/user/login`,
            qrcode_url: `${baseUrl}/user/qrcode`,
            notify_url: baseUrl
        };
    }
}

/**
 * 清除配置缓存
 */
export function clearConfigCache(): void {
    configCache = null;
    cacheExpiry = 0;
} 

// 第三方支付配置类型
export type ThirdPartyPaymentConfig = {
    baseUrl: string;                    // 支付下单接口地址（V2: https://pay.uzepay.com/api/pay/create）
    pid: string;                        // 商户ID
    md5Key?: string;                    // V1 兼容用的 MD5 密钥（可选）
    rsaPlatformPublicKey?: string;      // 平台公钥（用于验签，Base64 或 PEM）
    rsaPrivateKey?: string;             // 商户私钥（用于签名，PEM 或 Base64），需在系统参数里配置
    defaultMethod?: string;             // UZEPAY 接口类型 method，默认 web
};

/**
 * 获取第三方支付配置
 */
export async function getThirdPartyPaymentConfig(): Promise<ThirdPartyPaymentConfig> {
    try {
        const [
            baseUrl,
            pid,
            md5Key,
            rsaPlatformPublicKey,
            rsaPrivateKey,
            defaultMethod
        ] = await Promise.all([
            // UZEPAY V2 下单接口
            getSystemParam('third_party_pay_base_url', 'https://pay.uzepay.com/api/pay/create'),
            // 商户ID
            getSystemParam('third_party_pay_pid', '1024'),
            // 兼容 V1 的 MD5 key（可选）
            getSystemParam('third_party_pay_md5_key', 'Qu9BtfCuNTuRB9WAWR1TEBuAebr7uaDQ'),
            // 平台公钥（用于验签），支持直接填 Base64 或 PEM
            getSystemParam('third_party_pay_rsa_platform_public_key', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0v59NsXa+eov2eumTpYgS1sReIcG/5wM9aJGOaizQtSMoRCKYixhilOAjTfRY5NGWuG92/NMUNQK5XrLu40zV8hp2trgMs1ibbFYFn4HlhipvrztlU6/V28eHcYXPlvFeRsS+eDqmJjPYCBGhnghD12VakUP0mC5W3FtSN2Kz4zFQ6QlKAqidCWT9QBS+U1y/lxeRfE3zhXWeBB78wK1LEIO22JzAJ42CS19CFT+mGEFNEh6Wx/DK9Il8Zev8x4xRTITRibUbitatjPMpdnEs/k8WukiQaSjhasqJkwuXAsRxbRUr59Z18rZ3aIw3LY3/Lf6brPqJ+hTA8D9v2ojWwIDAQAB'),
            // 商户私钥（用于签名），需在系统参数中安全配置
            getSystemParam('third_party_pay_rsa_private_key', ''),
            // UZEPAY method 参数，默认为 web
            getSystemParam('third_party_pay_default_method', 'web')
        ]);
        
        return {
            baseUrl,
            pid,
            md5Key,
            rsaPlatformPublicKey,
            rsaPrivateKey,
            defaultMethod
        };
    } catch (error) {
        console.error('获取第三方支付配置失败:', error);
        
        // 返回默认配置（需在系统中尽快改为真实配置）
        return {
            baseUrl: 'https://pay.uzepay.com/api/pay/create',
            pid: '1024',
            md5Key: 'Qu9BtfCuNTuRB9WAWR1TEBuAebr7uaDQ',
            rsaPlatformPublicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0v59NsXa+eov2eumTpYgS1sReIcG/5wM9aJGOaizQtSMoRCKYixhilOAjTfRY5NGWuG92/NMUNQK5XrLu40zV8hp2trgMs1ibbFYFn4HlhipvrztlU6/V28eHcYXPlvFeRsS+eDqmJjPYCBGhnghD12VakUP0mC5W3FtSN2Kz4zFQ6QlKAqidCWT9QBS+U1y/lxeRfE3zhXWeBB78wK1LEIO22JzAJ42CS19CFT+mGEFNEh6Wx/DK9Il8Zev8x4xRTITRibUbitatjPMpdnEs/k8WukiQaSjhasqJkwuXAsRxbRUr59Z18rZ3aIw3LY3/Lf6brPqJ+hTA8D9v2ojWwIDAQAB',
            rsaPrivateKey: '',
            defaultMethod: 'web'
        };
    }
} 