import { createError, getHeader, getRequestURL, readRawBody, sendProxy, type H3Event } from 'h3';

type GiftPaymentPath = '/sdkapi/Unipay/pay' | '/api/payment/third-party-notify'
    | '/api/payment/cashier-notify' | '/api/internal/payment/query';

export async function findPaymentNotificationOrder<T>(
    params: Record<string, unknown>,
    runQuery: (options: { query: string; values: unknown[] }) => Promise<unknown>,
): Promise<T | null> {
    const identifiers: string[] = [];
    for (const key of ['extParam', 'outTradeNo', 'tradeNo', 'trade_no', 'out_trade_no']) {
        const value = params[key];
        if (value === undefined || value === null || value === '') continue;
        if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
            throw createError({ statusCode: 400, message: '支付通知订单号无效' });
        }
        if (!identifiers.includes(String(value))) identifiers.push(String(value));
    }
    if (!identifiers.length) return null;

    const placeholders = identifiers.map(() => '?').join(',');
    const rows = await runQuery({
        query: `SELECT * FROM paymentrecords
                WHERE transaction_id IN (${placeholders}) OR mch_order_id IN (${placeholders}) LIMIT 2`,
        values: [...identifiers, ...identifiers],
    }) as T[];
    if (rows.length > 1) {
        throw createError({ statusCode: 400, message: '支付通知订单号匹配冲突' });
    }
    return rows[0] ?? null;
}

// 礼包支付和交付统一由同机 op-admin 校验，保留网关的原始签名参数。
export async function forwardGiftPayment(event: H3Event, path: GiftPaymentPath, params?: Record<string, unknown>) {
    if (getHeader(event, 'x-gift-payment-proxy')) {
        throw createError({ statusCode: 502, message: '礼包支付转发配置错误' });
    }

    const base = (process.env.OP_ADMIN_URL || process.env.OP_ADMIN_BASE_URL || 'http://127.0.0.1:3003')
        .replace(/\/+$/, '');
    const target = new URL(`${base}${path}${getRequestURL(event).search}`);
    if (!['http:', 'https:'].includes(target.protocol)) {
        throw createError({ statusCode: 502, message: '礼包支付服务地址无效' });
    }

    const method = params ? 'POST' : event.method;
    const body = params ? JSON.stringify(params)
        : method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(event, false);
    return sendProxy(event, target.href, {
        headers: {
            'content-type': params ? 'application/json' : getHeader(event, 'content-type') || 'application/json',
            'user-agent': getHeader(event, 'user-agent') || '',
            'x-forwarded-for': getHeader(event, 'x-forwarded-for') || '',
            'x-real-ip': getHeader(event, 'x-real-ip') || '',
            'x-gift-payment-proxy': '1'
        },
        fetchOptions: { method, body: Buffer.isBuffer(body) ? Uint8Array.from(body) : body, redirect: 'manual', signal: AbortSignal.timeout(30_000) }
    });
}
