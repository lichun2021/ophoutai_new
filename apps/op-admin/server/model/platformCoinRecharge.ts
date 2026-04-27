import {sql} from '../db';

export type PlatformCoinRechargeRecord = {
    id?: number;
    user_id: number;
    thirdparty_uid: string;
    recharge_type: 'manual' | 'payment' | 'gift' | 'activity';
    amount: number;
    balance_before: number;
    balance_after: number;
    payment_record_id?: number;
    admin_id?: number;
    source_type?: string;
    source_data?: any;
    remark?: string;
    status?: 'pending' | 'completed' | 'failed';
    created_at?: string;
    updated_at?: string;
};

// 创建平台币充值记录
export const createRechargeRecord = async (record: Omit<PlatformCoinRechargeRecord, 'id' | 'created_at' | 'updated_at'>) => {
    const result = await sql({
        query: `INSERT INTO platformcoinrechargerecords 
                (user_id, thirdparty_uid, recharge_type, amount, balance_before, balance_after, 
                 payment_record_id, admin_id, source_type, source_data, remark, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
            record.user_id,
            record.thirdparty_uid,
            record.recharge_type,
            record.amount,
            record.balance_before,
            record.balance_after,
            record.payment_record_id || null,
            record.admin_id || null,
            record.source_type || '',
            record.source_data ? JSON.stringify(record.source_data) : null,
            record.remark || '',
            record.status || 'completed'
        ],
    });
    return result;
};

// 根据第三方用户ID获取充值记录
export const getRechargeRecordsByThirdpartyUid = async (thirdparty_uid: string, page = 1, pageSize = 10) => {
    const offset = (page - 1) * pageSize;
    
    const records = await sql({
        query: `SELECT * FROM platformcoinrechargerecords 
                WHERE thirdparty_uid = ? 
                ORDER BY created_at DESC 
                LIMIT ?, ?`,
        values: [thirdparty_uid, offset, pageSize],
    }) as PlatformCoinRechargeRecord[];
    
    return records;
};

// 获取充值记录总数
export const getRechargeRecordsCount = async (thirdparty_uid: string) => {
    const result = await sql({
        query: 'SELECT COUNT(*) as total FROM platformcoinrechargerecords WHERE thirdparty_uid = ?',
        values: [thirdparty_uid],
    }) as any[];
    
    return result[0]?.total || 0;
};

// 获取用户总充值金额
export const getTotalRechargeAmount = async (thirdparty_uid: string) => {
    const result = await sql({
        query: 'SELECT SUM(amount) as total FROM platformcoinrechargerecords WHERE thirdparty_uid = ? AND status = "completed"',
        values: [thirdparty_uid],
    }) as any[];
    
    return parseFloat(result[0]?.total || 0);
};

// 获取用户按类型分组的充值统计
export const getRechargeStatsByType = async (thirdparty_uid: string) => {
    const result = await sql({
        query: `SELECT recharge_type, COUNT(*) as count, SUM(amount) as total_amount 
                FROM platformcoinrechargerecords 
                WHERE thirdparty_uid = ? AND status = "completed" 
                GROUP BY recharge_type`,
        values: [thirdparty_uid],
    }) as any[];
    
    return result;
};

// 根据用户ID获取用户总充值金额
export const getTotalRechargeAmountByUserId = async (user_id: number) => {
    const result = await sql({
        query: 'SELECT SUM(amount) as total FROM platformcoinrechargerecords WHERE user_id = ? AND status = "completed"',
        values: [user_id],
    }) as any[];
    
    return parseFloat(result[0]?.total || 0);
};

// 根据用户ID获取用户按类型分组的充值统计
export const getRechargeStatsByTypeByUserId = async (user_id: number) => {
    const result = await sql({
        query: `SELECT recharge_type, COUNT(*) as count, SUM(amount) as total_amount 
                FROM platformcoinrechargerecords 
                WHERE user_id = ? AND status = "completed" 
                GROUP BY recharge_type`,
        values: [user_id],
    }) as any[];
    
    return result;
};