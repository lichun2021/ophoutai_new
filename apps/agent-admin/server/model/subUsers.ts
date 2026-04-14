import {sql} from '../db';

export type SubUser = {
    id?: number;
    parent_user_id: number;
    username: string;
    wuid?: string;
    created_at?: string;
};

export const findByParentUserId = async (parent_user_id: number) => {
    const result = await sql({
        query: 'SELECT * FROM SubUsers WHERE parent_user_id = ?',
        values: [parent_user_id],
    }) as any;
    return result as SubUser[];
};

export const findByUsername = async (username: string) => {
    const result = await sql({
        query: 'SELECT * FROM SubUsers WHERE username = ?',
        values: [username],
    }) as any;
    return result.length === 1 ? result[0] as SubUser : null;
};

export const findById = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM SubUsers WHERE id = ?',
        values: [id],
    }) as any;
    return result.length === 1 ? result[0] as SubUser : null;
};

export const countByParentUserId = async (parent_user_id: number) => {
    const result = await sql({
        query: 'SELECT COUNT(*) AS total FROM SubUsers WHERE parent_user_id = ?',
        values: [parent_user_id],
    }) as any;
    return result[0].total as number;
};

export const read = async () => {
    const subUsers = await sql({
        query: 'SELECT * FROM SubUsers ORDER BY created_at DESC',
    });
    return subUsers as SubUser[];
};

export const readPage = async (pageIndex: number, pageSize: number = 10, parent_user_id?: number) => {
    const offset = (pageIndex - 1) * pageSize;
    
    let _sql = {
        query: 'SELECT * FROM SubUsers',
        values: [] as (string | number)[],
    };
    
    if (parent_user_id) {
        _sql.query += ' WHERE parent_user_id = ?';
        _sql.values.push(parent_user_id);
    }
    
    _sql.query += ' ORDER BY created_at DESC LIMIT ?, ?';
    _sql.values.push(offset, pageSize);
    
    const subUsers = await sql(_sql);
    return subUsers as SubUser[];
};

export const count = async (parent_user_id?: number) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM SubUsers',
            values: [] as number[],
        };
        
        if (parent_user_id) {
            _sql.query += ' WHERE parent_user_id = ?';
            _sql.values.push(parent_user_id);
        }
        
        const result: any = await sql(_sql);
        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count SubUsers:', error);
        return 0;
    }
};

export const insert = async (subUserData: Omit<SubUser, 'id' | 'created_at'>) => {
    const result = await sql({
        query: 'INSERT INTO SubUsers (parent_user_id, username, wuid) VALUES (?, ?, ?)',
        values: [subUserData.parent_user_id, subUserData.username, subUserData.wuid || ''],
    });
    return result;
};

export const update = async (id: number, subUserData: Partial<Omit<SubUser, 'id' | 'created_at'>>) => {
    const fields = [];
    const values = [];
    
    if (subUserData.parent_user_id !== undefined) {
        fields.push('parent_user_id = ?');
        values.push(subUserData.parent_user_id);
    }
    if (subUserData.username !== undefined) {
        fields.push('username = ?');
        values.push(subUserData.username);
    }
    if (subUserData.wuid !== undefined) {
        fields.push('wuid = ?');
        values.push(subUserData.wuid);
    }
    
    if (fields.length > 0) {
        values.push(id);
        
        await sql({
            query: `UPDATE SubUsers SET ${fields.join(', ')} WHERE id = ?`,
            values: values,
        });
    }
};

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM SubUsers WHERE id = ?',
        values: [id],
    });
};

export const removeByParentUserId = async (parent_user_id: number) => {
    await sql({
        query: 'DELETE FROM SubUsers WHERE parent_user_id = ?',
        values: [parent_user_id],
    });
};

// 通过id查询并更新子用户的wuid
export const updateWuidByThirdpartyUid = async (thirdparty_uid: string, uid: string): Promise<{ success: boolean; message: string }> => {
    try {
        // 1. 直接在 SubUsers 表中通过 id 字段查找子用户
        const subUserResult = await sql({
            query: 'SELECT id FROM SubUsers WHERE id = ?',
            values: [thirdparty_uid],
        }) as any[];
        
        if (subUserResult.length === 0) {
            return {
                success: false,
                message: '注册失败：未找到对应的子账号'
            };
        }
        
        // 2. 更新子账号的 wuid 字段
        await sql({
            query: 'UPDATE SubUsers SET wuid = ? WHERE id = ?',
            values: [uid, thirdparty_uid],
        });
        
        return {
            success: true,
            message: '注册成功'
        };
        
    } catch (error) {
        console.error('更新子用户wuid失败:', error);
        return {
            success: false,
            message: '注册失败：系统错误'
        };
    }
}; 