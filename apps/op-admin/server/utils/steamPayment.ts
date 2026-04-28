/**
 * Steam 官方支付模块 (ISteamMicroTxn)
 * 
 * 对接 Steam Microtransactions API，实现游戏内购功能。
 * 
 * 流程：
 * 1. 游戏客户端发起购买请求 → 后端调用 InitTxn 初始化交易
 * 2. Steam 在客户端 Overlay 中显示购买确认界面
 * 3. 用户确认购买 → 后端调用 FinalizeTxn 完成交易
 * 4. （可选）查询交易状态 QueryTxn
 * 
 * 文档：https://partner.steamgames.com/doc/webapi/ISteamMicroTxn
 */

import { getSystemParam } from './systemConfig';

// ========== 配置 ==========

export interface SteamPaymentConfig {
    webApiKey: string;     // Steam Web API Key (Publisher Key)
    appId: string;         // 游戏的 Steam App ID
    sandbox: boolean;      // 是否使用沙盒环境
}

/**
 * 从系统参数获取 Steam 支付配置
 * 系统参数 key：
 *   steam_web_api_key  - Steam Publisher Web API Key
 *   steam_app_id       - 游戏 App ID
 *   steam_sandbox      - 是否沙盒模式 ('true'/'false')
 */
export async function getSteamPaymentConfig(): Promise<SteamPaymentConfig> {
    const webApiKey = await getSystemParam('steam_web_api_key', '573CE6DA907E8D23E60A9FF97CA7AC68');
    const appId = await getSystemParam('steam_app_id', '4671660');
    const sandbox = await getSystemParam('steam_sandbox', 'false');

    return {
        webApiKey,
        appId,
        sandbox: sandbox === 'true'
    };
}

function getBaseUrl(sandbox: boolean): string {
    // 生产环境使用 partner.steam-api.com，沙盒环境使用 Sandbox 接口
    const iface = sandbox ? 'ISteamMicroTxnSandbox' : 'ISteamMicroTxn';
    return `https://partner.steam-api.com/${iface}`;
}

// ========== 类型定义 ==========

export interface SteamInitTxnRequest {
    steamId: string;       // 用户的 Steam 64-bit ID
    orderId: string;       // 唯一订单号 (64-bit unsigned)
    itemId: number;        // 商品 ID
    qty: number;           // 数量
    amount: number;        // 金额 (以分为单位，如 $9.99 = 999)
    description: string;   // 商品描述
    currency: string;      // 货币代码 (如 "CNY", "USD")
    language: string;      // 语言 (如 "zh", "en")
    category?: string;     // 商品分类
    userSession?: 'client' | 'web'; // 用户会话类型
}

export interface SteamInitTxnResponse {
    success: boolean;
    orderid?: string;
    transid?: string;     // Steam 交易 ID
    steamurl?: string;    // Web 模式下的支付跳转 URL
    error?: string;
    errorCode?: number;
}

export interface SteamFinalizeTxnResponse {
    success: boolean;
    orderid?: string;
    transid?: string;
    error?: string;
    errorCode?: number;
}

export interface SteamQueryTxnResponse {
    success: boolean;
    orderid?: string;
    transid?: string;
    steamid?: string;
    status?: string;       // 'Init' | 'Approved' | 'Succeeded' | 'Failed' | 'Refunded' 等
    currency?: string;
    time?: string;
    country?: string;
    items?: Array<{
        itemid: number;
        qty: number;
        amount: number;
        status: string;
    }>;
    error?: string;
    errorCode?: number;
}

export interface SteamUserInfoResponse {
    success: boolean;
    steamid?: string;
    country?: string;
    currency?: string;
    status?: string;       // 'Active', 'Trusted', etc.
    error?: string;
}

// ========== 核心 API 实现 ==========

/**
 * InitTxn - 初始化微交易
 * POST ISteamMicroTxn/InitTxn/v3
 */
export async function initTxn(req: SteamInitTxnRequest, config?: SteamPaymentConfig): Promise<SteamInitTxnResponse> {
    const cfg = config || await getSteamPaymentConfig();

    if (!cfg.webApiKey || !cfg.appId) {
        return { success: false, error: 'Steam 支付配置缺失 (webApiKey 或 appId)' };
    }

    const url = `${getBaseUrl(cfg.sandbox)}/InitTxn/v3/`;

    const params = new URLSearchParams();
    params.append('key', cfg.webApiKey);
    params.append('orderid', req.orderId);
    params.append('steamid', req.steamId);
    params.append('appid', cfg.appId);
    params.append('itemcount', '1');
    params.append('language', req.language || 'zh');
    params.append('currency', req.currency || 'CNY');
    params.append('usersession', req.userSession || 'client');

    // 商品信息（数组索引格式）
    params.append('itemid[0]', String(req.itemId));
    params.append('qty[0]', String(req.qty || 1));
    params.append('amount[0]', String(req.amount));
    params.append('description[0]', req.description);
    if (req.category) {
        params.append('category[0]', req.category);
    }

    try {
        console.log('[Steam Pay] InitTxn 请求:', { url, orderId: req.orderId, steamId: req.steamId, amount: req.amount });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            console.error('[Steam Pay] InitTxn HTTP 错误:', response.status, response.statusText);
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data: any = await response.json();
        console.log('[Steam Pay] InitTxn 响应:', JSON.stringify(data));

        const result = data?.response;
        if (!result) {
            return { success: false, error: '无效的 Steam API 响应' };
        }

        if (result.result === 'OK') {
            return {
                success: true,
                orderid: result.params?.orderid || req.orderId,
                transid: result.params?.transid || '',
                steamurl: result.params?.steamurl || ''
            };
        } else {
            return {
                success: false,
                error: result.error?.errordesc || result.error?.errorcode || 'InitTxn 失败',
                errorCode: result.error?.errorcode
            };
        }
    } catch (e: any) {
        console.error('[Steam Pay] InitTxn 异常:', e);
        return { success: false, error: `请求异常: ${e.message}` };
    }
}

/**
 * FinalizeTxn - 完成微交易（用户确认购买后调用）
 * POST ISteamMicroTxn/FinalizeTxn/v2
 */
export async function finalizeTxn(orderId: string, config?: SteamPaymentConfig): Promise<SteamFinalizeTxnResponse> {
    const cfg = config || await getSteamPaymentConfig();

    if (!cfg.webApiKey || !cfg.appId) {
        return { success: false, error: 'Steam 支付配置缺失' };
    }

    const url = `${getBaseUrl(cfg.sandbox)}/FinalizeTxn/v2/`;

    const params = new URLSearchParams();
    params.append('key', cfg.webApiKey);
    params.append('orderid', orderId);
    params.append('appid', cfg.appId);

    try {
        console.log('[Steam Pay] FinalizeTxn 请求:', { orderId });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data: any = await response.json();
        console.log('[Steam Pay] FinalizeTxn 响应:', JSON.stringify(data));

        const result = data?.response;
        if (!result) {
            return { success: false, error: '无效的 Steam API 响应' };
        }

        if (result.result === 'OK') {
            return {
                success: true,
                orderid: result.params?.orderid || orderId,
                transid: result.params?.transid || ''
            };
        } else {
            return {
                success: false,
                error: result.error?.errordesc || 'FinalizeTxn 失败',
                errorCode: result.error?.errorcode
            };
        }
    } catch (e: any) {
        console.error('[Steam Pay] FinalizeTxn 异常:', e);
        return { success: false, error: `请求异常: ${e.message}` };
    }
}

/**
 * QueryTxn - 查询交易状态
 * GET ISteamMicroTxn/QueryTxn/v3
 */
export async function queryTxn(orderId: string, config?: SteamPaymentConfig): Promise<SteamQueryTxnResponse> {
    const cfg = config || await getSteamPaymentConfig();

    if (!cfg.webApiKey || !cfg.appId) {
        return { success: false, error: 'Steam 支付配置缺失' };
    }

    const url = new URL(`${getBaseUrl(cfg.sandbox)}/QueryTxn/v3/`);
    url.searchParams.set('key', cfg.webApiKey);
    url.searchParams.set('appid', cfg.appId);
    url.searchParams.set('orderid', orderId);

    try {
        console.log('[Steam Pay] QueryTxn 请求:', { orderId });

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data: any = await response.json();
        console.log('[Steam Pay] QueryTxn 响应:', JSON.stringify(data));

        const result = data?.response;
        if (!result) {
            return { success: false, error: '无效的 Steam API 响应' };
        }

        if (result.result === 'OK') {
            const params = result.params || {};
            return {
                success: true,
                orderid: params.orderid,
                transid: params.transid,
                steamid: params.steamid,
                status: params.status,
                currency: params.currency,
                time: params.time,
                country: params.country,
                items: params.items
            };
        } else {
            return {
                success: false,
                error: result.error?.errordesc || 'QueryTxn 失败',
                errorCode: result.error?.errorcode
            };
        }
    } catch (e: any) {
        console.error('[Steam Pay] QueryTxn 异常:', e);
        return { success: false, error: `请求异常: ${e.message}` };
    }
}

/**
 * GetUserInfo - 获取用户信息（国家、货币、是否可购买）
 * GET ISteamMicroTxn/GetUserInfo/v2
 */
export async function getUserInfo(steamId: string, config?: SteamPaymentConfig): Promise<SteamUserInfoResponse> {
    const cfg = config || await getSteamPaymentConfig();

    if (!cfg.webApiKey) {
        return { success: false, error: 'Steam 支付配置缺失' };
    }

    const url = new URL(`${getBaseUrl(cfg.sandbox)}/GetUserInfo/v2/`);
    url.searchParams.set('key', cfg.webApiKey);
    url.searchParams.set('steamid', steamId);

    try {
        console.log('[Steam Pay] GetUserInfo 请求:', { steamId });

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data: any = await response.json();
        const result = data?.response;

        if (!result) {
            return { success: false, error: '无效的 Steam API 响应' };
        }

        if (result.result === 'OK') {
            const params = result.params || {};
            return {
                success: true,
                steamid: params.steamid,
                country: params.country,
                currency: params.currency,
                status: params.status
            };
        } else {
            return {
                success: false,
                error: result.error?.errordesc || 'GetUserInfo 失败'
            };
        }
    } catch (e: any) {
        console.error('[Steam Pay] GetUserInfo 异常:', e);
        return { success: false, error: `请求异常: ${e.message}` };
    }
}
