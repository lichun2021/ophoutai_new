import crypto from 'crypto';
import { sql } from '../db';
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

// 询单请求参数
export type QueryOrderRequest = {
    out_trade_no?: string,  // 商户订单号
    trade_no?: string        // 平台订单号
};

// 询单响应
export type QueryOrderResponse = {
    code: number,
    msg: string,
    trade_no?: string,
    out_trade_no?: string,
    status?: number,         // 支付状态：0=未支付，1=已支付，2=已退款
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

function buildSignString(params: Record<string, any>): string {
    const filtered: Record<string, any> = {};
    Object.keys(params)
        .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && k !== 'sign' && k !== 'sign_type')
        .sort()
        .forEach(k => { filtered[k] = params[k]; });
    return Object.keys(filtered).map(k => `${k}=${filtered[k]}`).join('&');
}

function normalizePemKey(key: string, type: 'PRIVATE' | 'PUBLIC'): string {
    if (!key) return '';
    const trimmed = key.trim();
    if (trimmed.startsWith('-----BEGIN')) {
        return trimmed;
    }
    const header = type === 'PRIVATE' ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'PRIVATE' ? '-----END PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    const body = trimmed.replace(/\s+/g, '');
    const chunks: string[] = [];
    for (let i = 0; i < body.length; i += 64) {
        chunks.push(body.slice(i, i + 64));
    }
    return `${header}\n${chunks.join('\n')}\n${footer}`;
}

function rsaSign(content: string, privateKey: string): string {
    const pem = normalizePemKey(privateKey, 'PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(content);
    signer.end();
    return signer.sign(pem, 'base64');
}

function derivePublicKey(key: string): string | null {
    if (!key) return null;
    try {
        const maybePrivatePem = normalizePemKey(key, 'PRIVATE');
        const privateKey = crypto.createPrivateKey(maybePrivatePem);
        const publicKey = crypto.createPublicKey(privateKey);
        return publicKey.export({ type: 'spki', format: 'pem' }).toString();
    } catch {
        try {
            return normalizePemKey(key, 'PUBLIC');
        } catch {
            return null;
        }
    }
}

function rsaVerify(content: string, signature: string, key: string): boolean {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content);
    verifier.end();
    const publicPem = derivePublicKey(key);
    if (!publicPem) {
        console.error('[RSA Verify] 无法从提供的密钥生成公钥');
        return false;
    }
    try {
        return verifier.verify(publicPem, signature, 'base64');
    } catch (error) {
        console.error('[RSA Verify] 验签失败:', error);
        return false;
    }
}

// Provider 1: UZEPAY V2（MD5 默认；可切换为 RSA：填入 rsaPrivateKey 与 rsaPlatformPublicKey）
const uzepayV2Config = {
    baseUrl: 'https://pay.uzepay.com/api/pay/create',
    pid: '1024',
    md5Key: 'Qu9BtfCuNTuRB9WAWR1TEBuAebr7uaDQ',
    rsaPrivateKey: '',
    rsaPlatformPublicKey: '',
    defaultMethod: 'web'
};



const uzepayV2Provider: PaymentProvider = {
    key: 'uzepayV2',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = {
            ...uzepayV2Config,
            ...(creds || {})
        };
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const params: Record<string, any> = {
            pid: cfg.pid,
            method: cfg.defaultMethod,
            device: req.device || 'pc',
            type: req.type,
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url,
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            param: req.param || '',
            timestamp,
            sign_type: (cfg.rsaPrivateKey ? 'RSA' : 'MD5')
        };

        if (params.sign_type === 'RSA' && cfg.rsaPrivateKey) {
            // 这里可扩展 RSA 签名；目前仅保留 MD5 方案
            const signString = buildSignString(params);
            params.sign = crypto.createHash('md5').update(signString + (cfg.md5Key || '')).digest('hex');
            params.sign_type = 'MD5';
        } else {
            const signString = buildSignString(params) + (cfg.md5Key || '');
            params.sign = crypto.createHash('md5').update(signString).digest('hex');
            params.sign_type = 'MD5';
        }

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });
        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }
        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 0) {
            const normalized: NormalizedPayResponse = { code: 1, msg: 'success' };
            normalized.trade_no = result.trade_no || result.order_no || result.out_trade_no || (result.data && (result.data.trade_no || result.data.order_no || result.data.out_trade_no)) || '';
            const payType = result.pay_type;
            const info = result.pay_info;
            if (payType === 'qrcode') {
                normalized.qrcode = info;
            } else if (payType === 'jump' || payType === 'html' || payType === 'urlscheme') {
                normalized.payurl = info;
                if (payType === 'html') normalized.html = info;
            } else {
                normalized.payurl = info;
            }
            return normalized;
        }

        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...uzepayV2Config, ...(creds || {}) };
        const provided = String(params.sign || '').trim().toLowerCase();
        const signType = String(params.sign_type || 'MD5').toUpperCase();
        const base = { ...params };
        delete (base as any).sign; delete (base as any).sign_type;
        const signString = buildSignString(base);
        if (signType === 'MD5') {
            const expect = crypto.createHash('md5').update(signString + (cfg.md5Key || '')).digest('hex');
            return expect === provided;
        }
        // 可扩展 RSA 验签
        return true;
    },
    async query(req: QueryOrderRequest, creds?: Record<string, any>): Promise<QueryOrderResponse> {
        const cfg = { ...uzepayV2Config, ...(creds || {}) };
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        // 构建询单参数
        const params: Record<string, any> = {
            pid: cfg.pid,
            timestamp,
            sign_type: 'MD5'
        };
        
        // 至少需要一个订单号
        if (req.trade_no) {
            params.trade_no = req.trade_no;
        }
        if (req.out_trade_no) {
            params.out_trade_no = req.out_trade_no;
        }
        
        // 生成签名
        const signString = buildSignString(params) + (cfg.md5Key || '');
        params.sign = crypto.createHash('md5').update(signString).digest('hex');
        
        
        // 发送询单请求
        const response = await fetch('https://pay.uzepay.com/api/pay/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });
        
        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}` };
        }
        
        const result: any = await response.json().catch(() => ({}));
        
        // 处理响应 - code=0表示成功
        if (Number(result.code) === 0) {
            return {
                code: 0,
                msg: result.msg || 'success',
                trade_no: result.trade_no || '',
                out_trade_no: result.out_trade_no || '',
                status: Number(result.status), // 0=未支付，1=已支付，2=已退款
                money: result.money || '',
                name: result.name || '',
                addtime: result.addtime || '',
                endtime: result.endtime || ''
            };
        }
        
        return { code: result.code || -1, msg: result.msg || '询单失败' };
    }
};


// Provider 3: YXINPAY（与文档一致：pid/type/out_trade_no/...，MD5签名）
const yxinpayConfig = {
    baseUrl: 'https://yxinpay.com/mapi.php',
    queryUrl: 'https://lay.uepay.top/api/pay/query',
    pid: '1001',
    md5Key: '',
    defaultMethod: 'web',
    signType: 'MD5',
    rsaKey: '',  // 我方私钥，用于签名请求
    rsaPlatformPublicKey: ''  // 平台公钥，用于验证回调签名
};

const yxinpayProvider: PaymentProvider = {
    key: 'yxinpayV1',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = { ...yxinpayConfig, ...(creds || {}) };
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signType = String(cfg.signType || 'MD5').toUpperCase();
        const params: Record<string, any> = {
            pid: cfg.pid,
            method: cfg.defaultMethod || 'web',
            device: req.device || 'pc',
            type: req.type,
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url,
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            param: req.param || '',
            sign_type: signType,
            timestamp
        };
        const signSource = buildSignString(params);
        if (signType === 'RSA') {
            const signingKey = cfg.rsaKey;
            if (!signingKey) {
                throw new Error('缺少RSA密钥，无法完成签名');
            }
            params.sign = rsaSign(signSource, signingKey);
        } else {
            const signStr = signSource + (cfg.md5Key || '');
            params.sign = crypto.createHash('md5').update(signStr).digest('hex');
            params.sign_type = 'MD5';
        }

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });
        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }
        try {
            console.log('[Pay][yxinpayV1] URL:', cfg.baseUrl);
            console.log('[Pay][yxinpayV1] PID:', cfg.pid);
            console.log('[Pay][yxinpayV1] Params:', params);
        } catch {}

        const result: any = await response.json().catch(() => ({}));
        const successCode = Number(result.code);
        if (successCode === 0) {
            const normalized: NormalizedPayResponse = {
                code: 1,
                msg: result.msg || 'success',
                trade_no: result.trade_no || ''
            };
            
            // 根据 pay_type 判断如何处理 pay_info
            const payType = result.pay_type || '';
            const payInfo = result.payurl || result.pay_info || result.cashurl || null;
            
            // 除了 qrcode 类型，其他所有类型的 pay_info 都只赋值给 payurl
            if (payInfo) normalized.payurl = payInfo;
            
            if (payType === 'qrcode') {
                // 只有 qrcode 类型时，pay_info 才可能是二维码链接
                if (result.qrcode) normalized.qrcode = result.qrcode;
                else if (!normalized.qrcode && result.pay_info) normalized.qrcode = result.pay_info;
            }
            
            if (result.cashurl && !normalized.payurl) normalized.payurl = result.cashurl;
            if (result.html) normalized.html = result.html;
            if (result.urlscheme) normalized.urlscheme = result.urlscheme;
            
            try {
                console.log('[Pay][yxinpayV1] Normalized:', normalized);
            } catch {}
            
            return normalized;
        }
        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...yxinpayConfig, ...(creds || {}) };
        const signType = String(params.sign_type || cfg.signType || 'MD5').toUpperCase();
        // console.log('[Pay][yxinpayV1] 签名验证开始');
        // console.log('[Pay][yxinpayV1] 签名类型:', signType);
        // console.log('[Pay][yxinpayV1] 配置的签名类型:', cfg.signType);
        // console.log('[Pay][yxinpayV1] 回调参数:', JSON.stringify(params, null, 2));
        
        const base = { ...params };
        delete (base as any).sign; delete (base as any).sign_type;
        const signSource = buildSignString(base);
        // console.log('[Pay][yxinpayV1] 签名字符串:', signSource);
        
        if (signType === 'RSA') {
            // 验签使用平台公钥
            const platformPublicKey = cfg.rsaPlatformPublicKey;
            // console.log('[Pay][yxinpayV1] 平台公钥存在:', !!platformPublicKey);
            // console.log('[Pay][yxinpayV1] 平台公钥长度:', platformPublicKey ? platformPublicKey.length : 0);
            if (!platformPublicKey) {
                console.error('[Pay][yxinpayV1] 缺少平台公钥，无法验签');
                return false;
            }
            const signature = String(params.sign || '').trim();
            // console.log('[Pay][yxinpayV1] 签名值长度:', signature.length);
            if (!signature) {
                console.error('[Pay][yxinpayV1] 签名值为空');
                return false;
            }
            const result = rsaVerify(signSource, signature, platformPublicKey);
            console.log('[Pay][yxinpayV1] RSA验签结果:', result);
            return result;
        }
        const provided = String(params.sign || '').trim().toLowerCase();
        const signStr = signSource + (cfg.md5Key || '');
        const expect = crypto.createHash('md5').update(signStr).digest('hex');
        // console.log('[Pay][yxinpayV1] MD5验签 - 期望:', expect);
        // console.log('[Pay][yxinpayV1] MD5验签 - 实际:', provided);
        const result = expect === provided;
        console.log('[Pay][yxinpayV1] MD5验签结果:', result);
        return result;
    },
    async query(req: QueryOrderRequest, creds?: Record<string, any>): Promise<QueryOrderResponse> {
        const cfg = { ...yxinpayConfig, ...(creds || {}) };
        const queryUrl = cfg.queryUrl ;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signType = String(cfg.signType || 'MD5').toUpperCase();
        const params: Record<string, any> = {
            pid: cfg.pid,
            sign_type: signType,
            timestamp
        };
        if (req.trade_no) {
            params.trade_no = req.trade_no;
        }
        if (req.out_trade_no) {
            params.out_trade_no = req.out_trade_no;
        }
        const signSource = buildSignString(params);
        if (signType === 'RSA') {
            const signingKey = cfg.rsaKey;
            if (!signingKey) {
                throw new Error('缺少RSA密钥，无法完成询单签名');
            }
            params.sign = rsaSign(signSource, signingKey);
        } else {
            const signStr = signSource + (cfg.md5Key || '');
            params.sign = crypto.createHash('md5').update(signStr).digest('hex');
            params.sign_type = 'MD5';
        }

        // try {
        //     console.log('[Query][yxinpayV1] URL:', queryUrl);
        //     console.log('[Query][yxinpayV1] Params:', params);
        // } catch {}

        const response = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });
        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}` };
        }

        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 0) {
            return {
                code: 0,
                msg: result.msg || 'success',
                trade_no: result.trade_no || '',
                out_trade_no: result.out_trade_no || '',
                status: Number(result.status ?? -1),
                money: result.money || '',
                name: result.name || '',
                addtime: result.addtime || '',
                endtime: result.endtime || ''
            };
        }

        return {
            code: Number(result.code ?? -1),
            msg: result.msg || '询单失败'
        };
    }
};

const mimmmaConfig = {
    baseUrl: 'https://mimmma.donglong666.top/mapi.php',
    pid: '80388',
    md5Key: '64ddc6e25e615b545bfd80846b817abd'
};

const mimmmaProvider: PaymentProvider = {
    key: 'mimmmaV1',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = { ...mimmmaConfig, ...(creds || {}) };
        const params: Record<string, any> = {
            pid: cfg.pid,
            type: req.type || 'alipay',
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url,
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            device: req.device || 'pc',
            param: req.param || '',
            sign_type: 'MD5'
        };

        const signStr = buildSignString(params) + (cfg.md5Key || '');
        params.sign = crypto.createHash('md5').update(signStr).digest('hex');

        try {
            console.log('[Pay][mimmmaV1] URL:', cfg.baseUrl);
            console.log('[Pay][mimmmaV1] Params:', params);
        } catch {}

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }

        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 1) {
            return {
                code: 1,
                msg: result.msg || 'success',
                trade_no: result.trade_no || result.cashurl || '',
                payurl: result.payurl || result.cashurl || null,
                qrcode: result.qrcode || null,
                html: result.html || null
            };
        }

        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...mimmmaConfig, ...(creds || {}) };
        const base = { ...params };
        delete (base as any).sign;
        delete (base as any).sign_type;
        const provided = String(params.sign || '').trim().toLowerCase();
        const signStr = buildSignString(base) + (cfg.md5Key || '');
        const expect = crypto.createHash('md5').update(signStr).digest('hex');
        return expect === provided;
    }
};

const ahqlhConfig = {
    baseUrl: 'https://zf.ahqlhkj.top/mapi.php',
    apiUrl: 'https://zf.ahqlhkj.top/api.php',
    pid: '1178',
    md5Key: 'WaA080Yn4KjJWZkUIIW8T0uQAviJuqY4'
};

const ahqlhProvider: PaymentProvider = {
    key: 'ahqlhV1',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = { ...ahqlhConfig, ...(creds || {}) };
        
        // 转换支付类型为该网关要求的格式
        let payType = req.type || 'alipay';
        if (payType === 'zfb') payType = 'alipay';
        if (payType === 'wx' || payType === 'weixin') payType = 'wxpay';

        const params: Record<string, any> = {
            pid: cfg.pid,
            type: payType,
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url,
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            device: req.device || 'pc',
            param: req.param || '',
            sign_type: 'MD5'
        };

        const signStr = buildSignString(params) + (cfg.md5Key || '');
        params.sign = crypto.createHash('md5').update(signStr).digest('hex');

        try {
            console.log('[Pay][ahqlhV1] URL:', cfg.baseUrl);
            console.log('[Pay][ahqlhV1] Params:', params);
        } catch {}

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }

        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 1) {
            return {
                code: 1,
                msg: result.msg || 'success',
                trade_no: result.trade_no || '',
                payurl: result.payurl || null,
                qrcode: result.qrcode || null,
                urlscheme: result.urlscheme || null,
                thirdParty: true
            };
        }

        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...ahqlhConfig, ...(creds || {}) };
        const base = { ...params };
        delete (base as any).sign;
        delete (base as any).sign_type;
        const provided = String(params.sign || '').trim().toLowerCase();
        const signStr = buildSignString(base) + (cfg.md5Key || '');
        const expect = crypto.createHash('md5').update(signStr).digest('hex');
        return expect === provided;
    },
    async query(req: QueryOrderRequest, creds?: Record<string, any>): Promise<QueryOrderResponse> {
        const cfg = { ...ahqlhConfig, ...(creds || {}) };
        
        // 构建查询参数
        const params: Record<string, any> = {
            act: 'order',
            pid: cfg.pid,
            key: cfg.md5Key
        };

        if (req.trade_no) {
            params.trade_no = req.trade_no;
        } else if (req.out_trade_no) {
            params.out_trade_no = req.out_trade_no;
        }

        const queryUrl = `${cfg.apiUrl}?${new URLSearchParams(params).toString()}`;

        try {
            const response = await fetch(queryUrl, {
                method: 'GET',
                signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
            });

            if (!response.ok) {
                return { code: -1, msg: `HTTP错误: ${response.status}` };
            }

            const result: any = await response.json().catch(() => ({}));

            if (Number(result.code) === 1) {
                return {
                    code: 0, // 系统内部成功的 code 是 0
                    msg: result.msg || 'success',
                    trade_no: result.trade_no || '',
                    out_trade_no: result.out_trade_no || '',
                    status: Number(result.status), // 1为成功，0为未支付
                    money: result.money || '',
                    name: result.name || '',
                    addtime: result.addtime || '',
                    endtime: result.endtime || ''
                };
            }

            return {
                code: Number(result.code || -1),
                msg: result.msg || '订单不存在或查询失败'
            };
        } catch (error: any) {
            return { code: -1, msg: `查询异常: ${error.message}` };
        }
    }
};

const meidaConfig = {
    baseUrl: 'https://a115a.xtpay.xyz/mapi.php',
    apiUrl: 'https://a115a.xtpay.xyz/api.php',
    pid: '6525',
    md5Key: 'PnyQyCt959qpGCqNqNN15w04laa154T5'
};

const meidaProvider: PaymentProvider = {
    key: 'meidaV1',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = { ...meidaConfig, ...(creds || {}) };
        
        let payType = req.type || 'alipay';
        if (payType === 'zfb') payType = 'alipay';
        if (payType === 'wx' || payType === 'weixin') payType = 'wxpay';

        const params: Record<string, any> = {
            pid: cfg.pid,
            type: payType,
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url,
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            device: req.device || 'pc',
            param: req.param || '',
            sign_type: 'MD5'
        };

        // 易支付签名算法：ASCII 排序，过滤空值/0/sign/sign_type
        const filtered: Record<string, any> = {};
        Object.keys(params)
            .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && params[k] !== 0 && params[k] !== '0' && k !== 'sign' && k !== 'sign_type')
            .sort()
            .forEach(k => { filtered[k] = params[k]; });
        const signSource = Object.keys(filtered).map(k => `${k}=${filtered[k]}`).join('&');
        
        const signStr = signSource + (cfg.md5Key || '');
        params.sign = crypto.createHash('md5').update(signStr).digest('hex');

        try {
            console.log('[Pay][meidaV1] URL:', cfg.baseUrl);
            console.log('[Pay][meidaV1] Params:', params);
        } catch {}

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }

        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 1) {
            return {
                code: 1,
                msg: result.msg || 'success',
                trade_no: result.trade_no || '',
                payurl: result.payurl || null,
                qrcode: result.qrcode || null,
                urlscheme: result.urlscheme || null,
                thirdParty: true
            };
        }

        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...meidaConfig, ...(creds || {}) };
        const base = { ...params };
        delete (base as any).sign;
        delete (base as any).sign_type;
        
        // 校验签名也需要遵循：值为空或0时不参与签名
        const filtered: Record<string, any> = {};
        Object.keys(base)
            .filter(k => base[k] !== '' && base[k] !== null && base[k] !== undefined && base[k] !== 0 && base[k] !== '0')
            .sort()
            .forEach(k => { filtered[k] = base[k]; });
        const signSource = Object.keys(filtered).map(k => `${k}=${filtered[k]}`).join('&');

        const provided = String(params.sign || '').trim().toLowerCase();
        const signStr = signSource + (cfg.md5Key || '');
        const expect = crypto.createHash('md5').update(signStr).digest('hex');
        return expect === provided;
    },
    async query(req: QueryOrderRequest, creds?: Record<string, any>): Promise<QueryOrderResponse> {
        const cfg = { ...meidaConfig, ...(creds || {}) };
        
        const params: Record<string, any> = {
            act: 'order',
            pid: cfg.pid,
            sign_type: 'MD5'
        };

        if (req.trade_no) {
            params.trade_no = req.trade_no;
        } else if (req.out_trade_no) {
            params.out_trade_no = req.out_trade_no;
        }

        // 易支付查询接口签名：ASCII 排序，过滤空值/0/sign/sign_type
        const filtered: Record<string, any> = {};
        Object.keys(params)
            .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && params[k] !== 0 && params[k] !== '0' && k !== 'sign' && k !== 'sign_type')
            .sort()
            .forEach(k => { filtered[k] = params[k]; });
        const signSource = Object.keys(filtered).map(k => `${k}=${filtered[k]}`).join('&');
        
        const signStr = signSource + (cfg.md5Key || '');
        params.sign = crypto.createHash('md5').update(signStr).digest('hex');

        const queryUrl = `${cfg.apiUrl}?${new URLSearchParams(params).toString()}`;

        try {
            const response = await fetch(queryUrl, {
                method: 'GET',
                signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
            });

            if (!response.ok) {
                return { code: -1, msg: `HTTP错误: ${response.status}` };
            }

            const result: any = await response.json().catch(() => ({}));

            if (Number(result.code) === 1) {
                return {
                    code: 0, 
                    msg: result.msg || 'success',
                    trade_no: result.trade_no || '',
                    out_trade_no: result.out_trade_no || '',
                    status: Number(result.status), 
                    money: result.money || '',
                    name: result.name || '',
                    addtime: result.addtime || '',
                    endtime: result.endtime || ''
                };
            }

            return {
                code: Number(result.code || -1),
                msg: result.msg || '订单不存在或查询失败'
            };
        } catch (error: any) {
            return { code: -1, msg: `查询异常: ${error.message}` };
        }
    }
};

const sxjzszConfig = {
    baseUrl: 'https://payment.sxjzsz.com/v1/pay/create',
    pid: '100131',
    md5Key: 'XL5bNCUdYIaNvU9ZoEdLZaYaf4fBwo31'
};

const sxjzszProvider: PaymentProvider = {
    key: 'sxjzszV1',
    async execute(req: ThirdPartyRequest, creds?: Record<string, any>): Promise<NormalizedPayResponse> {
        const cfg = { ...sxjzszConfig, ...(creds || {}) };
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        let payType = req.type || 'alipay';
        if (payType === 'zfb' || payType === 'alipay') payType = 'alipay';
        if (payType === 'wx' || payType === 'weixin' || payType === 'wxpay') payType = 'wxpay';

        const params: Record<string, any> = {
            pid: cfg.pid,
            type: payType,
            out_trade_no: req.out_trade_no,
            notify_url: req.notify_url,
            return_url: req.return_url || '',
            name: req.name,
            money: req.money,
            clientip: req.clientip,
            param: req.param || '',
            timestamp,
            sign_type: 'md5'
        };

        const signStr = buildSignString(params) + cfg.md5Key;
        params.sign = crypto.createHash('md5').update(signStr).digest('hex');

        try {
            console.log('[Pay][sxjzszV1] URL:', cfg.baseUrl);
            console.log('[Pay][sxjzszV1] Params:', params);
        } catch {}

        const response = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams(params).toString(),
            signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined
        });

        if (!response.ok) {
            return { code: -1, msg: `HTTP错误: ${response.status}`, thirdParty: true };
        }

        const result: any = await response.json().catch(() => ({}));

        if (Number(result.code) === 0) { // 该网关 0 为成功
            const data = result.data || {};
            return {
                code: 1,
                msg: result.msg || 'success',
                trade_no: data.trade_no || '',
                payurl: data.payurl || null,
                html: data.html || null,
                thirdParty: true
            };
        }

        return { code: -1, msg: result.msg || '第三方返回失败', thirdParty: true };
    },
    verify(params: Record<string, any>, creds?: Record<string, any>): boolean {
        const cfg = { ...sxjzszConfig, ...(creds || {}) };
        const base = { ...params };
        delete (base as any).sign;
        delete (base as any).sign_type;
        const provided = String(params.sign || '').trim().toLowerCase();
        const signStr = buildSignString(base) + cfg.md5Key;
        const expect = crypto.createHash('md5').update(signStr).digest('hex');
        return expect === provided;
    }
};

const providers: Record<string, PaymentProvider> = {
    [uzepayV2Provider.key]: uzepayV2Provider,
    [yxinpayProvider.key]: yxinpayProvider,
    [mimmmaProvider.key]: mimmmaProvider,
    [ahqlhProvider.key]: ahqlhProvider,
    [meidaProvider.key]: meidaProvider,
    [sxjzszProvider.key]: sxjzszProvider
};

export type RoutingContext = {
    paymentMethod?: string;
    agentId?: string;
    appId?: string;
    gameId?: string;
};

type Rule = { when: (c: RoutingContext) => boolean; providerKey: string };

// 路由规则：按参数选择不同网关
const rules: Rule[] = [
    // 示例：按支付方式路由到 UZEPAY
    { when: (c) => ['zfb', 'wx', 'yl'].includes((c.paymentMethod || '').toLowerCase()), providerKey: 'uzepayV2' },
    // 示例：特定渠道走 UZEPAY
    { when: (c) => (c.agentId || '').toLowerCase() === 'opsf', providerKey: 'uzepayV2' },
    // 兜底：走备选 MD5 网关
    { when: (_c) => true, providerKey: 'altMd5V1' }
];

export function selectProvider(ctx: RoutingContext): PaymentProvider {
    const matched = rules.find(r => {
        try { return r.when(ctx); } catch { return false; }
    });
    const key = matched ? matched.providerKey : 'uzepayV2';
    return providers[key] || uzepayV2Provider;
}

// 多套参数：在TS中配置，选择依据来自系统参数 payment
type GatewayParamSet = {
    providerKey: string;
    credentials: Record<string, any>;
};

export const gatewayParamSets: Record<string, GatewayParamSet & { supportQuery?: boolean; isOpen?: boolean; name?: string; remark?: string }> = {
    // payment=1 使用 uzepayV2 一套参数，支持询单
    '1': {
        providerKey: 'uzepayV2',
        supportQuery: true,  // 支持询单功能
        isOpen: true,  // 渠道是否启用
        credentials: {
            baseUrl: 'https://pay.uzepay.com/api/pay/create',
            pid: '1024',
            md5Key: 'Qu9BtfCuNTuRB9WAWR1TEBuAebr7uaDQ',
            defaultMethod: 'web'
        }
    },
    // payment=2 走 yxinpay，暂不支持询单
    '2': {
        providerKey: 'yxinpayV1',
        supportQuery: true,
        isOpen: true,  // 渠道是否启用
        credentials: {
            baseUrl: 'https://lay.uepay.top/api/pay/create',
            queryUrl: 'https://lay.uepay.top/api/pay/query',
            pid: '6',
            md5Key: 'OTtEfPp9JHB6cUJ0bju60BvPuihj0Y6O',
            defaultMethod: 'web',
            signType: 'RSA',
            rsaKey: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6kkUYQtthnrSyFMyFwJlJ+haz6jFn4p21TnGVJ0fkvR7P6IAPG1wiZgv7QPQfrnmZoaLLGaHfP8HlgIxMDWc/pbaldz/BxWHiDPRgT0cygBGIrqwdPDKsm5T4rfKZwNXDsJHMmzGvvKn9nEYsFmdLkUmb5G3ilRxd3vQCG4H7pFTnpzQaIsLkG4KpXROcpqiHMxqvWW50VK+ttIUU58tjPD2Mxd/jQqPyHgF25L0zEywwG6Mcmz82j6bHGj/HMwVB93i1QZqGEPIkIwd38cWdDqor79k5ednUww3+0Pz1rRqh1i8veOAP1y+uEu7xaQQK8T8x2lNZ7+maVr3eFrYDAgMBAAECggEASj3wbtIT+Imt//tU05irpwt0w01bMaq09TPs8Nx7uGMlgrhTVS+e/zU6aVYUjxLf4qm2XTmq92qonsoDijP/NQ2dW8TTQylnZQugpz6E52ydDZXseYm95H/YzQhzNInOxptZuWC8aeEaiAgKyHp1ylVbRESnEXYinpwc30XQ+LBiivLeXbwTrLiOklGZakeGSCbxSygsgPeCMTPIzu6YUWV3fjcfFTKgde2l129MDYRDU4kmIbsmKbbQzQWAUU0gzM3e/2DvgZqhTRPCvQKPUi09GUaONnkARbNtmL1aea8ET/exJFHZliKtgHujwKPl1VGfQn8DXhI2ItZSpIC5GQKBgQDraAZ7/TWsL77r9wr+Tta4DX5y/9TD9Y3ks7JZdZvKlx5eKoV72d0ihbc3iATXtW3coS+4CLkE5WNGizIybLLS+wEmuoHL9zdNWwaNNxWGVUxHU/sf2JdZoNNdD6QUTfTM/1QUEZ1Be45f/r232slHn1GReOzGrYkRZQF3LSSGrQKBgQDK5JMraN7ma4WyUiiA/YFnOgjneJxlOFMbHDBswaFklJP5UlfRxTINPeQEmDv9CsCaCWevj/0gJem6Ue5rbOHjMpEsu+BW3LtIYKe0TzL2HKuC6JGOB37E+BvVDoT6kdCbyGEry2GVcz/4ZsTpsZaDit/cpKyWHa0tMBOtwSi1bwKBgAFmnxNB0H3z0skIsVIOGg0CV4xLpXJ9FZkU0KzjnEe6Wn3o9t5jz4MTFKIJ9y1pcPvtIaGQu7khvFOBJI1UREQpJjqaxYb3M6cMMZ/JgiFIhKmwAECSQ2RPJrLZEvrj8978bf2olSz8lT5Q/8QGU0hP1GZvN8l+4t/tn/KbnCoJAoGBAMkgCRuxG7UCxUfd1bT4l/yCNS1wDGjyir+HFCHbWGfiOUWf8NpLRrCFt7EuT9kpfX+07wnEDMJ/ktBWQ6hOCSY1jF/x5hN1QFohJl3BXN1H0mU0soU+vNX4tW5gtEXHoimrW1gUhqml07Yj+fNHTdMcKYoJ2+P7ix4OWJOXtQkVAoGAGGGNi5PA69jJuabgoOzsHsV2OEHSRSRA6SVZAwalSaHZnSws5Y4m7l+ep+74XoQEM7cpw4Duutn++0U0wnDyNgL15vR2hySgSWLUhEqBWp3lSOZjjwJMlhedGBSC8IEUv+It3Yxy/WZoIBTb41Wl8OcomUNMVQ2ICQeUreUCE5g=',
            rsaPlatformPublicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoTrLkcqCmJMoMm40tWXcZ+SOnvW36gapwLzpJF9x1MepPt/icLvXtZmZAYKDHe+ccOapna9zd7bQ+rCFfIMoLhs3WUuBT22F+praheWRMl0avkWIdQSk5yQQcZxMEsGtYRg2C58qtkFeLfUZl6BUbh3pqCvAtjRKv95c2CLgPTyzhKh7JCVWI7pM8qnTyk1dj1A8bSH/cCkqnFk7GJbwEKc3Mjp5HlP/rOpxvhUflCBnN/HL91HAtgb4BKf48gjED/AlMQ0YYoNgD8OF3wwykvEx4KbVrsl4wOpPUfcKegIRZ1UxOYWQu2fiQas/i4fVV8TLZJPopp1DSyvIf29rqQIDAQAB'
        }
    },
    // payment=3 走示例 MD5 网关，暂不支持询单
    '3': {
        providerKey: 'mimmmaV1',
        supportQuery: false,
        isOpen: true,
        credentials: {
            baseUrl: 'https://mimmma.donglong666.top/mapi.php',
            pid: '80388',
            md5Key: '64ddc6e25e615b545bfd80846b817abd'
        }
    },
    // payment=4 接入 ahqlhPay
    '4': {
        providerKey: 'ahqlhV1',
        name: '老许强盛支付5%',  
        supportQuery: true,
        isOpen: true,
        credentials: {
            baseUrl: 'https://zf.ahqlhkj.top/mapi.php',
            apiUrl: 'https://zf.ahqlhkj.top/api.php',
            pid: '1178',
            md5Key: 'WaA080Yn4KjJWZkUIIW8T0uQAviJuqY4'
        }
    },
    // payment=5 接入 sxjzszPay
    '5': {
        providerKey: 'sxjzszV1',
        name: '贝宝支付5%',
        supportQuery: false,
        isOpen: true,
        credentials: {
            baseUrl: 'https://payment.sxjzsz.com/v1/pay/create',
            pid: '100131',
            merchantId: '696891cb161ebac77ca2538f',
            md5Key: 'XL5bNCUdYIaNvU9ZoEdLZaYaf4fBwo31'
        }
    },
    // payment=6 接入 meidaPay
    '6': {
        providerKey: 'meidaV1',
        name: '美达支付5%',
        remark: '美达支付5%',
        supportQuery: true,
        isOpen: true,
        credentials: {
            baseUrl: 'https://a115a.xtpay.xyz/mapi.php',
            apiUrl: 'https://a115a.xtpay.xyz/api.php',
            pid: '6525',
            md5Key: 'PnyQyCt959qpGCqNqNN15w04laa154T5'
        }
    }
};

// 智能选择支付渠道
export async function selectPaymentChannelByRules(amount: number, paymentMethod?: string, transactionId?: string): Promise<string> {
    try {
        const defaultChannel = await getSystemParam('payment', '1');
        const { getActiveRules, saveOrderRuleMapping, getOrderRuleMapping } = await import('../model/paymentRouting');

        // 🚨 核心逻辑：如果是重复请求（如拉起支付链接时的二次计算），直接从 Redis 获取初始决策
        if (transactionId) {
            const savedRuleId = await getOrderRuleMapping(transactionId);
            if (savedRuleId) {
                const ruleResult = await sql({
                    query: 'SELECT payment_channel FROM PaymentRoutingRules WHERE id = ?',
                    values: [savedRuleId]
                }) as any[];
                if (ruleResult.length > 0 && ruleResult[0].payment_channel) {
                    const memoizedChannel = String(ruleResult[0].payment_channel);
                    console.log(`[Payment Routing] 🎯 订单 ${transactionId} 命中 Redis 决策记忆，直接返回渠道: ${memoizedChannel}`);
                    return memoizedChannel;
                }
            }
        }

        // 1. 检查是否启用智能路由
        const routingEnabled = await getSystemParam('payment_routing_enabled', 'false');
        if (routingEnabled !== 'true') {
            console.log(`[Payment Routing] 已关闭，使用默认渠道: ${defaultChannel}`);
            return defaultChannel;
        }

        const routingMode = await getSystemParam('payment_routing_mode', 'auto');
        if (routingMode === 'manual') {
            console.log(`[Payment Routing] 当前为手动模式，使用默认渠道: ${defaultChannel}`);
            return defaultChannel;
        }

        const rules = await getActiveRules();
        console.log(`[Payment Routing] 获取到 ${rules.length} 条激活规则`);
        
        // 找到第一个匹配的规则（金额、时间、额度、支付方式）
        let matchedRule = null;
        for (const rule of rules) {
            const matched = await matchRuleConditions(rule, amount, paymentMethod);
            console.log(`[Payment Routing] 检查规则: ${rule.rule_name || '未命名'} (ID: ${rule.id}, 目标渠道: ${rule.payment_channel}) -> ${matched ? '匹配成功' : '不匹配'}`);
            if (matched) {
                matchedRule = rule;
                break;
            }
        }

        if (!matchedRule) {
            console.log(`[Payment Routing] 无匹配规则，回退到默认渠道: ${defaultChannel}`);
            return defaultChannel;
        }

        console.log(`[Payment Routing] 最终匹配到规则: ${matchedRule.rule_name || '未命名'}, 目标渠道: ${matchedRule.payment_channel}`);
        
        // 将订单与规则的映射关系存入 Redis（有效期 24h），供后续回调成功时增加额度
        if (transactionId && matchedRule.id) {
            await saveOrderRuleMapping(transactionId, matchedRule.id);
        }

        const selectedChannel = matchedRule.payment_channel;

        console.log(`[Payment Routing] ✓ 最终选择渠道: ${selectedChannel}`);
        return selectedChannel;

    } catch (error) {
        console.error('[Payment Routing] 路由发生异常，使用默认配置:', error);
        return await getSystemParam('payment', '1');
    }
}

// 辅助函数：检查规则条件（金额、时间、额度、支付方式）
async function matchRuleConditions(rule: any, amount: number, paymentMethod?: string): Promise<boolean> {
    const { checkAndUpdateQuota } = await import('../model/paymentRouting');
    
    // 0. 检查支付方式是否允许
    if (paymentMethod) {
        const method = paymentMethod.toLowerCase();
        const isZfb = method.includes('zfb') || method.includes('ali');
        const isWx = method.includes('wx') || method.includes('weixin') || method.includes('wechat');
        
        if (isZfb && rule.allow_zfb === 0) return false;
        if (isWx && rule.allow_wx === 0) return false;
    }

    // 1. 检查金额范围
    if (rule.min_amount !== null && rule.min_amount !== undefined) {
        if (amount < rule.min_amount) return false;
    }
    if (rule.max_amount !== null && rule.max_amount !== undefined) {
        if (amount > rule.max_amount) return false;
    }

    // 2. 检查时间段
    if (rule.time_start && rule.time_end) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8);
        
        if (rule.time_start < rule.time_end) {
            // 正常时间段
            if (currentTime < rule.time_start || currentTime > rule.time_end) {
                return false;
            }
        } else {
            // 跨天时间段
            if (currentTime < rule.time_start && currentTime > rule.time_end) {
                return false;
            }
        }
    }

    // 3. 检查每日额度
    const quotaOk = await checkAndUpdateQuota(rule, amount);
    if (!quotaOk) {
        return false;
    }

    return true;
}

export async function selectProviderBySystemParam(amount?: number, paymentMethod?: string, transactionId?: string): Promise<{ 
    provider: PaymentProvider; 
    credentials: Record<string, any>;
    channelId: string;
}>{
    // 1. 优先获取开关状态和系统配置的默认渠道
    const routingEnabled = await getSystemParam('payment_routing_enabled', 'false');
    const defaultChannel = await getSystemParam('payment', '1');
    console.log(`[Payment Gateway] 当前路由状态: ${routingEnabled}, 系统默认渠道: ${defaultChannel}`);
    
    let key: string;
    
    // 2. 严格策略：只有当路由开启且金额有效时才进入匹配，否则唯一的渠道就是 defaultChannel
    if (routingEnabled === 'true' && amount !== undefined && amount > 0) {
        key = await selectPaymentChannelByRules(amount, paymentMethod, transactionId);
    } else {
        key = defaultChannel;
        console.log(`[Payment Gateway] 路由已关闭或条件不足，严格使用系统唯一默认渠道: ${key}`);
    }
    
    // 如果返回的渠道 ID 不在我们的 JS 配置中，尝试回退到默认渠道 1
    const set = gatewayParamSets[key] || gatewayParamSets['1'];
    const provider = providers[set.providerKey] || uzepayV2Provider;
    
    console.log(`[Payment Gateway] 最终使用渠道 ID: ${key} (提供商: ${set.providerKey})`);
    
    return { provider, credentials: set.credentials, channelId: key };
}

export async function executePaymentBySystemParam(req: ThirdPartyRequest): Promise<NormalizedPayResponse> {
    const amount = parseFloat(req.money);
    // 传入 transactionId (存放在 req.param 或 req.out_trade_no)
    const { provider, credentials } = await selectProviderBySystemParam(amount, req.type, req.param);
    return provider.execute(req, credentials);
}

export function getProviderByChannelId(channelId: string): { provider: PaymentProvider; credentials: Record<string, any> } {
    const config = gatewayParamSets[channelId];
    if (!config) {
        throw new Error(`未知的支付渠道: ${channelId}`);
    }
    const provider = providers[config.providerKey] || uzepayV2Provider;
    return { provider, credentials: config.credentials };
}

export function getChannelDisplayName(channelId: string): string {
    const config = gatewayParamSets[channelId];
    return config?.name || config?.remark || `渠道${channelId}`;
}

export async function executePaymentByChannelId(channelId: string, req: ThirdPartyRequest): Promise<NormalizedPayResponse> {
    const { provider, credentials } = getProviderByChannelId(channelId);
    return provider.execute(req, credentials);
}

// 检查当前配置的支付渠道是否支持询单
export async function isSupportQueryBySystemParam(): Promise<boolean> {
    const key = await getSystemParam('payment', '1');
    const set = gatewayParamSets[key] || gatewayParamSets['1'];
    return set.supportQuery === true;
}

// 执行询单请求
export async function executeQueryBySystemParam(req: QueryOrderRequest): Promise<QueryOrderResponse> {
    const key = await getSystemParam('payment', '1');
    const set = gatewayParamSets[key] || gatewayParamSets['1'];
    
    // 检查是否支持询单
    if (!set.supportQuery) {
        return {
            code: -1,
            msg: '当前支付渠道不支持询单功能'
        };
    }
    
    const provider = providers[set.providerKey] || uzepayV2Provider;
    
    // 检查provider是否实现了query方法
    if (!provider.query) {
        return {
            code: -1,
            msg: '当前支付渠道未实现询单接口'
        };
    }
    
    return provider.query(req, set.credentials);
}
