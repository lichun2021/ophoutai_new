import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, sql } from '../db';
import { updatePlatformCoinsUnified } from './user';

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

export class PlayerCoinTransferError extends Error {}

// PaymentRecords.amount 是 DECIMAL(10, 2)。
export const MAX_PLATFORM_COIN_GRANT = 99_999_999.99;

type PlayerGrant = {
    adminId: number;
    userId: number;
    account: string;
    thirdpartyUid: string;
    amount: number;
    requestId: string;
};

type FundingAccount = { channelCode: string; operatorChannelCode: string } | PlayerGrant;

const transferPlayerBalance = async (
    fundingAccount: FundingAccount,
    userId: number,
    amount: number,
    remark: string,
) => {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isFinite(amount) || amount === 0) {
        throw new PlayerCoinTransferError('用户ID或金额无效');
    }

    const connection = await pool.getConnection();
    const runQuery: typeof sql = async ({ query, values = [] }) => {
        const [rows] = await connection.query<RowDataPacket[] | ResultSetHeader>(query, values);
        return rows;
    };

    try {
        await connection.beginTransaction();
        const isGrant = 'adminId' in fundingAccount;
        const [admins] = await connection.query<RowDataPacket[]>(
            `SELECT id, name, channel_code, level, is_active, available_platform_coins
             FROM Admins WHERE ${isGrant ? 'id' : 'channel_code'} = ? LIMIT 2 FOR UPDATE`,
            [isGrant ? fundingAccount.adminId : fundingAccount.channelCode],
        );
        const admin = admins[0];
        if (isGrant && (!admin || admin.level !== 0 || Number(admin.is_active) !== 1)) {
            throw new PlayerCoinTransferError('只有启用的超级管理员可以给玩家发放平台币');
        }
        if (admins.length !== 1 || !admin.channel_code) {
            throw new PlayerCoinTransferError('无法唯一确定扣款管理员渠道');
        }

        const adminChannelCode: string = admin.channel_code;
        const operatorChannelCode = isGrant ? adminChannelCode : fundingAccount.operatorChannelCode;
        const transactionId = isGrant
            ? `bonus_tg_${admin.id}_${fundingAccount.requestId.toLowerCase()}`
            : `bonus_${Date.now()}_${userId}_${Math.random().toString(36).slice(2, 11)}`;

        // 相同管理员的确认请求由管理员余额行锁串行处理，流水唯一键跨进程保留结果。
        if (isGrant) {
            const [receipts] = await connection.query<RowDataPacket[]>(
                `SELECT user_id, ptb_change, payment_status, product_name, mch_order_id
                 FROM PaymentRecords WHERE transaction_id = ?`,
                [transactionId],
            );
            const receipt = receipts[0];
            if (receipt) {
                if (Number(receipt.user_id) !== userId || Number(receipt.ptb_change) !== amount
                    || receipt.payment_status !== 3 || receipt.product_name !== '管理员发放'
                    || receipt.mch_order_id !== transactionId) {
                    throw new PlayerCoinTransferError('发放确认已用于其他请求，请重新查询玩家');
                }
                await connection.commit();
                return { success: true as const, message: '已发放', replayed: true };
            }
        }

        const [users] = await connection.query<RowDataPacket[]>(
            `SELECT id, username, status, platform_coins, channel_code, game_code, thirdparty_uid
             FROM Users WHERE id = ? FOR UPDATE`,
            [userId],
        );
        const user = users[0];
        if (!user) throw new PlayerCoinTransferError('玩家不存在');
        if (isGrant) {
            if ((user.username || user.thirdparty_uid) !== fundingAccount.account
                || user.thirdparty_uid !== fundingAccount.thirdpartyUid) {
                throw new PlayerCoinTransferError('玩家账号信息已变更，请重新查询');
            }
            if ((user.status ?? 0) !== 0) throw new PlayerCoinTransferError('该玩家账号已禁用');
        }

        const adminBalance = Number(admin.available_platform_coins) || 0;
        const playerBalance = Number(user.platform_coins) || 0;
        if (amount > 0 && adminBalance < amount) throw new PlayerCoinTransferError('代理余额不足');
        if (amount < 0 && playerBalance < -amount) throw new PlayerCoinTransferError('玩家余额不足');

        const newAdminBalance = adminBalance - amount;
        await connection.query('UPDATE Admins SET available_platform_coins = ? WHERE id = ?', [newAdminBalance, admin.id]);
        const updateResult = await updatePlatformCoinsUnified(userId, amount, 5, runQuery);
        if (!updateResult.success || updateResult.newBalance === undefined) {
            throw new Error(updateResult.message || '更新玩家余额失败');
        }
        const newPlayerBalance = updateResult.newBalance;

        await connection.query(
            `INSERT INTO AdminToPlayerPlatformCoinTransactions
                   (admin_channel_code, admin_name, user_thirdparty_uid, user_channel_code, game_code,
                    amount, admin_balance_before, admin_balance_after, player_balance_before, player_balance_after, 
                    remark, operator_channel_code) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adminChannelCode, admin.name, user.thirdparty_uid || '', user.channel_code || '', user.game_code || '',
                amount, adminBalance, newAdminBalance, playerBalance, newPlayerBalance,
                remark, operatorChannelCode
            ],
        );

        // 管理员发放和扣除沿用主账号的余额流水格式。
        const operationType = amount > 0 ? '管理员发放' : '管理员扣除';
        await connection.query(
            `INSERT INTO PaymentRecords
                   (user_id, sub_user_id, transaction_id, wuid, payment_way, payment_id,
                    world_id, product_name, product_des, ip, amount, mch_order_id, msg,
                    server_url, device, channel_code, game_code, payment_status,
                    ptb_before, ptb_change, ptb_after)
                   VALUES (?, NULL, ?, '0', '平台币', 0, 1, ?, ?, '', ?, ?, ?, '', '', ?, ?, 3, ?, ?, ?)`,
            [
                userId, transactionId, operationType, remark || `${operationType}平台币`, Math.abs(amount),
                transactionId, `操作人:${operatorChannelCode || adminChannelCode}`, user.channel_code || '',
                user.game_code || '', playerBalance, amount, newPlayerBalance,
            ],
        );

        await connection.commit();
        const message = amount > 0 ? '发放成功' : '扣除成功';
        return { success: true as const, message, replayed: false };
    } catch (error) {
        await connection.rollback().catch(() => connection.destroy());
        throw error;
    } finally {
        connection.release();
    }
};

// 后台继续支持正数发放和负数扣除。
export const transferToPlayer = async (
    adminChannelCode: string,
    userId: string,
    amount: number,
    remark = '',
    operatorChannelCode = '',
) => {
    const { success, message } = await transferPlayerBalance(
        { channelCode: adminChannelCode, operatorChannelCode }, Number(userId), amount, remark,
    );
    return { success, message };
};

export const grantToPlayerFromAdmin = async (grant: PlayerGrant) => {
    if (!Number.isSafeInteger(grant.adminId) || grant.adminId <= 0) {
        throw new PlayerCoinTransferError('后台管理员无效');
    }
    if (!Number.isFinite(grant.amount) || grant.amount <= 0 || grant.amount > MAX_PLATFORM_COIN_GRANT
        || Number(grant.amount.toFixed(2)) !== grant.amount) {
        throw new PlayerCoinTransferError('请输入有效的正数金额，最多两位小数');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(grant.requestId)) {
        throw new PlayerCoinTransferError('发放确认无效，请重新查询玩家');
    }
    return transferPlayerBalance(grant, grant.userId, grant.amount, 'Telegram 机器人发放');
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
export const getAdminToPlayerTransactions = async (
    channelCode: string,
    page: number = 1,
    pageSize: number = 20,
    filters: { userId?: number; startDate?: string; endDate?: string } = {}
) => {
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['apt.admin_channel_code = ?'];
    const whereValues: any[] = [channelCode];

    if (filters.userId) {
        whereClauses.push('u.id = ?');
        whereValues.push(filters.userId);
    }
    if (filters.startDate) {
        whereClauses.push('DATE(apt.created_at) >= ?');
        whereValues.push(filters.startDate);
    }
    if (filters.endDate) {
        whereClauses.push('DATE(apt.created_at) <= ?');
        whereValues.push(filters.endDate);
    }

    const whereStr = whereClauses.join(' AND ');

    const transactions = await sql({
        query: `SELECT 
                   apt.*,
                   g.game_name,
                   u.id as user_id
                FROM AdminToPlayerPlatformCoinTransactions apt
                LEFT JOIN Games g ON apt.game_code = g.game_code
                LEFT JOIN Users u ON apt.user_thirdparty_uid = u.thirdparty_uid
                WHERE ${whereStr}
                ORDER BY apt.created_at DESC 
                LIMIT ? OFFSET ?`,
        values: [...whereValues, pageSize, offset]
    });

    const countResult = await sql({
        query: `SELECT COUNT(*) as total
                FROM AdminToPlayerPlatformCoinTransactions apt
                LEFT JOIN Users u ON apt.user_thirdparty_uid = u.thirdparty_uid
                WHERE ${whereStr}`,
        values: whereValues
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
