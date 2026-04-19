/**
 * 支付网关 - 空壳模块
 * 
 * agent-admin 不直接对接第三方支付网关，所有支付均由 op-admin 处理。
 * 本文件仅保留接口签名以避免编译错误，所有函数调用均返回"不支持"。
 */

import { getSystemParam } from './systemConfig';

export type ThirdPartyRequest = {
    type: string,
    out_trade_no: string,
    name: string,
    money: string,
    notify_url: string,
    return_url: string,
    clientip: string,
    device?: string,
    param?: string
};

export type NormalizedPayResponse = {
    code: number,
    msg: string,
    trade_no?: string,
    qrcode?: string,
    payurl?: string,
    urlscheme?: string,
    html?: string,
    thirdParty?: boolean
};

export type QueryOrderRequest = {
    out_trade_no?: string,
    trade_no?: string
};

export type QueryOrderResponse = {
    code: number,
    msg: string,
    trade_no?: string,
    out_trade_no?: string,
    status?: number,
    money?: string,
    name?: string,
    addtime?: string,
    endtime?: string
};

export interface PaymentProvider {
    key: string;
    execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse>;
    verify?(params: Record<string, any>, creds?: Record<string, any>): boolean;
    query?(req: QueryOrderRequest, creds?: Record<string, any>): Promise<QueryOrderResponse>;
}

export type RoutingContext = {
    paymentMethod?: string;
    agentId?: string;
    appId?: string;
    gameId?: string;
};

// 空的网关参数集
export const gatewayParamSets: Record<string, any> = {};

// 以下所有函数均返回"不支持"，支付功能请通过 op-admin 调用

export async function executePaymentBySystemParam(_req: ThirdPartyRequest): Promise<NormalizedPayResponse> {
    return { code: -1, msg: '本服务不支持发起支付，请通过 op-admin 处理' };
}

export async function selectProviderBySystemParam(_amount?: number, _paymentMethod?: string, _transactionId?: string): Promise<{
    provider: PaymentProvider;
    credentials: Record<string, any>;
    channelId: string;
}> {
    throw new Error('本服务不支持支付网关，请通过 op-admin 处理');
}

export function getProviderByChannelId(_channelId: string): { provider: PaymentProvider; credentials: Record<string, any> } {
    throw new Error('本服务不支持支付网关，请通过 op-admin 处理');
}

export function getChannelDisplayName(channelId: string): string {
    return `渠道${channelId}`;
}

export async function executePaymentByChannelId(_channelId: string, _req: ThirdPartyRequest): Promise<NormalizedPayResponse> {
    return { code: -1, msg: '本服务不支持发起支付，请通过 op-admin 处理' };
}

export async function isSupportQueryBySystemParam(): Promise<boolean> {
    return false;
}

export async function executeQueryBySystemParam(_req: QueryOrderRequest): Promise<QueryOrderResponse> {
    return { code: -1, msg: '本服务不支持询单，请通过 op-admin 处理' };
}

export async function selectPaymentChannelByRules(_amount: number, _paymentMethod?: string, _transactionId?: string): Promise<string> {
    return '0';
}

export function selectProvider(_ctx: RoutingContext): PaymentProvider {
    throw new Error('本服务不支持支付网关，请通过 op-admin 处理');
}
