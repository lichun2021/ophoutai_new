import {sql} from '../db';

export type Payment = {
    id?: number;
    user_id?: number;
    sub_user_id?: number | null;
    role_id?: string;
    transaction_id?: string;
    wuid?: string;
    payment_way?: string;
    payment_id?: number;  // 存储渠道ID（1, 2, 3对应gatewayParamSets的键）
    world_id?: number;
    product_name?: string;
    product_des?: string;
    ip?: string;
    amount?: number;
    mch_order_id?: string;
    created_at?: string;
    notify_at?: string;
    callback_at?: string;
    msg?: string;
    server_url?: string;
    device?: string;
    channel_code?: string;
    game_code?: string;
    payment_status?: number;
    // 平台币变化（仅当 payment_way 为平台币时有意义）
    ptb_before?: number;
    ptb_change?: number;
    ptb_after?: number;
};


export const detailByTransId = async (transaction_id: string) => {
    const result = await sql({
        query: 'SELECT * FROM paymentrecords WHERE transaction_id = ?',
        values: [transaction_id],
    }) as any;
    return result.length === 1 ? result[0] as Payment : null;
};

export const detailByMchOrderId = async (mch_order_id: string) => {
    const result = await sql({
        query: 'SELECT * FROM paymentrecords WHERE mch_order_id = ?',
        values: [mch_order_id],
    }) as any;
    return result.length === 1 ? result[0] as Payment : null;
};

export const detailByUserId = async (user_id: any) => {
    const paymentdata = await sql({
        query: 'SELECT * FROM paymentrecords WHERE user_id = ?',
        values: [user_id],
    }) as any;
    return  paymentdata as Payment[];
};


// export const read = async (permissions:any) => {
//     let _sql = {
//         query: 'SELECT * FROM paymentrecords',
//     }
//     if(permissions.channel_id.length>0){
//         _sql.query += " where channel_id in (" + permissions.channel_id.join(",") + ")"
//     }

//     const paymentdata = await sql(_sql);
//     return paymentdata as Payment[];
// }


export const readPage = async (pageIndex: any,permissions:any,tranId?:any,start_time?:any,end_time?:any,userid?:any,mch_order_id?:any,payment_status?:any) => {
    const pageSize = 10; // 每页显示的记录数
    const offset = (pageIndex - 1) * pageSize; // 计算起始位置

    let _sql = {
        query: 'SELECT pr.* FROM paymentrecords pr ',
        values: [] as (string | number | Date)[], 
    }

    let where = false;
    
    // 权限控制：根据channel_codes过滤
    if(permissions && permissions.channel_codes && permissions.channel_codes.length > 0){
        if(!where){
            _sql.query += " WHERE ";
            where = true;
        }
        _sql.query += " pr.channel_code IN (" + permissions.channel_codes.map(() => '?').join(',') + ")";
        permissions.channel_codes.forEach((code: string) => _sql.values.push(code));
    }

    if(tranId){
        if(!where){
            _sql.query += " where ";
            where = true;
        }
        else{
            _sql.query += " and ";
        }


        _sql.query += "pr.transaction_id = ?"
        _sql.values.push(tranId);
    }

    if(mch_order_id){
        if(!where){
            _sql.query += " where ";
            where = true;
        }
        else{
            _sql.query += " and ";
        }
        _sql.query += "pr.mch_order_id = ?"
        _sql.values.push(mch_order_id);
    }


    if(userid){
        if(!where){
            _sql.query += " where ";
            where = true;
        }
        else{
            _sql.query += " and ";
        }
        _sql.query += "pr.wuid = ?"
        _sql.values.push(userid);
    }

    if(payment_status){
        if(!where){
            _sql.query += " where ";
            where = true;
        }
        else{
            _sql.query += " and ";
        }
        _sql.query += "pr.payment_status = ?"
        _sql.values.push(payment_status);
    }



    if(start_time&&end_time){
                if(!where){
            _sql.query += " where ";
            where = true;
        }
        else{
            _sql.query += " and ";
        }
        _sql.query+= "timestamp(pr.created_at) between ? and ?";
        _sql.values.push(start_time);
        _sql.values.push(end_time);
      }
      
    _sql.query += ' ORDER BY pr.created_at DESC'; // 按照创建时间倒序排列

    _sql.query +=  ' LIMIT ?, ?';
    _sql.values.push(offset);
    _sql.values.push(pageSize);
    const paymentdata = await sql(_sql) ;
    return paymentdata as Payment[]; ; // 直接返回结果数组
};


export const count = async (permissions:any,tranId?:any,start_time?:any,end_time?:any,userid?:any,mch_order_id?:any,payment_status?:any) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM paymentrecords pr',
            values: [] as (string | number | Date)[], 
        }

        let where = false;
        
        // 权限控制：根据channel_codes过滤
        if(permissions && permissions.channel_codes && permissions.channel_codes.length > 0){
            if(!where){
                _sql.query += " WHERE ";
                where = true;
            }
            _sql.query += " pr.channel_code IN (" + permissions.channel_codes.map(() => '?').join(',') + ")";
            permissions.channel_codes.forEach((code: string) => _sql.values.push(code));
        }

        if(tranId){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.transaction_id = ?"
            _sql.values.push(tranId);
        }
    
        if(mch_order_id){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.mch_order_id = ?"
            _sql.values.push(mch_order_id);
        }

        if(userid){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.wuid = ?"
            _sql.values.push(userid);
        }

        if(payment_status){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.payment_status = ?"
            _sql.values.push(payment_status);
        }
    
        if(start_time&&end_time){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query+= "timestamp(pr.created_at) between ? and ?";
            _sql.values.push(start_time);
            _sql.values.push(end_time);
        }

        const result: any = await sql(_sql);
        // 使用类型断言确保 TypeScript 处理 result 作为包含至少一个具有 total 属性的对象的数组
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count PaymentRecords:', error);
        return 0;
    }
}


export const allAmount = async (permissions:any,tranId?:any,start_time?:any,end_time?:any,userid?:any,mch_order_id?:any,state?:number,payment_status?:any) => {
    try {
        let _sql = {
            query: 'SELECT sum(pr.amount) AS total FROM paymentrecords pr',
            values: [] as (string | number | Date)[], 
        }

        let where = false;
        
        // 权限控制：根据channel_codes过滤
        if(permissions && permissions.channel_codes && permissions.channel_codes.length > 0){
            if(!where){
                _sql.query += " WHERE ";
                where = true;
            }
            _sql.query += " pr.channel_code IN (" + permissions.channel_codes.map(() => '?').join(',') + ")";
            permissions.channel_codes.forEach((code: string) => _sql.values.push(code));
        }

        if(tranId){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.transaction_id = ?"
            _sql.values.push(tranId);
        }
    
        if(mch_order_id){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.mch_order_id = ?"
            _sql.values.push(mch_order_id);
        }

        
        if(userid){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.wuid = ?"
            _sql.values.push(userid);
        }

        if(payment_status){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.payment_status = ?"
            _sql.values.push(payment_status);
        }
    
        if(start_time&&end_time){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query+= "timestamp(pr.created_at) between ? and ?";
            _sql.values.push(start_time);
            _sql.values.push(end_time);
        }
        
        if(payment_status){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query += "pr.payment_status = ?"
            _sql.values.push(payment_status);
        }

        if(state&&state>0){
            if(!where){
                _sql.query += " where ";
                where = true;
            }
            else{
                _sql.query += " and ";
            }
            _sql.query+= "pr.payment_status = "+state;
        }
        

        const result: any = await sql(_sql);
        // 使用类型断言确保 TypeScript 处理 result 作为包含至少一个具有 total 属性的对象的数组
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count PaymentRecords:', error);
        return 0;
    }
}



export const updateState = async (transaction_id: string, data: Pick<Payment,"payment_status">) => {
    await sql({
        query: 'UPDATE paymentrecords SET payment_status = ? WHERE transaction_id = ?',
        values: [data.payment_status, transaction_id],
    });
}

export const updateOrderCall = async (transaction_id: string, data: Pick<Payment,'payment_status'|'mch_order_id'>) => {
    // 保护：若库中已存在第三方单号（非本地前缀且非空），则不覆盖
    const existing: any[] = await sql({
        query: 'SELECT mch_order_id, payment_status FROM paymentrecords WHERE transaction_id = ?',
        values: [transaction_id],
    }) as any[];
    const current = existing[0]?.mch_order_id || '';
    const status = Number(existing[0]?.payment_status ?? 0);
    const looksLocal = (v: string) => !v || v.startsWith('zfb_') || v.startsWith('wx_') || v.startsWith('ptb_') || v.startsWith('kf_');
    const nextMchId = data.mch_order_id || '';
    const allowOverwrite = status <= 1 || looksLocal(current) || current === '' || current === nextMchId;

    const fields: string[] = ['payment_status = ?'];
    const values: any[] = [2];
    if (allowOverwrite) {
        fields.push('mch_order_id = ?');
        values.push(nextMchId);
    }
    values.push(transaction_id);
    const _sql  = {
        query: `UPDATE paymentrecords SET ${fields.join(', ')} WHERE transaction_id = ?`,
        values
    }
    await sql(_sql);
}

export const getUserOrders = async (thirdparty_uid: string, status?: number) => {
    let query = 'SELECT * FROM paymentrecords WHERE user_id = ?';
    const values: any[] = [thirdparty_uid];
    
    if (status !== undefined) {
      query += ' AND payment_status = ?';
      values.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await sql({
      query,
      values
    });
    
    return result as Payment[];
  };

  export const updateOrderStatus = async (
    transaction_id: string, 
    status: number, 
    notify_at?: Date | string | null, 
    callback_at?: Date | string | null,
    orderid?: string
  ) => {
      
      // 构建基础 SQL 查询
      let query = 'UPDATE paymentrecords SET payment_status = ?';
      const values: any[] = [status];
      
      // 保护：若库中已存在第三方单号（非本地前缀且非空），则不覆盖，除非写入同值
      if(orderid){
            const existing: any[] = await sql({
                query: 'SELECT mch_order_id, payment_status FROM paymentrecords WHERE transaction_id = ?',
                values: [transaction_id],
            }) as any[];
            const current = existing[0]?.mch_order_id || '';
            const statusNow = Number(existing[0]?.payment_status ?? 0);
            const looksLocal = (v: string) => !v || v.startsWith('zfb_') || v.startsWith('wx_') || v.startsWith('ptb_') || v.startsWith('kf_');
            const allowOverwrite = statusNow <= 1 || looksLocal(current) || current === orderid;
            if (allowOverwrite) {
                query += ', mch_order_id = ?';
                values.push(orderid); // 添加 mch_order_id 到值数组
            }
      }
      
      // 根据参数是否为 null 添加相应的字段更新
      if (notify_at !== null && notify_at !== undefined) {
          query += ', notify_at = ?';
          values.push(notify_at);
      }
      
      if (callback_at !== null && callback_at !== undefined) {
          query += ', callback_at = ?';
          values.push(callback_at);
      }
      
      // 添加 WHERE 条件
      query += ' WHERE transaction_id = ?';
      values.push(transaction_id);
      
      await sql({
          query,
          values,
      });
  }

export const getOrderStatus = async (transaction_id: string): Promise<number> => {
    try {
        const result: any = await sql({
            query: 'SELECT payment_status FROM paymentrecords WHERE transaction_id = ?',
            values: [transaction_id],
        });

        // 确保 result 是一个数组并且有数据
        if (result && result.length > 0) {
            return result[0].payment_status; // 返回 payment_status 作为 number
        } else {
            return 0; // 如果没有找到记录，返回 0 或者其他合适的默认值
        }

    } catch (error) {
        console.error('Failed to Get OrderStatus', error);
        return 0; // 在发生错误时返回 0 或者其他合适的默认值
    }
}

export const updateOrderErrorMsg = async (transaction_id: string, error_msg: string) => {
    await sql({
        query: 'UPDATE paymentrecords SET msg=? WHERE transaction_id = ?',
        values: [error_msg, transaction_id],
    });
}

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM paymentrecords WHERE id = ?',
        values: [id],
    });
}

export const insert = async (paymentData: Omit<Payment, 'id' | 'created_at'>) => {
    
    const result = await sql({
        query: 'INSERT INTO paymentrecords (user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, payment_id, world_id, product_name, product_des, ip, amount, mch_order_id, msg, server_url, device, channel_code, game_code, payment_status, ptb_before, ptb_change, ptb_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        values: [
            paymentData.user_id, 
            paymentData.sub_user_id, // 保持null值，不转换为0
            paymentData.role_id || '',
            paymentData.transaction_id, 
            paymentData.wuid, 
            paymentData.payment_way, 
            paymentData.payment_id || 0, 
            paymentData.world_id || 1, 
            paymentData.product_name, 
            paymentData.product_des || '', 
            paymentData.ip || '', 
            paymentData.amount, 
            paymentData.mch_order_id || '', 
            paymentData.msg || '', 
            paymentData.server_url || '', 
            paymentData.device || '', 
            paymentData.channel_code || '', 
            paymentData.game_code || '', 
            paymentData.payment_status || 0,
            paymentData.ptb_before || 0,
            paymentData.ptb_change || 0,
            paymentData.ptb_after || 0
        ],
    });
    return result;
}

// 动态更新支付记录 - 只更新传入的字段
export const updateByTransactionId = async (transaction_id: string, updateData: Partial<Payment>) => {
    // 兼容处理：如果传入的是包含attachInfo的对象，则使用attachInfo作为transaction_id
    let actualTransactionId = transaction_id;
    if (typeof transaction_id === 'object' && transaction_id !== null && 'attachInfo' in transaction_id) {
        actualTransactionId = (transaction_id as any).attachInfo;
    }
    
    const fields = [];
    const values = [];
    
    // 动态构建更新字段
    if (updateData.user_id !== undefined) {
        fields.push('user_id = ?');
        values.push(updateData.user_id);
    }
    if (updateData.sub_user_id !== undefined) {
        fields.push('sub_user_id = ?');
        values.push(updateData.sub_user_id);
    }
    if (updateData.role_id !== undefined) {
        fields.push('role_id = ?');
        values.push(updateData.role_id);
    }
    if (updateData.wuid !== undefined) {
        fields.push('wuid = ?');
        values.push(updateData.wuid);
    }
    if (updateData.payment_way !== undefined) {
        fields.push('payment_way = ?');
        values.push(updateData.payment_way);
    }
    if (updateData.payment_id !== undefined) {
        fields.push('payment_id = ?');
        values.push(updateData.payment_id);
    }
    if (updateData.world_id !== undefined) {
        fields.push('world_id = ?');
        values.push(updateData.world_id);
    }
    if (updateData.product_name !== undefined) {
        fields.push('product_name = ?');
        values.push(updateData.product_name);
    }
    if (updateData.product_des !== undefined) {
        fields.push('product_des = ?');
        values.push(updateData.product_des);
    }
    if (updateData.ip !== undefined) {
        fields.push('ip = ?');
        values.push(updateData.ip);
    }
    if (updateData.amount !== undefined) {
        fields.push('amount = ?');
        values.push(updateData.amount);
    }
    // 平台币变化字段
    if ((updateData as any).ptb_before !== undefined) {
        fields.push('ptb_before = ?');
        values.push((updateData as any).ptb_before);
    }
    if ((updateData as any).ptb_change !== undefined) {
        fields.push('ptb_change = ?');
        values.push((updateData as any).ptb_change);
    }
    if ((updateData as any).ptb_after !== undefined) {
        fields.push('ptb_after = ?');
        values.push((updateData as any).ptb_after);
    }
    if (updateData.mch_order_id !== undefined) {
        // 保护：若库中已存在第三方单号（非本地前缀且非空），则不覆盖，除非写入同值；
        // 同时在未完成/处理中（status<=1）阶段允许覆盖一次
        const existing: any[] = await sql({
            query: 'SELECT mch_order_id, payment_status FROM paymentrecords WHERE transaction_id = ?',
            values: [actualTransactionId],
        }) as any[];
        const current = existing[0]?.mch_order_id || '';
        const status = Number(existing[0]?.payment_status ?? 0);
        const looksLocal = (v: string) => !v || v.startsWith('zfb_') || v.startsWith('wx_') || v.startsWith('ptb_') || v.startsWith('kf_');
        if (status <= 1 || looksLocal(current) || current === updateData.mch_order_id) {
            fields.push('mch_order_id = ?');
            values.push(updateData.mch_order_id);
        }
    }
    if (updateData.msg !== undefined) {
        fields.push('msg = ?');
        values.push(updateData.msg);
    }
    if (updateData.server_url !== undefined) {
        fields.push('server_url = ?');
        values.push(updateData.server_url);
    }
    if (updateData.device !== undefined) {
        fields.push('device = ?');
        values.push(updateData.device);
    }
    if (updateData.channel_code !== undefined) {
        fields.push('channel_code = ?');
        values.push(updateData.channel_code);
    }
    if (updateData.game_code !== undefined) {
        fields.push('game_code = ?');
        values.push(updateData.game_code);
    }
    if (updateData.payment_status !== undefined) {
        fields.push('payment_status = ?');
        values.push(updateData.payment_status);
    }
    if (updateData.notify_at !== undefined) {
        fields.push('notify_at = ?');
        values.push(updateData.notify_at);
    }
    if (updateData.callback_at !== undefined) {
        fields.push('callback_at = ?');
        values.push(updateData.callback_at);
    }
    
    // 如果没有字段需要更新，直接返回
    if (fields.length === 0) {
        return;
    }
    
    // 添加WHERE条件的值
    values.push(actualTransactionId);
    
    // 执行更新
    await sql({
        query: `UPDATE paymentrecords SET ${fields.join(', ')} WHERE transaction_id = ?`,
        values: values,
    });
};