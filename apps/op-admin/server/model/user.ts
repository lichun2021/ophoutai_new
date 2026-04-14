import { sql } from '../db';
import { RowDataPacket } from 'mysql2';
import * as SubUsersModel from './subUsers';

export type User = {
    id?: number;
    username?: string;
    iphone?: string;
    password?: string;
    thirdparty_uid?: string;
    channel_code?: string;
    game_code?: string;
    platform_coins?: number;
    status?: number;
    created_at?: string;
};



// 根据用户ID查找用户
export const findById = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM Users WHERE id = ?',
        values: [id],
    }) as any;
    return result.length === 1 ? result[0] as User : null;
};

// 添加根据 thirdparty_uid 查找用户
export const findByThirdpartyUid = async (thirdparty_uid: string) => {
    const result = await sql({
        query: 'SELECT * FROM Users WHERE thirdparty_uid = ?',
        values: [thirdparty_uid],
    }) as any;
    return result.length === 1 ? result[0] as User : null;
};

// 用户登录验证
export const login = async (username: string, password: string) => {
    try {
        const result = await sql({
            query: 'SELECT * FROM Users WHERE username = ? AND password = ?',
            values: [username, password],
        }) as any;
        return result.length === 1 ? result[0] as User : null;
    } catch (error) {
        console.error('用户登录查询失败:', error);
        return null;
    }
};

// 添加 upsertUserByThirdparty 方法
export const upsertUserByThirdparty = async (thirdparty_uid: string, access_token: string, sign: string, channel: string) => {
    // 首先查找是否存在该第三方用户


    const existingUser = await findByThirdpartyUid(thirdparty_uid);

    if (existingUser) {
        // 用户存在，更新 access_token
        await sql({
            query: 'UPDATE Users SET access_token = ? WHERE thirdparty_uid = ?',
            values: [access_token, thirdparty_uid],
        });
        return { ...existingUser, access_token };
    } else {
        // 用户不存在，插入新用户，其他字段使用默认值
        const result = await sql({
            query: `INSERT INTO Users 
                (username, iphone, password, channel_code, thirdparty_uid, platform_coins, status, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
                `user_${thirdparty_uid.substring(0, 8)}`, // 生成默认用户名
                '', // 默认空手机号
                '', // 默认空密码
                channel, // 渠道代码
                thirdparty_uid,
                0.00, // 默认平台币余额
                0, // 默认状态：0=正常
            ],
        });

        console.log("upsertUserByThirdparty result:", result)

        return {
            code: 200,
            msg: "用户创建成功",
        } as User;
    }
};


export const detailByUserID = async (thirdparty_uid: string) => {
    let _sql = {
        query: 'SELECT * FROM Users WHERE thirdparty_uid = ? ',
        values: [thirdparty_uid],
    }

    console.log("detailByUserID _sql:", _sql)

    const result = await sql(_sql) as any;



    return result.length > 0 ? result[0] as User : null;
};

export const detail = async (mob: string, pwd: string) => {
    const result = await sql({
        query: 'SELECT * FROM Users WHERE iphone = ? and password = ?',
        values: [mob, pwd],
    }) as any;
    return result.length === 1 ? result[0] as User : null;
};

export const read = async () => {
    const users = await sql({
        query: 'SELECT * FROM Users',
    });
    return users as User[];
}


export const readPage = async (pageIndex: any, permissions: any, mobile?: any, start_time?: any, end_time?: any, userid?: any) => {
    const pageSize = 10; // 每页显示的记录数
    const offset = (pageIndex - 1) * pageSize; // 计算起始位置

    let _sql = {
        query: 'SELECT * FROM Users ',
        values: [] as (string | number | Date)[],
    }

    let where = false;

    // 权限控制：根据channel_codes过滤
    if (permissions && permissions.channel_codes && permissions.channel_codes.length > 0) {
        if (!where) {
            _sql.query += " WHERE ";
            where = true;
        }
        _sql.query += " channel_code IN (" + permissions.channel_codes.map(() => '?').join(',') + ")";
        permissions.channel_codes.forEach((code: string) => _sql.values.push(code));
    }

    if (mobile) {
        if (!where) {
            _sql.query += " WHERE ";
            where = true;
        } else {
            _sql.query += " AND ";
        }
        _sql.query += " iphone = ?"
        _sql.values.push(mobile);
    }

    if (userid) {
        if (!where) {
            _sql.query += " WHERE ";
            where = true;
        } else {
            _sql.query += " AND ";
        }
        _sql.query += " thirdparty_uid = ?"
        _sql.values.push(userid);
    }

    if (start_time && end_time) {
        if (!where) {
            _sql.query += " WHERE ";
            where = true;
        } else {
            _sql.query += " AND ";
        }

        _sql.query += " timestamp(created_at) between ? and ?";
        _sql.values.push(start_time);
        _sql.values.push(end_time);
    }

    _sql.query += ' ORDER BY created_at DESC'; // 按照创建时间倒序排列

    _sql.query += ' LIMIT ?, ?';
    _sql.values.push(offset);
    _sql.values.push(pageSize);
    console.log("readPage User sql:", _sql)
    const users = await sql(_sql);
    return users as User[];; // 直接返回结果数组
};




export const getchannel = async (userId: number) => {
    let _sql = {
        query: 'SELECT channel_code FROM Users where id = ?',
        values: [userId],
    }
    const result = await sql(_sql) as any;
    console.log("getchannel:", _sql)
    return result.length === 1 ? result[0].channel_code as string : '';
};


export const count = async (permissions: any, mobile?: any, start_time?: any, end_time?: any, userid?: any) => {
    try {
        let _sql = {
            query: 'SELECT COUNT(*) AS total FROM Users',
            values: [] as (string | number | Date)[],
        }

        let where = false;

        // 权限控制：根据channel_codes过滤
        if (permissions && permissions.channel_codes && permissions.channel_codes.length > 0) {
            if (!where) {
                _sql.query += " WHERE ";
                where = true;
            }
            _sql.query += " channel_code IN (" + permissions.channel_codes.map(() => '?').join(',') + ")";
            permissions.channel_codes.forEach((code: string) => _sql.values.push(code));
        }

        if (mobile) {
            if (!where) {
                _sql.query += " WHERE ";
                where = true;
            } else {
                _sql.query += " AND ";
            }
            _sql.query += " iphone = ?"
            _sql.values.push(mobile);
        }

        if (userid) {
            if (!where) {
                _sql.query += " WHERE ";
                where = true;
            } else {
                _sql.query += " AND ";
            }
            _sql.query += " thirdparty_uid = ?"
            _sql.values.push(userid);
        }

        if (start_time && end_time) {
            if (!where) {
                _sql.query += " WHERE ";
                where = true;
            } else {
                _sql.query += " AND ";
            }

            _sql.query += " timestamp(created_at) between ? and ?";
            _sql.values.push(start_time);
            _sql.values.push(end_time);
        }

        // 使用类型断言确保 TypeScript 处理 result 作为包含至少一个具有 total 属性的对象的数组
        const result: any = await sql(_sql);

        const rows = result as { total: number }[];
        return rows[0].total;
    } catch (error) {
        console.error('Failed to count users:', error);
        return 0;
    }
}
export const updatePhone = async (id: number, data: Pick<User, "iphone">) => {
    await sql({
        query: 'UPDATE Users SET iphone = ? WHERE id = ?',
        values: [data.iphone, id],
    });
}

// 函数已废弃：uid 字段已被删除
// export const isUidEmpty = async (thirdparty_uid: string): Promise<boolean> => {
//     const query = 'SELECT COUNT(*) as count FROM Users WHERE thirdparty_uid = ? AND (uid IS NULL OR uid = "")';
//     const result = await sql({
//         query,
//         values: [thirdparty_uid],
//     });
//     return (result as RowDataPacket[])[0].count > 0;
// };

export const updateByUserId = async (userData: User) => {

    await sql({
        query: 'UPDATE Users SET username = ? , iphone = ? , password = ?, channel_code = ?, game_code = ?, platform_coins = ?  WHERE thirdparty_uid = ?',
        values: [userData.username, userData.iphone, userData.password, userData.channel_code, userData.game_code, userData.platform_coins, userData.thirdparty_uid],
    });
}

export const remove = async (id: number) => {
    await sql({
        query: 'DELETE FROM Users WHERE id = ?',
        values: [id],
    });
}

export const insert = async (userData: Omit<User, 'id' | 'created_at'>) => {
    try {
        // 开始事务
        await sql({
            query: 'START TRANSACTION',
            values: [],
        });

        // 插入用户数据
        const userResult = await sql({
            query: 'INSERT INTO Users (username, iphone, password, channel_code, game_code, thirdparty_uid, platform_coins, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            values: [userData.username, userData.iphone, userData.password, userData.channel_code, userData.game_code, userData.thirdparty_uid, userData.platform_coins || 0.00, userData.status || 0],
        }) as any;

        const userId = userResult.insertId;

        // 创建对应的 SubUser 记录，第一个子账号默认为 "小号1_小号1"
        const subUserData = {
            parent_user_id: userId,
            username: "小号1_小号1"
        };

        await SubUsersModel.insert(subUserData);

        // 提交事务
        await sql({
            query: 'COMMIT',
            values: [],
        });

        return userResult;
    } catch (error) {
        // 回滚事务
        try {
            await sql({
                query: 'ROLLBACK',
                values: [],
            });
        } catch (rollbackError) {
            console.error('回滚事务失败:', rollbackError);
        }

        console.error('创建用户和子用户失败:', error);
        throw error;
    }
};

// ========== 平台币相关操作方法 ==========

// 获取用户平台币余额
export const getPlatformCoins = async (user_id: number): Promise<number> => {
    const result = await sql({
        query: 'SELECT platform_coins FROM Users WHERE id = ?',
        values: [user_id],
    }) as any[];
    return result.length > 0 ? parseFloat(result[0].platform_coins) : 0;
};

// 通过第三方用户ID获取平台币余额
export const getPlatformCoinsByThirdpartyUid = async (thirdparty_uid: string): Promise<number> => {
    const result = await sql({
        query: 'SELECT platform_coins FROM Users WHERE thirdparty_uid = ?',
        values: [thirdparty_uid],
    }) as any[];
    return result.length > 0 ? parseFloat(result[0].platform_coins) : 0;
};

/**
 * 统一的平台币加减操作
 * @param userId 用户ID
 * @param amount 金额（正数为加，负数为减）
 * @param operationType 操作类型标志位
 *   1: 游戏内购扣款
 *   2: 第三方充值到账
 *   3: 收银台充值到账
 *   4: 支付查询补单
 *   5: 管理员发放
 *   6: 礼包失败退款
 *   7: 礼包异常退款
 * @returns { success: boolean, newBalance?: number, oldBalance?: number, message?: string }
 */
export const updatePlatformCoinsUnified = async (
    userId: number,
    amount: number,
    operationType: 1 | 2 | 3 | 4 | 5 | 6 | 7
): Promise<{ success: boolean; newBalance?: number; oldBalance?: number; message?: string }> => {
    const operationNames = {
        1: '游戏内购扣款',
        2: '第三方充值到账',
        3: '收银台充值到账',
        4: '支付查询补单',
        5: '管理员发放',
        6: '礼包失败退款',
        7: '礼包异常退款'
    };

    console.log(`[平台币操作] userId=${userId}, amount=${amount}, operationType=${operationType}(${operationNames[operationType]})`);

    try {
        // 获取当前余额
        const oldBalance = await getPlatformCoins(userId);

        // 如果是扣款操作（负数），检查余额是否足够
        if (amount < 0 && oldBalance < Math.abs(amount)) {
            console.log(`[平台币操作失败] userId=${userId}, 余额不足: 当前=${oldBalance}, 需要=${Math.abs(amount)}`);
            return { success: false, message: '平台币余额不足', oldBalance };
        }

        // 计算新余额
        const newBalance = oldBalance + amount;

        // 更新余额
        await sql({
            query: 'UPDATE Users SET platform_coins = ? WHERE id = ?',
            values: [newBalance, userId],
        });

        console.log(`[平台币操作成功] userId=${userId}, 旧余额=${oldBalance}, 变动=${amount}, 新余额=${newBalance}`);

        return { success: true, newBalance, oldBalance };
    } catch (error) {
        console.error(`[平台币操作异常] userId=${userId}, amount=${amount}, operationType=${operationType}`, error);
        return { success: false, message: '平台币操作失败' };
    }
};






// ========== 用户状态管理方法 ==========

// 更新用户状态
export const updateUserStatus = async (user_id: number, status: number): Promise<{ success: boolean; message?: string }> => {
    try {
        // 验证状态值
        if (status !== 0 && status !== 1) {
            return { success: false, message: '状态值无效，只能是0（正常）或1（封号）' };
        }

        // 检查用户是否存在
        const user = await findById(user_id);
        if (!user) {
            return { success: false, message: '用户不存在' };
        }

        // 更新用户状态
        await sql({
            query: 'UPDATE Users SET status = ? WHERE id = ?',
            values: [status, user_id],
        });

        return {
            success: true,
            message: status === 1 ? '用户已封号' : '用户已解封'
        };
    } catch (error) {
        console.error('更新用户状态失败:', error);
        return { success: false, message: '更新用户状态失败' };
    }
};

// 通过第三方用户ID更新状态
export const updateUserStatusByThirdpartyUid = async (thirdparty_uid: string, status: number): Promise<{ success: boolean; message?: string }> => {
    try {
        // 验证状态值
        if (status !== 0 && status !== 1) {
            return { success: false, message: '状态值无效，只能是0（正常）或1（封号）' };
        }

        // 先查找用户
        const user = await findByThirdpartyUid(thirdparty_uid);
        if (!user) {
            return { success: false, message: '用户不存在' };
        }

        return await updateUserStatus(user.id!, status);
    } catch (error) {
        console.error('更新用户状态失败:', error);
        return { success: false, message: '更新用户状态失败' };
    }
};

// 检查用户状态
export const checkUserStatus = async (user_id: number): Promise<{ isBanned: boolean; status: number }> => {
    try {
        const result = await sql({
            query: 'SELECT status FROM Users WHERE id = ?',
            values: [user_id],
        }) as any[];

        if (result.length === 0) {
            return { isBanned: false, status: 0 }; // 用户不存在，默认为正常
        }

        const status = parseInt(result[0].status) || 0;
        return { isBanned: status === 1, status };
    } catch (error) {
        console.error('检查用户状态失败:', error);
        return { isBanned: false, status: 0 }; // 出错时默认为正常
    }
};

// 通过第三方用户ID检查状态
export const checkUserStatusByThirdpartyUid = async (thirdparty_uid: string): Promise<{ isBanned: boolean; status: number }> => {
    try {
        const result = await sql({
            query: 'SELECT status FROM Users WHERE thirdparty_uid = ?',
            values: [thirdparty_uid],
        }) as any[];

        if (result.length === 0) {
            return { isBanned: false, status: 0 }; // 用户不存在，默认为正常
        }

        const status = parseInt(result[0].status) || 0;
        return { isBanned: status === 1, status };
    } catch (error) {
        console.error('检查用户状态失败:', error);
        return { isBanned: false, status: 0 }; // 出错时默认为正常
    }
};