import { H3Event, readBody, createError } from 'h3';
import { sql } from '../db';

type PaymentRecordRow = {
    id: number;
    amount: number;
    payment_way: string | null;
    server_url: string | null;
    role_id: string | null;
    product_name: string | null;
    created_at: Date | string;
    transaction_id: string | null;
    mch_order_id: string | null;
};

type RoleStat = {
    roleId: string;
    serverName: string;
    serverId: number | string;
    level: number;
    platformCoinSpent: number;
    giftCashSpent: number;
    cashbackTriggerValue: number;
    todayPlatformCoinSpent: number;
    todayGiftCashSpent: number;
    todayCashbackTriggerValue: number;
    yesterdayPlatformCoinSpent: number;
    yesterdayGiftCashSpent: number;
    yesterdayCashbackTriggerValue: number;
    lastPurchaseAt: string | null;
};

const PLATFORM_WAY_KEYWORDS = ['平台币', '平台幣', 'ptb', 'platform'];
const WECHAT_KEYWORDS = ['微信', 'wechat', 'wx'];
const ALIPAY_KEYWORDS = ['支付宝', '支付寶', 'alipay', 'zfb'];

function normalizeNumber(value: any): number {
    const num = Number(value);
    return Number.isFinite(num) ? Math.abs(num) : 0;
}

function isPlatformCoinPayment(paymentWayRaw: string | null | undefined): boolean {
    const paymentWay = (paymentWayRaw || '').toString().trim().toLowerCase();
    if (!paymentWay) {
        return false;
    }
    return PLATFORM_WAY_KEYWORDS.some(keyword => paymentWay.includes(keyword.toLowerCase()));
}

function includesKeyword(paymentWay: string, keywords: string[]): boolean {
    return keywords.some(keyword => paymentWay.includes(keyword.toLowerCase()));
}

function isWechatPayment(paymentWayRaw: string | null | undefined): boolean {
    const paymentWay = (paymentWayRaw || '').toString().trim().toLowerCase();
    if (!paymentWay) {
        return false;
    }
    return includesKeyword(paymentWay, WECHAT_KEYWORDS);
}

function isAlipayPayment(paymentWayRaw: string | null | undefined): boolean {
    const paymentWay = (paymentWayRaw || '').toString().trim().toLowerCase();
    if (!paymentWay) {
        return false;
    }
    return includesKeyword(paymentWay, ALIPAY_KEYWORDS);
}

function isCashPayment(paymentWayRaw: string | null | undefined): boolean {
    return isWechatPayment(paymentWayRaw) || isAlipayPayment(paymentWayRaw);
}

function isGiftOrder(serverUrlRaw: string | null | undefined): boolean {
    if (!serverUrlRaw) {
        return false;
    }
    return serverUrlRaw.startsWith('gift://');
}

function isPlatformCoinRecharge(productNameRaw: string | null | undefined, serverUrlRaw: string | null | undefined): boolean {
    const name = (productNameRaw || '').toString().toLowerCase();
    const url = (serverUrlRaw || '').toString();
    return name.includes('平台币') || name.includes('充值') || name.includes('ptb') || url.includes('cashier');
}

export const getPlayerDetail = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const rawInput = body?.user_id ?? body?.userId ?? body?.id ?? body?.keyword ?? body?.query;

        if (
            rawInput === undefined ||
            rawInput === null ||
            (typeof rawInput === 'string' && rawInput.trim() === '')
        ) {
            throw createError({ statusCode: 400, message: '请输入有效的用户标识' });
        }

        const baseUserFields = 'id, username, password, platform_coins, created_at, status, thirdparty_uid, channel_code';

        const fetchUserById = async (id: number) => {
            if (!Number.isInteger(id) || id <= 0) {
                return null;
            }
            const rows = await sql({
                query: `SELECT ${baseUserFields} FROM Users WHERE id = ? LIMIT 1`,
                values: [id],
            }) as any[];
            return rows.length > 0 ? rows[0] : null;
        };

        const fetchUserByUsername = async (username: string) => {
            if (!username) return null;
            const rows = await sql({
                query: `SELECT ${baseUserFields} FROM Users WHERE username = ? LIMIT 1`,
                values: [username],
            }) as any[];
            return rows.length > 0 ? rows[0] : null;
        };

        const fetchUserByRoleId = async (roleId: string) => {
            if (!roleId) return null;
            // 从 gamecharacters 表通过 uuid 查找 user_id
            const rows = await sql({
                query: `SELECT user_id FROM gamecharacters WHERE uuid = ? LIMIT 1`,
                values: [roleId],
            }) as any[];
            if (rows.length === 0) return null;
            return await fetchUserById(Number(rows[0].user_id));
        };

        const fetchUserBySubUserId = async (subUserId: string) => {
            if (!subUserId) return null;
            // 从 subusers 表通过 id 查找 parent_user_id
            const subUserIdNum = parseInt(subUserId);
            if (isNaN(subUserIdNum)) return null;
            
            const rows = await sql({
                query: `SELECT parent_user_id FROM subusers WHERE id = ? LIMIT 1`,
                values: [subUserIdNum],
            }) as any[];
            if (rows.length === 0) return null;
            return await fetchUserById(Number(rows[0].parent_user_id));
        };

        let user: any | null = null;

        if (typeof rawInput === 'number') {
            user = await fetchUserById(rawInput);
        } else if (typeof rawInput === 'string') {
            const keyword = rawInput.trim();

            // 1. 尝试作为用户ID查找
            if (/^\d+$/.test(keyword)) {
                user = await fetchUserById(Number(keyword));
            }

            // 2. 尝试作为用户名查找
            if (!user) {
                user = await fetchUserByUsername(keyword);
            }

            // 3. 尝试作为 role_id (playerId) 查找
            if (!user) {
                user = await fetchUserByRoleId(keyword);
            }

            // 4. 尝试作为 sub_user_id (openId) 查找
            if (!user) {
                user = await fetchUserBySubUserId(keyword);
            }
        }

        if (!user) {
            throw createError({ statusCode: 404, message: '用户不存在' });
        }

        const userId = Number(user.id);

        // 读取全部成功的支付记录
        const paymentRows = await sql({
            query: `
                SELECT 
                    id,
                    amount,
                    payment_way,
                    server_url,
                    role_id,
                    product_name,
                    created_at,
                    transaction_id,
                    mch_order_id
                FROM paymentrecords
                WHERE user_id = ? AND payment_status = 3
                ORDER BY created_at DESC
            `,
            values: [userId],
        }) as PaymentRecordRow[];

        let totalCashAmount = 0;
        let totalPlatformCoinSpent = 0;
        let totalGiftCashSpent = 0;
        let totalCashRecharge = 0;
        let firstPaymentAt: string | null = null;
        let lastPaymentAt: string | null = null;

        // 今日和昨日的统计
        let todayPlatformCoinSpent = 0;
        let todayGiftCashSpent = 0;
        let yesterdayPlatformCoinSpent = 0;
        let yesterdayGiftCashSpent = 0;

        // 获取今日和昨日的日期范围（基于本地时区）
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);

        const roleStatMap = new Map<string, RoleStat>();

        // 提前获取角色的基本信息（区服、等级等）
        const characterRows = await sql({
            query: 'SELECT uuid, server_id, server_name, character_level FROM GameCharacters WHERE user_id = ?',
            values: [userId]
        }) as any[];
        
        const characterMap = new Map<string, { server_id: number | string, server_name: string, level: number }>();
        characterRows.forEach((row: any) => {
            characterMap.set(row.uuid, { 
                server_id: row.server_id, 
                server_name: row.server_name,
                level: row.character_level || 1
            });
        });

        for (const row of paymentRows) {
            const amount = normalizeNumber(row.amount);
            const isPlatformPayment = isPlatformCoinPayment(row.payment_way);
            const isCash = isCashPayment(row.payment_way);
            const giftOrder = isGiftOrder(row.server_url);
            const platformRecharge = isPlatformCoinRecharge(row.product_name, row.server_url);
            const timestamp = new Date(row.created_at);
            const createdAt = isNaN(timestamp.getTime()) ? null : timestamp.toISOString();

            if (!lastPaymentAt && createdAt) {
                lastPaymentAt = createdAt;
            }
            if (createdAt) {
                if (!firstPaymentAt || createdAt < firstPaymentAt) {
                    firstPaymentAt = createdAt;
                }
            }

            if (isPlatformPayment) {
                totalPlatformCoinSpent += amount;
                
                // 统计今日和昨日的平台币花费
                const recordDate = new Date(row.created_at);
                if (recordDate >= todayStart && recordDate <= todayEnd) {
                    todayPlatformCoinSpent += amount;
                } else if (recordDate >= yesterdayStart && recordDate <= yesterdayEnd) {
                    yesterdayPlatformCoinSpent += amount;
                }
            } else if (isCash) {
                totalCashAmount += amount;
                if (giftOrder) {
                    totalGiftCashSpent += amount;
                    
                    // 统计今日和昨日的礼包现金消费
                    const recordDate = new Date(row.created_at);
                    if (recordDate >= todayStart && recordDate <= todayEnd) {
                        todayGiftCashSpent += amount;
                    } else if (recordDate >= yesterdayStart && recordDate <= yesterdayEnd) {
                        yesterdayGiftCashSpent += amount;
                    }
                }
                if (platformRecharge) {
                    totalCashRecharge += amount;
                }
            }

            // 🔍 按角色统计时，跳过以下订单：
            // 1. 平台币充值订单（微信/支付宝买平台币，这是账号级别充值）
            // 2. role_id为空的订单（没有绑定角色，也是账号级别操作）
            // 3. 管理员发放订单（transaction_id 以 bonus_ 开头）
            // 4. 临时生成的 user_xxx 格式的 role_id（管理员发放时的临时ID）
            
            if (platformRecharge && isCash) {
                continue;
            }
            
            // 如果没有role_id，跳过
            if (!row.role_id || !row.role_id.trim()) {
                continue;
            }
            
            const roleId = row.role_id.trim();
            
            // 跳过管理员发放的订单（transaction_id 以 bonus_ 开头）
            const transactionId = (row.transaction_id || '').toString().toLowerCase();
            if (transactionId.startsWith('bonus_')) {
                continue;
            }
            
            // 跳过临时生成的 user_xxx 格式的 role_id
            if (roleId.match(/^user_\d+$/)) {
                continue;
            }
            if (!roleStatMap.has(roleId)) {
                const charInfo = characterMap.get(roleId) || { server_id: '-', server_name: '未知区服', level: 0 };
                roleStatMap.set(roleId, {
                    roleId,
                    serverName: charInfo.server_name,
                    serverId: charInfo.server_id,
                    level: charInfo.level,
                    platformCoinSpent: 0,
                    giftCashSpent: 0,
                    cashbackTriggerValue: 0,
                    todayPlatformCoinSpent: 0,
                    todayGiftCashSpent: 0,
                    todayCashbackTriggerValue: 0,
                    yesterdayPlatformCoinSpent: 0,
                    yesterdayGiftCashSpent: 0,
                    yesterdayCashbackTriggerValue: 0,
                    lastPurchaseAt: null,
                });
            }

            const stat = roleStatMap.get(roleId)!;
            const recordDate = new Date(row.created_at);
            
            // 累计统计（只统计角色的实际消费）
            if (isPlatformPayment) {
                stat.platformCoinSpent += amount;
                
                // 今日平台币消费
                if (recordDate >= todayStart && recordDate <= todayEnd) {
                    stat.todayPlatformCoinSpent += amount;
                }
                // 昨日平台币消费
                else if (recordDate >= yesterdayStart && recordDate <= yesterdayEnd) {
                    stat.yesterdayPlatformCoinSpent += amount;
                }
            } else if (isCash && giftOrder) {
                stat.giftCashSpent += amount;
                
                // 今日礼包现金消费
                if (recordDate >= todayStart && recordDate <= todayEnd) {
                    stat.todayGiftCashSpent += amount;
                }
                // 昨日礼包现金消费
                else if (recordDate >= yesterdayStart && recordDate <= yesterdayEnd) {
                    stat.yesterdayGiftCashSpent += amount;
                }
            }

            if (createdAt) {
                if (!stat.lastPurchaseAt || createdAt > stat.lastPurchaseAt) {
                    stat.lastPurchaseAt = createdAt;
                }
            }
        }

        const roleStats: RoleStat[] = Array.from(roleStatMap.values()).map(stat => ({
            ...stat,
            cashbackTriggerValue: stat.platformCoinSpent + stat.giftCashSpent * 10,
            todayCashbackTriggerValue: stat.todayPlatformCoinSpent + stat.todayGiftCashSpent * 10,
            yesterdayCashbackTriggerValue: stat.yesterdayPlatformCoinSpent + stat.yesterdayGiftCashSpent * 10,
        })).sort((a, b) => b.cashbackTriggerValue - a.cashbackTriggerValue);

        // 获取最后一次封号时间
        let bannedAt = null;
        if (user.status === 1) {
            const banLogRows = await sql({
                query: 'SELECT created_at FROM gm_operation_logs WHERE (open_id = ? OR open_id = ?) AND op_type = "ban" ORDER BY created_at DESC LIMIT 1',
                values: [String(user.id), String(user.thirdparty_uid)]
            }) as any[];
            if (banLogRows && banLogRows.length > 0) {
                bannedAt = banLogRows[0].created_at;
            }
        }

        const cashbackTriggerValue = totalPlatformCoinSpent + totalGiftCashSpent * 10;
        const todayCashbackTriggerValue = todayPlatformCoinSpent + todayGiftCashSpent * 10;
        const yesterdayCashbackTriggerValue = yesterdayPlatformCoinSpent + yesterdayGiftCashSpent * 10;

        return {
            code: 200,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    password: '******', // 隐藏真实密码，前端仅用于显示占位
                    channelCode: user.channel_code || '',
                    platformCoinsBalance: Number(user.platform_coins) || 0,
                    createdAt: user.created_at,
                    status: user.status || 0,
                    bannedAt: bannedAt,
                },
                summary: {
                    totalCashAmount,
                    totalPlatformCoinSpent,
                    totalGiftCashSpent,
                    totalCashRecharge,
                    cashbackTriggerValue,
                    todayCashbackTriggerValue,
                    yesterdayCashbackTriggerValue,
                    paymentsCount: paymentRows.length,
                    firstPaymentAt,
                    lastPaymentAt,
                },
                roleStats,
                records: {
                    payments: paymentRows.slice(0, 50), // 最近50条供查看
                },
            },
            message: '获取成功',
        };
    } catch (error: any) {
        console.error('[Player Detail] 获取玩家详情失败:', error);
        throw error;
    }
};

