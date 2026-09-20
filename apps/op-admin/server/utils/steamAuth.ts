/**
 * Steam 登录认证模块
 * 
 * 使用 Steam Web API 验证客户端传来的 Session Ticket，
 * 确认用户的 Steam 身份。
 * 
 * API: ISteamUserAuth/AuthenticateUserTicket/v1
 * 文档: https://partner.steamgames.com/doc/webapi/ISteamUserAuth
 */

import { getSystemParam } from './systemConfig';

export interface SteamAuthResult {
    success: boolean;
    steamId?: string;       // 验证通过的 Steam 64-bit ID
    ownerSteamId?: string;  // 如果是借用的游戏，这是实际拥有者的 ID
    vacBanned?: boolean;    // VAC 封禁状态
    publisherBanned?: boolean;
    error?: string;
}

/**
 * 验证 Steam Session Ticket
 * 
 * @param ticket - 客户端获取的 Steam session ticket (hex 编码)
 * @returns 验证结果，包含 Steam ID
 */
export async function verifySteamTicket(ticket: string): Promise<SteamAuthResult> {
    if (!ticket || typeof ticket !== 'string') {
        return { success: false, error: '缺少 ticket 参数' };
    }

    const webApiKey = await getSystemParam('steam_web_api_key', 'F4EE3B464045A8CBD3613DD0361D2338');
    const appId = await getSystemParam('steam_app_id', '4671660');

    if (!webApiKey) {
        return { success: false, error: 'Steam Web API Key 未配置' };
    }

    const url = new URL('https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/');
    url.searchParams.set('key', webApiKey);
    url.searchParams.set('appid', appId);
    url.searchParams.set('ticket', ticket);

    try {
        console.log('[Steam Auth] 验证 ticket, appId:', appId, ', ticket长度:', ticket.length);

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined
        });

        if (!response.ok) {
            console.error('[Steam Auth] HTTP 错误:', response.status, response.statusText);
            return { success: false, error: `Steam API HTTP ${response.status}` };
        }

        const data: any = await response.json();
        console.log('[Steam Auth] 响应:', JSON.stringify(data));

        const result = data?.response?.params;
        if (!result) {
            const errMsg = data?.response?.error?.errordesc || '无效的 Steam API 响应';
            return { success: false, error: errMsg };
        }

        if (result.result === 'OK') {
            return {
                success: true,
                steamId: result.steamid,
                ownerSteamId: result.ownersteamid,
                vacBanned: result.vacbanned === true,
                publisherBanned: result.publisherbanned === true
            };
        } else {
            return {
                success: false,
                error: `验证失败: result=${result.result}`
            };
        }
    } catch (e: any) {
        console.error('[Steam Auth] 验证异常:', e);
        return { success: false, error: `请求异常: ${e.message}` };
    }
}
