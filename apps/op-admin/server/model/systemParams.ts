import {sql} from '../db';

export type SystemParam = {
    id?: number;
    key: string;
    content: string;
};

export const detail = async (key: string) => {
    const result = await sql({
        query: 'SELECT * FROM SystemParams WHERE `key` = ?',
        values: [key],
    }) as any;
    return result.length === 1 ? result[0] as SystemParam : null;
};

export const read = async () => {
    const result = await sql({
        query: 'SELECT * FROM SystemParams ORDER BY id ASC',
    });
    return result as SystemParam[];
};

export const update = async (key: string, content: string) => {
    await sql({
        query: 'UPDATE SystemParams SET content = ? WHERE `key` = ?',
        values: [content, key],
    });
};

export const insert = async (data: Omit<SystemParam, 'id'>) => {
    const result = await sql({
        query: 'INSERT INTO SystemParams (`key`, content) VALUES (?, ?)',
        values: [data.key, data.content],
    });
    return result;
};

export const remove = async (key: string) => {
    await sql({
        query: 'DELETE FROM SystemParams WHERE `key` = ?',
        values: [key],
    });
};

// 获取或创建参数
export const getOrCreate = async (key: string, defaultContent: string = '') => {
    let param = await detail(key);
    if (!param) {
        await insert({ key, content: defaultContent });
        param = await detail(key);
    }
    return param;
};

// 获取支付说明
export const getPaymentMessage = async () => {
    const param = await getOrCreate('payment_message', '*平台币说明：1人民币=1平台币，不会过期，可前往盒子或官网进行充值。\n亲爱的玩家：游戏充值后可前往盒子申请福利哦');
    return param?.content || '';
};

// 设置支付说明
export const setPaymentMessage = async (content: string) => {
    await getOrCreate('payment_message', ''); // 确保记录存在
    await update('payment_message', content);
};

// 获取API到账开关
export const getApiDeliveryEnabled = async (): Promise<boolean> => {
    const param = await getOrCreate('payment_api_delivery', 'false');
    return param?.content === 'true';
};

// 设置API到账开关
export const setApiDeliveryEnabled = async (enabled: boolean) => {
    await getOrCreate('payment_api_delivery', 'false');
    await update('payment_api_delivery', enabled ? 'true' : 'false');
};

// 获取API到账测试玩家role_id
export const getApiDeliveryTestRoleId = async (): Promise<string> => {
    const param = await getOrCreate('payment_api_delivery_test_role_id', '');
    return param?.content || '';
};

// 设置API到账测试玩家role_id
export const setApiDeliveryTestRoleId = async (roleId: string) => {
    await getOrCreate('payment_api_delivery_test_role_id', '');
    await update('payment_api_delivery_test_role_id', roleId);
}; 

// 获取退款开关（默认关闭）
export const getPaymentRefundEnabled = async (): Promise<boolean> => {
    const param = await getOrCreate('payment_refund_enabled', 'false');
    return param?.content === 'true';
};

// 设置退款开关
export const setPaymentRefundEnabled = async (enabled: boolean) => {
    await getOrCreate('payment_refund_enabled', 'false');
    await update('payment_refund_enabled', enabled ? 'true' : 'false');
};