import {sql} from '../db';

export type Settlement = {
    id?: number;
    admin_id: number;
    admin_name: string;
    admin_level: number;
    total_amount?: number;
    divide_rate?: number;
    settlement_amount?: number;
    status?: number;
    settlement_date?: string;
    created_at?: string;
    updated_at?: string;
    remark?: string;
    u_address?: string;
    settlement_method?: 'U' | 'Alipay' | 'WeChat' | 'Bank';
    channel_code?: string;
};

export const findByAdminId = async (admin_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM settlements WHERE admin_id = ? ORDER BY created_at DESC',
        values: [admin_id],
    }) as any;
    return result as Settlement[];
};

export const findById = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM settlements WHERE id = ?',
        values: [id],
    }) as any;
    return result.length === 1 ? result[0] as Settlement : null;
};

export const findByStatus = async (status: number) => {
    const result = await sql({
        query: 'SELECT * FROM settlements WHERE status = ? ORDER BY created_at DESC',
        values: [status],
    }) as any;
    return result as Settlement[];
};

export const findPendingByAdminId = async (admin_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM settlements WHERE admin_id = ? AND status = 0 ORDER BY created_at DESC',
        values: [admin_id],
    }) as any;
    return result as Settlement[];
};

export const read = async () => {
    const settlements = await sql({
        query: 'SELECT * FROM settlements ORDER BY created_at DESC',
    });
    return settlements as Settlement[];
};

export const readPage = async (
    pageIndex: number, 
    pageSize: number = 10, 
    admin_id?: number, 
    status?: number, 
    admin_level?: number,
    start_time?: string,
    end_time?: string
) => {
    const offset = (pageIndex - 1) * pageSize;
    
    let _sql = {
        query: 'SELECT * FROM settlements',
        values: [] as (string | number)[],
    };
    
    const conditions = [];
    
    if (admin_id !== undefined) {
        conditions.push('admin_id = ?');
        _sql.values.push(admin_id);
    }
    
    if (status !== undefined) {
        conditions.push('status = ?');
        _sql.values.push(status);
    }
    
    if (admin_level !== undefined) {
        conditions.push('admin_level = ?');
        _sql.values.push(admin_level);
    }
    
    if (start_time && end_time) {
        conditions.push('timestamp(created_at) between ? and ?');
        _sql.values.push(start_time, end_time);
    }
    
    if (conditions.length > 0) {
        _sql.query += ' WHERE ' + conditions.join(' AND ');
    }
    
    _sql.query += ' ORDER BY created_at DESC LIMIT ?, ?';
    _sql.values.push(offset, pageSize);
    
    const settlements = await sql(_sql);
    return settlements as Settlement[];
};

export const count = async (
    admin_id?: number, 
    status?: number, 
    admin_level?: number,
    start_time?: string,
    end_time?: string
) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM settlements',
            values: [] as (string | number)[],
        };
        
        const conditions = [];
        
        if (admin_id !== undefined) {
            conditions.push('admin_id = ?');
            _sql.values.push(admin_id);
        }
        
        if (status !== undefined) {
            conditions.push('status = ?');
            _sql.values.push(status);
        }
        
        if (admin_level !== undefined) {
            conditions.push('admin_level = ?');
            _sql.values.push(admin_level);
        }
        
        if (start_time && end_time) {
            conditions.push('timestamp(created_at) between ? and ?');
            _sql.values.push(start_time, end_time);
        }
        
        if (conditions.length > 0) {
            _sql.query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const result: any = await sql(_sql);
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count Settlements:', error);
        return 0;
    }
};

export const getTotalAmountByStatus = async (status: number, admin_id?: number) => {
    try {
        let _sql = {
            query: 'SELECT SUM(settlement_amount) AS total FROM settlements WHERE status = ?',
            values: [status] as number[],
        };
        
        if (admin_id !== undefined) {
            _sql.query += ' AND admin_id = ?';
            _sql.values.push(admin_id);
        }
        
        const result: any = await sql(_sql);
        const rows = result as { total: number }[];
        return rows[0].total || 0;
    } catch (error) {
        console.error('Failed to get total settlement amount:', error);
        return 0;
    }
};

export const insert = async (settlementData: Omit<Settlement, 'id' | 'created_at' | 'updated_at'>) => {
    const result = await sql({
        query: 'INSERT INTO settlements (admin_id, admin_name, admin_level, total_amount, divide_rate, settlement_amount, status, settlement_date, remark, u_address, settlement_method, channel_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        values: [
            settlementData.admin_id,
            settlementData.admin_name,
            settlementData.admin_level,
            settlementData.total_amount || 0,
            settlementData.divide_rate || 0,
            settlementData.settlement_amount || 0,
            settlementData.status || 0,
            settlementData.settlement_date || null,
            settlementData.remark || '',
            settlementData.u_address || '',
            settlementData.settlement_method || 'U',
            settlementData.channel_code || '',
        ],
    });
    return result;
};

export const updateStatus = async (id: number, status: number, remark?: string) => {
    const fields = ['status = ?'];
    const values: (string | number)[] = [status];
    
    if (status === 1) {
        // 已结算状态，设置结算时间
        fields.push('settlement_date = NOW()');
    }
    
    if (remark !== undefined) {
        fields.push('remark = ?');
        values.push(remark);
    }
    
    fields.push('updated_at = NOW()');
    values.push(id);
    
    await sql({
        query: `UPDATE settlements SET ${fields.join(', ')} WHERE id = ?`,
        values: values,
    });
};

export const update = async (id: number, settlementData: Partial<Omit<Settlement, 'id' | 'created_at' | 'updated_at'>>) => {
    const fields = [];
    const values = [];
    
    if (settlementData.admin_id !== undefined) {
        fields.push('admin_id = ?');
        values.push(settlementData.admin_id);
    }
    if (settlementData.admin_name !== undefined) {
        fields.push('admin_name = ?');
        values.push(settlementData.admin_name);
    }
    if (settlementData.admin_level !== undefined) {
        fields.push('admin_level = ?');
        values.push(settlementData.admin_level);
    }
    if (settlementData.total_amount !== undefined) {
        fields.push('total_amount = ?');
        values.push(settlementData.total_amount);
    }
    if (settlementData.divide_rate !== undefined) {
        fields.push('divide_rate = ?');
        values.push(settlementData.divide_rate);
    }
    if (settlementData.settlement_amount !== undefined) {
        fields.push('settlement_amount = ?');
        values.push(settlementData.settlement_amount);
    }
    if (settlementData.status !== undefined) {
        fields.push('status = ?');
        values.push(settlementData.status);
    }
    if (settlementData.settlement_date !== undefined) {
        fields.push('settlement_date = ?');
        values.push(settlementData.settlement_date);
    }
    if (settlementData.remark !== undefined) {
        fields.push('remark = ?');
        values.push(settlementData.remark);
    }
    
    if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id);
        
        await sql({
            query: `UPDATE settlements SET ${fields.join(', ')} WHERE id = ?`,
            values: values,
        });
    }
};

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM settlements WHERE id = ?',
        values: [id],
    });
};

export const removeByAdminId = async (admin_id: number) => {
    await sql({
        query: 'DELETE FROM settlements WHERE admin_id = ?',
        values: [admin_id],
    });
};

// 获取代理相关的结算记录（自己的和下级的）
export const getAdminRelatedSettlements = async (adminId: number, page: number = 1, pageSize: number = 20) => {
    try {
        const AdminModel = await import('./admin');
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        
        if (!admin || !admin.channel_code) {
            return {
                data: [],
                total: 0,
                page,
                pageSize
            };
        }
        
        const offset = (page - 1) * pageSize;
        const allowedChannels = admin.allowed_channel_codes || [];
        
        // 构建查询条件：自己的 + 下级的
        const channelCodes = [admin.channel_code, ...allowedChannels.filter(c => c !== admin.channel_code)];
        
        if (channelCodes.length === 0) {
            return {
                data: [],
                total: 0,
                page,
                pageSize
            };
        }
        
        const placeholders = channelCodes.map(() => '?').join(',');
        
        // 查询结算记录，并标记是否为自己的记录
        const settlements = await sql({
            query: `SELECT s.*, 
                           CASE WHEN s.channel_code = ? THEN 1 ELSE 0 END as is_own
                   FROM settlements s
                   WHERE s.channel_code IN (${placeholders})
                   ORDER BY s.created_at DESC 
                   LIMIT ? OFFSET ?`,
            values: [admin.channel_code, ...channelCodes, pageSize, offset]
        });
        
        // 获取总数
        const countResult = await sql({
            query: `SELECT COUNT(*) as total FROM settlements 
                   WHERE channel_code IN (${placeholders})`,
            values: channelCodes
        }) as any[];
        
        return {
            data: settlements,
            total: countResult[0].total,
            page,
            pageSize
        };
    } catch (error) {
        console.error('获取代理相关结算记录失败:', error);
        return {
            data: [],
            total: 0,
            page,
            pageSize
        };
    }
};

// 获取下级代理的结算申请（用于结算管理）
export const getChildAdminSettlements = async (
    adminId: number, 
    page: number = 1, 
    pageSize: number = 20, 
    selectedAgent?: string | null, 
    status?: number | null
) => {
    try {
        const AdminModel = await import('./admin');
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        
        if (!admin || !admin.channel_code) {
            return {
                data: [],
                total: 0,
                page,
                pageSize
            };
        }
        
        const offset = (page - 1) * pageSize;
        const allowedChannels = admin.allowed_channel_codes || [];
        
        // 只获取下级代理的申请（排除自己）
        let childChannels = allowedChannels.filter(c => c !== admin.channel_code);
        
        // 如果指定了特定代理，只查询该代理
        if (selectedAgent && selectedAgent !== '') {
            childChannels = [selectedAgent];
        }
        
        if (childChannels.length === 0) {
            return {
                data: [],
                total: 0,
                page,
                pageSize
            };
        }
        
        const placeholders = childChannels.map(() => '?').join(',');
        
        // 构建查询条件
        let whereClause = `s.channel_code IN (${placeholders})`;
        const queryValues: (string | number)[] = [...childChannels];
        
        // 添加状态筛选
        if (status !== null && status !== undefined) {
            whereClause += ' AND s.status = ?';
            queryValues.push(status);
        }
        
        // 查询下级代理的结算申请
        const settlements = await sql({
            query: `SELECT s.*
                   FROM settlements s
                   WHERE ${whereClause}
                   ORDER BY s.status ASC, s.created_at DESC
                   LIMIT ? OFFSET ?`,
            values: [...queryValues, pageSize, offset]
        });
        
        // 获取总数
        const countResult = await sql({
            query: `SELECT COUNT(*) as total FROM settlements s
                   WHERE ${whereClause}`,
            values: queryValues
        }) as any[];
        
        return {
            data: settlements,
            total: countResult[0].total,
            page,
            pageSize
        };
    } catch (error) {
        console.error('获取下级结算申请失败:', error);
        return {
            data: [],
            total: 0,
            page,
            pageSize
        };
    }
};

// 计算代理可提现金额
export const calculateWithdrawableAmount = async (adminId: number) => {
    try {
        // 获取代理信息
        const AdminModel = await import('./admin');
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        
        if (!admin || !admin.channel_code || !admin.divide_rate) {
            return {
                success: false,
                message: '代理信息不完整',
                data: {
                    total_amount: 0,
                    settled_amount: 0,
                    available_amount: 0,
                    own_channel_amount: 0,
                    child_channels_amount: 0,
                    withdrawable_amount: 0,
                    divide_rate: 0
                }
            };
        }
        
        const allowedChannels = admin.allowed_channel_codes || [];
        
        // 1. 计算自己渠道玩家的真实消费金额（排除平台币支付）
        const ownChannelResult = await sql({
            query: `SELECT COALESCE(SUM(pr.amount), 0) as total_amount
                   FROM paymentrecords pr
                   JOIN users u ON pr.user_id = u.id
                   WHERE u.channel_code = ? AND pr.payment_status = 3
                   AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
            values: [admin.channel_code]
        }) as any[];
        
        const ownChannelAmount = parseFloat(ownChannelResult[0]?.total_amount || '0');
        
        // 2. 计算所有下级渠道玩家的真实消费金额（排除平台币支付，不扣除下级代理分成）
        let childChannelsAmount = 0;
        
        if (allowedChannels.length > 0) {
            // 获取所有下级渠道（排除自己）
            const childChannels = allowedChannels.filter(channel => channel !== admin.channel_code);
            
            if (childChannels.length > 0) {
                const childChannelsResult = await sql({
                    query: `SELECT COALESCE(SUM(pr.amount), 0) as total_amount
                           FROM paymentrecords pr
                           JOIN users u ON pr.user_id = u.id
                           WHERE u.channel_code IN (${childChannels.map(() => '?').join(',')}) 
                           AND pr.payment_status = 3
                           AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
                    values: childChannels
                }) as any[];
                
                childChannelsAmount = parseFloat(childChannelsResult[0]?.total_amount || '0');
            }
        }
        
        // 3. 计算已结算金额（状态为1的结算记录）
        const settledResult = await sql({
            query: `SELECT COALESCE(SUM(total_amount), 0) as settled_amount
                   FROM settlements 
                   WHERE admin_id = ? AND status = 1`,
            values: [adminId]
        }) as any[];
        
        const settledAmount = parseFloat(settledResult[0]?.settled_amount || '0');
        
        // 4. 计算可结算流水和可提现金额
        const totalAmount = ownChannelAmount + childChannelsAmount;
        const availableAmount = Math.max(0, totalAmount - settledAmount); // 可结算流水
        const withdrawableAmount = availableAmount * (admin.divide_rate / 100);
        
        return {
            success: true,
            data: {
                total_amount: totalAmount,
                settled_amount: settledAmount,
                available_amount: availableAmount,
                own_channel_amount: ownChannelAmount,
                child_channels_amount: childChannelsAmount,
                own_channel_commission: ownChannelAmount * (admin.divide_rate / 100),
                child_channels_commission: childChannelsAmount * (admin.divide_rate / 100),
                withdrawable_amount: withdrawableAmount,
                divide_rate: admin.divide_rate
            }
        };
    } catch (error) {
        console.error('计算可提现金额失败:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : '计算失败',
            data: {
                total_amount: 0,
                settled_amount: 0,
                available_amount: 0,
                own_channel_amount: 0,
                child_channels_amount: 0,
                withdrawable_amount: 0,
                divide_rate: 0
            }
        };
    }
}; 