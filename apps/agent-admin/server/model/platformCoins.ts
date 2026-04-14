import {sql} from '../db';

// 代理间平台币转账
export type AdminPlatformCoinTransaction = {
    id: number;
    from_channel_code: string;
    to_channel_code: string;
    from_admin_name: string;
    to_admin_name: string;
    amount: number;
    from_balance_before: number;
    from_balance_after: number;
    to_balance_before: number;
    to_balance_after: number;
    remark?: string;
    operator_channel_code?: string;
    created_at?: string;
};

// 代理给玩家平台币转账
export type AdminToPlayerPlatformCoinTransaction = {
    id: number;
    admin_channel_code: string;
    admin_name: string;
    user_id: number;
    user_channel_code?: string;
    game_code?: string;
    game_name?: string;
    amount: number;
    admin_balance_before: number;
    admin_balance_after: number;
    player_balance_before: number;
    player_balance_after: number;
    remark?: string;
    operator_channel_code?: string;
    created_at?: string;
};

// 代理间转账
export const transferBetweenAdmins = async (
    fromChannelCode: string,
    toChannelCode: string,
    amount: number,
    remark: string = '',
    operatorChannelCode: string = ''
) => {
    try {
        await sql({ query: 'START TRANSACTION' });

        // 获取发送方信息
        const fromAdmin = await sql({
            query: 'SELECT name, available_platform_coins FROM Admins WHERE channel_code = ?',
            values: [fromChannelCode]
        }) as any[];

        if (!fromAdmin.length) {
            throw new Error('发送方代理不存在');
        }

        // 获取接收方信息
        const toAdmin = await sql({
            query: 'SELECT name, available_platform_coins FROM Admins WHERE channel_code = ?',
            values: [toChannelCode]
        }) as any[];

        if (!toAdmin.length) {
            throw new Error('接收方代理不存在');
        }

        const fromBalance = parseFloat(fromAdmin[0].available_platform_coins) || 0;
        const toBalance = parseFloat(toAdmin[0].available_platform_coins) || 0;

        if (fromBalance < amount) {
            throw new Error('余额不足');
        }

        const newFromBalance = fromBalance - amount;
        const newToBalance = toBalance + amount;

        // 更新发送方余额
        await sql({
            query: 'UPDATE Admins SET available_platform_coins = ? WHERE channel_code = ?',
            values: [newFromBalance, fromChannelCode]
        });

        // 更新接收方余额
        await sql({
            query: 'UPDATE Admins SET available_platform_coins = ? WHERE channel_code = ?',
            values: [newToBalance, toChannelCode]
        });

        // 记录流水
        await sql({
            query: `INSERT INTO AdminPlatformCoinTransactions 
                   (from_channel_code, to_channel_code, from_admin_name, to_admin_name, 
                    amount, from_balance_before, from_balance_after, to_balance_before, to_balance_after, 
                    remark, operator_channel_code) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
                fromChannelCode, toChannelCode, fromAdmin[0].name, toAdmin[0].name,
                amount, fromBalance, newFromBalance, toBalance, newToBalance,
                remark, operatorChannelCode
            ]
        });

        await sql({ query: 'COMMIT' });
        return { success: true, message: '转账成功' };
    } catch (error: any) {
        await sql({ query: 'ROLLBACK' });
        throw error;
    }
};

// 代理给玩家转账
export const transferToPlayer = async (
    adminChannelCode: string,
    userId: string,
    amount: number,
    remark: string = '',
    operatorChannelCode: string = ''
) => {
    try {
        await sql({ query: 'START TRANSACTION' });

        // 获取代理信息
        const admin = await sql({
            query: 'SELECT name, available_platform_coins FROM Admins WHERE channel_code = ?',
            values: [adminChannelCode]
        }) as any[];

        if (!admin.length) {
            throw new Error('代理不存在');
        }

        // 获取玩家信息 - 使用user_id查找
        const user = await sql({
            query: 'SELECT id, platform_coins, channel_code, game_code, thirdparty_uid FROM Users WHERE id = ?',
            values: [parseInt(userId.toString())]
        }) as any[];

        if (!user.length) {
            throw new Error('玩家不存在');
        }

        const adminBalance = parseFloat(admin[0].available_platform_coins) || 0;
        const playerBalance = parseFloat(user[0].platform_coins) || 0;

        // 支持负数：正数=发放，负数=扣除
        if (amount > 0) {
            // 发放平台币：检查代理余额
            if (adminBalance < amount) {
                throw new Error('代理余额不足');
            }
        } else if (amount < 0) {
            // 扣除平台币：检查玩家余额
            if (playerBalance < Math.abs(amount)) {
                throw new Error('玩家余额不足');
            }
        }

        const newAdminBalance = adminBalance - amount;

        // 更新代理余额
        await sql({
            query: 'UPDATE Admins SET available_platform_coins = ? WHERE channel_code = ?',
            values: [newAdminBalance, adminChannelCode]
        });

        // 更新玩家余额（使用统一方法）
        const { updatePlatformCoinsUnified } = await import('./user');
        const updateResult = await updatePlatformCoinsUnified(parseInt(userId.toString()), amount, 5);
        if (!updateResult.success) {
            throw new Error(updateResult.message || '更新玩家余额失败');
        }
        const newPlayerBalance = updateResult.newBalance!;

        // 记录流水 - 使用user_thirdparty_uid字段
        await sql({
            query: `INSERT INTO AdminToPlayerPlatformCoinTransactions 
                   (admin_channel_code, admin_name, user_thirdparty_uid, user_channel_code, game_code,
                    amount, admin_balance_before, admin_balance_after, player_balance_before, player_balance_after, 
                    remark, operator_channel_code) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
                adminChannelCode, admin[0].name, user[0].thirdparty_uid || '', user[0].channel_code || '', user[0].game_code || '',
                amount, adminBalance, newAdminBalance, playerBalance, newPlayerBalance,
                remark, operatorChannelCode
            ]
        });

        // 📝 在 PaymentRecords 中创建充值/扣除记录（保持余额链完整性）
        const transactionId = `bonus_${Date.now()}_${userId}_${Math.random().toString(36).substr(2, 9)}`;
        const operationType = amount > 0 ? '管理员发放' : '管理员扣除';
        
        await sql({
            query: `INSERT INTO PaymentRecords 
                   (user_id, sub_user_id, transaction_id, wuid, payment_way, payment_id,
                    world_id, product_name, product_des, ip, amount, mch_order_id, msg,
                    server_url, device, channel_code, game_code, payment_status,
                    ptb_before, ptb_change, ptb_after)
                   VALUES (?, ?, ?,  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
                parseInt(userId.toString()),  // user_id
                null,                         // sub_user_id
                transactionId,                // transaction_id
                0,                          // wuid （管理员发放设置为'0'）
                "平台币",                      // payment_way
                0,                            // payment_id
                1,                            // world_id
                operationType,                // product_name
                remark || `${operationType}平台币`, // product_des
                '',                           // ip
                Math.abs(amount),             // amount (绝对值)
                transactionId,                // mch_order_id
                `操作人:${operatorChannelCode || adminChannelCode}`, // msg
                '',                           // server_url
                '',                           // device
                user[0].channel_code || '',   // channel_code
                user[0].game_code || '',      // game_code
                3,                            // payment_status (成功)
                playerBalance,                // ptb_before
                amount,                       // ptb_change (可能是正数或负数)
                newPlayerBalance              // ptb_after
            ]
        });

        await sql({ query: 'COMMIT' });
        const message = amount > 0 ? '发放成功' : '扣除成功';
        return { success: true, message };
    } catch (error: any) {
        await sql({ query: 'ROLLBACK' });
        throw error;
    }
};

// 获取代理间转账记录
export const getAdminTransactions = async (channelCode: string, page: number = 1, pageSize: number = 20) => {
    const offset = (page - 1) * pageSize;
    
    const transactions = await sql({
        query: `SELECT * FROM AdminPlatformCoinTransactions 
               WHERE from_channel_code = ? OR to_channel_code = ?
               ORDER BY created_at DESC 
               LIMIT ? OFFSET ?`,
        values: [channelCode, channelCode, pageSize, offset]
    });

    const countResult = await sql({
        query: `SELECT COUNT(*) as total FROM AdminPlatformCoinTransactions 
               WHERE from_channel_code = ? OR to_channel_code = ?`,
        values: [channelCode, channelCode]
    }) as any[];

    return {
        data: transactions,
        total: countResult[0].total,
        page,
        pageSize
    };
};

// 获取代理给玩家转账记录
export const getAdminToPlayerTransactions = async (channelCode: string, page: number = 1, pageSize: number = 20) => {
    const offset = (page - 1) * pageSize;
    
    const transactions = await sql({
        query: `SELECT 
                   apt.*,
                   g.game_name,
                   u.id as user_id
                FROM AdminToPlayerPlatformCoinTransactions apt
                LEFT JOIN Games g ON apt.game_code = g.game_code
                LEFT JOIN Users u ON apt.user_thirdparty_uid = u.thirdparty_uid
                WHERE apt.admin_channel_code = ?
                ORDER BY apt.created_at DESC 
                LIMIT ? OFFSET ?`,
        values: [channelCode, pageSize, offset]
    });

    const countResult = await sql({
        query: `SELECT COUNT(*) as total FROM AdminToPlayerPlatformCoinTransactions 
               WHERE admin_channel_code = ?`,
        values: [channelCode]
    }) as any[];

    return {
        data: transactions,
        total: countResult[0].total,
        page,
        pageSize
    };
};

// 获取代理余额
export const getAdminBalance = async (channelCode: string) => {
    const result = await sql({
        query: 'SELECT platform_coins, available_platform_coins FROM Admins WHERE channel_code = ?',
        values: [channelCode]
    }) as any[];

    if (!result.length) {
        throw new Error('代理不存在');
    }

    return {
        platform_coins: parseFloat(result[0].platform_coins) || 0,
        available_platform_coins: parseFloat(result[0].available_platform_coins) || 0
    };
};

// 超级管理员分配平台币（现在也受余额限制）
export const allocatePlatformCoins = async (
    fromChannelCode: string, // 改为从指定渠道分配
    toChannelCode: string,
    amount: number,
    remark: string = '',
    operatorChannelCode: string = ''
) => {
    try {
        await sql({ query: 'START TRANSACTION' });

        // 获取发送方信息（超级管理员）
        const fromAdmin = await sql({
            query: 'SELECT name, available_platform_coins FROM Admins WHERE channel_code = ?',
            values: [fromChannelCode]
        }) as any[];

        if (!fromAdmin.length) {
            throw new Error('分配方代理不存在');
        }

        // 获取接收方信息
        const toAdmin = await sql({
            query: 'SELECT name, available_platform_coins FROM Admins WHERE channel_code = ?',
            values: [toChannelCode]
        }) as any[];

        if (!toAdmin.length) {
            throw new Error('接收方代理不存在');
        }

        const fromBalance = parseFloat(fromAdmin[0].available_platform_coins) || 0;
        const toBalance = parseFloat(toAdmin[0].available_platform_coins) || 0;

        // 检查发送方余额
        if (fromBalance < amount) {
            throw new Error('分配方余额不足');
        }

        const newFromBalance = fromBalance - amount;
        const newToBalance = toBalance + amount;

        // 更新发送方余额
        await sql({
            query: 'UPDATE Admins SET available_platform_coins = ? WHERE channel_code = ?',
            values: [newFromBalance, fromChannelCode]
        });

        // 更新接收方余额
        await sql({
            query: 'UPDATE Admins SET available_platform_coins = ? WHERE channel_code = ?',
            values: [newToBalance, toChannelCode]
        });

        // 记录流水
        await sql({
            query: `INSERT INTO AdminPlatformCoinTransactions 
                   (from_channel_code, to_channel_code, from_admin_name, to_admin_name, 
                    amount, from_balance_before, from_balance_after, to_balance_before, to_balance_after, 
                    remark, operator_channel_code) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values: [
                fromChannelCode, toChannelCode, fromAdmin[0].name, toAdmin[0].name,
                amount, fromBalance, newFromBalance, toBalance, newToBalance,
                remark, operatorChannelCode
            ]
        });

        await sql({ query: 'COMMIT' });
        return { success: true, message: '分配成功' };
    } catch (error: any) {
        await sql({ query: 'ROLLBACK' });
        throw error;
    }
}; 