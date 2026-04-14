import {sql} from '../db';

export type PaymentSetting = {
    id?: number;
    payment_method: string;        // 支付方式：固定几个选项（zfb, wx, ptb, djq, kf等）
    payment_channel: string;       // 支付渠道：具体的渠道名称
    icon_url?: string;            // 图标URL
    request_url?: string;         // 请求URL
    MinPrice?: number;            // 最小金额
    MaxPrice?: number;            // 最大金额
    Sort?: number;                // 排序
    isClose?: number;             // 用户中心平台币充值启用：1启用，0禁用
    clientIsClose?: number;       // 客户端/SDK启用：1启用，0禁用
};


export const detail = async (id: string) => {
    const result = await sql({
        query: 'SELECT * FROM PaymentSettings WHERE id = ?',
        values: [id],
    }) as any;
    return result.length === 1 ? result[0] as PaymentSetting : null;
};


export const read = async () => {
    const result = await sql({
        query: 'SELECT * FROM PaymentSettings',
    });
    return result as PaymentSetting[];
}

export const GetOpenPaySetting = async () => {
    const result = await sql({
        query: 'SELECT * FROM PaymentSettings where isClose = 1',
    });
    return result as PaymentSetting[];
}




export const update = async (data: PaymentSetting) => {
    await sql({
        query: 'UPDATE PaymentSettings SET payment_method = ?, payment_channel = ?, icon_url = ?, request_url = ?, MinPrice = ?, MaxPrice = ?, Sort = ?, isClose = ?, clientIsClose = ? WHERE id = ?',
        values: [data.payment_method, data.payment_channel, data.icon_url, data.request_url, data.MinPrice, data.MaxPrice, data.Sort, data.isClose, (data.clientIsClose ?? 1), data.id],
    });
}

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM PaymentSettings WHERE id = ?',
        values: [id],
    });
}

export const insert = async (data: PaymentSetting) => {
    const result = await sql({
        query: 'INSERT INTO PaymentSettings (payment_method, payment_channel, icon_url, request_url, MinPrice, MaxPrice, Sort, isClose, clientIsClose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        values: [data.payment_method, data.payment_channel, data.icon_url || '', data.request_url || '', data.MinPrice, data.MaxPrice, data.Sort, (data.isClose ?? 1), (data.clientIsClose ?? 1)],
    });
    return result;
};

