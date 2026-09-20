import { H3Event, readBody, getQuery, createError } from 'h3';
import { sql } from '../db';
import { getChinaDateString, getChinaDateStringDaysAgo } from '../utils/timezone';

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

const RESOLVE_USER_BASE_FIELDS = 'id, username, password, platform_coins, created_at, status, thirdparty_uid, channel_code, remark';

/**
 * 按灵活标识（用户ID / 用户名 / 角色ID(playerId) / 子账号ID(openId)）解析出用户
 * 供充值排行榜等场景做"定位某个玩家"用；解析顺序与 getPlayerDetail 内联逻辑保持一致
 */
async function resolveUserByIdentifier(rawInput: unknown): Promise<any | null> {
    const fetchById = async (id: number) => {
        if (!Number.isInteger(id) || id <= 0) return null;
        const rows = await sql({
            query: `SELECT ${RESOLVE_USER_BASE_FIELDS} FROM Users WHERE id = ? LIMIT 1`,
            values: [id],
        }) as any[];
        return rows.length > 0 ? rows[0] : null;
    };
    const fetchByUsername = async (username: string) => {
        if (!username) return null;
        const rows = await sql({
            query: `SELECT ${RESOLVE_USER_BASE_FIELDS} FROM Users WHERE username = ? LIMIT 1`,
            values: [username],
        }) as any[];
        return rows.length > 0 ? rows[0] : null;
    };
    const fetchByRoleId = async (roleId: string) => {
        if (!roleId) return null;
        const rows = await sql({
            query: `SELECT user_id FROM gamecharacters WHERE uuid = ? LIMIT 1`,
            values: [roleId],
        }) as any[];
        if (rows.length === 0) return null;
        return await fetchById(Number(rows[0].user_id));
    };
    const fetchBySubUserId = async (subUserId: string) => {
        if (!subUserId) return null;
        const subUserIdNum = parseInt(subUserId);
        if (isNaN(subUserIdNum)) return null;
        const rows = await sql({
            query: `SELECT parent_user_id FROM subusers WHERE id = ? LIMIT 1`,
            values: [subUserIdNum],
        }) as any[];
        if (rows.length === 0) return null;
        return await fetchById(Number(rows[0].parent_user_id));
    };

    if (typeof rawInput === 'number') {
        return await fetchById(rawInput);
    }
    if (typeof rawInput === 'string') {
        const keyword = rawInput.trim();
        if (!keyword) return null;
        if (/^\d+$/.test(keyword)) {
            const byId = await fetchById(Number(keyword));
            if (byId) return byId;
        }
        const byUsername = await fetchByUsername(keyword);
        if (byUsername) return byUsername;
        const byRoleId = await fetchByRoleId(keyword);
        if (byRoleId) return byRoleId;
        return await fetchBySubUserId(keyword);
    }
    return null;
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

        const baseUserFields = 'id, username, password, platform_coins, created_at, status, thirdparty_uid, channel_code, remark';

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
                    remark: user.remark || '',
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

// 更新玩家备注
export const updateRemark = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const userId = body?.user_id;
        const remark = body?.remark ?? '';

        if (!userId) {
            throw createError({ statusCode: 400, message: '缺少 user_id 参数' });
        }

        const result = await sql({
            query: 'UPDATE Users SET remark = ? WHERE id = ?',
            values: [String(remark).slice(0, 500), Number(userId)],
        }) as any;

        if (result.affectedRows === 0) {
            throw createError({ statusCode: 404, message: '用户不存在' });
        }

        return { success: true, message: '备注已保存' };
    } catch (error: any) {
        console.error('[Player Detail] 更新备注失败:', error);
        throw error;
    }
};

// ========== 月卡管理 ==========

/**
 * 获取玩家所有月卡（含已过期的）
 */
export const getPlayerCards = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const userId = Number(body?.user_id);
        if (!userId) throw createError({ statusCode: 400, message: '缺少 user_id' });

        const rows = await sql({
            query: `SELECT * FROM MonthlyCards WHERE user_id = ? ORDER BY created_at DESC`,
            values: [userId],
        }) as any[];

        return { success: true, data: rows };
    } catch (error: any) {
        console.error('[Player Cards] 查询失败:', error);
        throw error;
    }
};

/**
 * 手动激活月卡或终身卡
 * card_type: 'monthly' | 'lifetime'
 * daily_coins: 每日赠币数量
 * days: 月卡有效天数（终身卡传 null 或不传）
 */
export const activatePlayerCard = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const userId = Number(body?.user_id);
        const cardType: 'monthly' | 'lifetime' = body?.card_type;
        const dailyCoins = Number(body?.daily_coins ?? 0);
        const days = body?.days !== undefined && body?.days !== null ? Number(body.days) : null;

        if (!userId) throw createError({ statusCode: 400, message: '缺少 user_id' });
        if (cardType !== 'monthly' && cardType !== 'lifetime') {
            throw createError({ statusCode: 400, message: 'card_type 必须为 monthly 或 lifetime' });
        }
        if (dailyCoins < 0 || !Number.isFinite(dailyCoins)) {
            throw createError({ statusCode: 400, message: 'daily_coins 无效' });
        }
        if (cardType === 'monthly' && (!days || days <= 0)) {
            throw createError({ statusCode: 400, message: '月卡需要指定有效天数 days' });
        }

        // 北京时间日期
        const nowBJ = new Date(Date.now() + 8 * 3600 * 1000);
        const startDate = nowBJ.toISOString().slice(0, 10);

        let expireDate: string | null = null;
        if (cardType === 'monthly' && days) {
            const exp = new Date(nowBJ);
            exp.setDate(exp.getDate() + days - 1); // 当天算第一天
            expireDate = exp.toISOString().slice(0, 10);
        }

        const transactionId = `admin_manual_${Date.now()}_${userId}`;

        const result = await sql({
            query: `INSERT INTO MonthlyCards
                        (user_id, card_type, daily_coins, start_date, expire_date, is_active, purchase_amount, transaction_id)
                    VALUES (?, ?, ?, ?, ?, 1, 0, ?)`,
            values: [userId, cardType, dailyCoins, startDate, expireDate, transactionId],
        }) as any;

        console.log(`[Player Cards] 管理员手动激活 ${cardType} 卡，user_id=${userId}，card_id=${result.insertId}`);

        return {
            success: true,
            message: `${cardType === 'monthly' ? '月卡' : '终身卡'}激活成功`,
            data: {
                card_id: result.insertId,
                card_type: cardType,
                start_date: startDate,
                expire_date: expireDate,
                daily_coins: dailyCoins,
            },
        };
    } catch (error: any) {
        console.error('[Player Cards] 激活失败:', error);
        throw error;
    }
};

/**
 * 编辑玩家已有月卡/终身卡（调整每日赠币、开始日期、到期日期）
 * 仅允许修改数值/日期字段，不允许改变 card_type（类型固定不变）
 */
export const updatePlayerCard = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const cardId = Number(body?.card_id);
        const userId = Number(body?.user_id);

        if (!cardId) throw createError({ statusCode: 400, message: '缺少 card_id' });
        if (!userId) throw createError({ statusCode: 400, message: '缺少 user_id' });

        // 确认卡属于该用户，并取出当前 card_type
        const rows = await sql({
            query: 'SELECT * FROM MonthlyCards WHERE id = ? AND user_id = ? LIMIT 1',
            values: [cardId, userId],
        }) as any[];
        if (rows.length === 0) {
            throw createError({ statusCode: 404, message: '未找到该卡，或卡不属于该用户' });
        }
        const card = rows[0];

        const dailyCoins = Number(body?.daily_coins);
        if (!Number.isFinite(dailyCoins) || dailyCoins < 0) {
            throw createError({ statusCode: 400, message: 'daily_coins 无效' });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const startDate = body?.start_date;
        if (!startDate || !dateRegex.test(startDate)) {
            throw createError({ statusCode: 400, message: 'start_date 格式应为 YYYY-MM-DD' });
        }

        // 终身卡永久有效，忽略传入的到期日期，始终为 NULL；月卡必须指定到期日期
        let expireDate: string | null = null;
        if (card.card_type === 'monthly') {
            const rawExpire = body?.expire_date;
            if (!rawExpire || !dateRegex.test(rawExpire)) {
                throw createError({ statusCode: 400, message: '月卡需要指定到期日期 expire_date' });
            }
            if (rawExpire < startDate) {
                throw createError({ statusCode: 400, message: '到期日期不能早于开始日期' });
            }
            expireDate = rawExpire;
        }

        await sql({
            query: 'UPDATE MonthlyCards SET daily_coins = ?, start_date = ?, expire_date = ? WHERE id = ?',
            values: [dailyCoins, startDate, expireDate, cardId],
        });

        console.log(`[Player Cards] 管理员编辑卡片 card_id=${cardId}, user_id=${userId}: daily_coins=${dailyCoins}, start_date=${startDate}, expire_date=${expireDate ?? '永久'}`);

        return {
            success: true,
            message: '月卡信息已更新',
            data: {
                card_id: cardId,
                daily_coins: dailyCoins,
                start_date: startDate,
                expire_date: expireDate,
            },
        };
    } catch (error: any) {
        console.error('[Player Cards] 编辑失败:', error);
        throw error;
    }
};

/**
 * 停用玩家指定月卡（设置 is_active = 0）
 */
export const deactivatePlayerCard = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const cardId = Number(body?.card_id);
        const userId = Number(body?.user_id);

        if (!cardId) throw createError({ statusCode: 400, message: '缺少 card_id' });
        if (!userId) throw createError({ statusCode: 400, message: '缺少 user_id' });

        // 确认卡属于该用户
        const rows = await sql({
            query: 'SELECT id FROM MonthlyCards WHERE id = ? AND user_id = ? LIMIT 1',
            values: [cardId, userId],
        }) as any[];

        if (rows.length === 0) {
            throw createError({ statusCode: 404, message: '未找到该月卡，或卡不属于该用户' });
        }

        await sql({
            query: 'UPDATE MonthlyCards SET is_active = 0 WHERE id = ?',
            values: [cardId],
        });

        console.log(`[Player Cards] 管理员停用月卡 card_id=${cardId}，user_id=${userId}`);

        return { success: true, message: '月卡已停用' };
    } catch (error: any) {
        console.error('[Player Cards] 停用失败:', error);
        throw error;
    }
};

// ========== 玩家充值排行榜（真实充值，支持今日/近3日/近7日/自定义区间 + 可选按用户ID定位 + 分页） ==========

const RECHARGE_RANK_PAGE_SIZES = [10, 20, 50, 100];
const RECHARGE_RANK_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 玩家充值排行榜
 * 口径与 apps/op-admin/部署/scripts/batch-ban-and-refund.js 的 getCashRechargeTotal
 * 以及 apps/user-center 玩家自查页保持一致：
 *   payment_status = 3（支付成功）且排除平台币支付方式，其余现金支付方式（微信/支付宝/其他）均计入"真实充值"
 * 按区间内累计充值金额从高到低排序；默认区间为“今日”，默认展示第 1~10 名
 * 可选 user_id：只定位该用户在榜单中的位置（不改变排序口径，仍返回其在整体排行中的排名和数据）
 */
export const getPlayerRechargeRanking = async (evt: H3Event) => {
    try {
        const query = getQuery(evt);

        // ── 计算统计区间（东8区日期） ──
        const period = String(query.period || 'today');
        const todayStr = getChinaDateString();
        let startDate: string;
        let endDate: string;

        if (period === 'custom') {
            const rawStart = String(query.start_date || '');
            const rawEnd = String(query.end_date || '');
            if (!RECHARGE_RANK_DATE_REGEX.test(rawStart) || !RECHARGE_RANK_DATE_REGEX.test(rawEnd)) {
                throw createError({ statusCode: 400, message: '自定义区间需提供合法的 start_date / end_date（YYYY-MM-DD）' });
            }
            if (rawStart > rawEnd) {
                throw createError({ statusCode: 400, message: '开始日期不能晚于结束日期' });
            }
            startDate = rawStart;
            endDate = rawEnd;
        } else if (period === 'today') {
            startDate = todayStr;
            endDate = todayStr;
        } else if (period === '3' || period === '7') {
            const days = Number(period);
            startDate = getChinaDateStringDaysAgo(days - 1);
            endDate = todayStr;
        } else if (period === 'all') {
            // 总榜：不限制时间
            startDate = '';
            endDate = '';
        } else {
            throw createError({ statusCode: 400, message: 'period 必须为 today / 3 / 7 / all / custom' });
        }

        // ── 可选：按用户ID/用户名/角色ID/子账号ID 定位某个玩家 ──
        const rawIdentifier = query.user_id ?? query.userId ?? query.keyword;
        let focusUserId: number | null = null;
        if (rawIdentifier !== undefined && rawIdentifier !== null && String(rawIdentifier).trim() !== '') {
            const identifier = String(rawIdentifier).trim();
            const focusUser = await resolveUserByIdentifier(/^\d+$/.test(identifier) ? Number(identifier) : identifier);
            if (!focusUser) {
                throw createError({ statusCode: 404, message: '未找到该玩家' });
            }
            focusUserId = Number(focusUser.id);
        }

        // ── 分页参数 ──
        const page = Math.max(parseInt(String(query.page || '1')) || 1, 1);
        let pageSize = parseInt(String(query.pageSize || '10')) || 10;
        if (!RECHARGE_RANK_PAGE_SIZES.includes(pageSize)) pageSize = 10;
        const offset = (page - 1) * pageSize;

        const cashFilterSql = `payment_status = 3 AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')`;
        const dateFilterSql = startDate && endDate ? `AND created_at BETWEEN ? AND ?` : '';
        const dateFilterValues = startDate && endDate ? [`${startDate} 00:00:00`, `${endDate} 23:59:59`] : [];

        // 区间内按用户聚合真实充值金额，倒序排列
        const rankRows = await sql({
            query: `
                SELECT user_id, COUNT(*) AS cnt, SUM(amount) AS total
                FROM paymentrecords
                WHERE ${cashFilterSql} ${dateFilterSql}
                GROUP BY user_id
                HAVING total > 0
                ORDER BY total DESC
            `,
            values: dateFilterValues,
        }) as { user_id: number; cnt: number; total: string }[];

        const totalRankedUsers = rankRows.length;

        // 如果指定了 user_id，定位其排名（1-based），若未上榜则排名为 null
        let focusRank: number | null = null;
        if (focusUserId !== null) {
            const idx = rankRows.findIndex(r => Number(r.user_id) === focusUserId);
            focusRank = idx >= 0 ? idx + 1 : null;
        }

        // 分页：若指定了 user_id 且已上榜，则自动跳转到该用户所在的那一页；否则按常规分页
        let effectivePage = page;
        if (focusUserId !== null && focusRank !== null) {
            effectivePage = Math.ceil(focusRank / pageSize);
        }
        const effectiveOffset = (effectivePage - 1) * pageSize;
        const pageRows = rankRows.slice(effectiveOffset, effectiveOffset + pageSize);

        if (pageRows.length === 0) {
            return {
                code: 200,
                data: {
                    period, start_date: startDate || null, end_date: endDate || null,
                    focus_user_id: focusUserId, focus_rank: focusRank,
                    list: [],
                    pagination: { page: effectivePage, pageSize, total: totalRankedUsers, totalPages: Math.max(Math.ceil(totalRankedUsers / pageSize), 1) },
                },
                message: '获取成功',
            };
        }

        const pageUserIds = pageRows.map(r => Number(r.user_id));

        // 批量获取用户名
        const userRows = await sql({
            query: `SELECT id, username FROM Users WHERE id IN (${pageUserIds.map(() => '?').join(',')})`,
            values: pageUserIds,
        }) as { id: number; username: string }[];
        const userMap = new Map(userRows.map(u => [Number(u.id), u.username]));

        // 批量获取角色列表（一个用户可能有多个角色/区服）
        const characterRows = await sql({
            query: `SELECT user_id, uuid, character_name, server_id, server_name
                     FROM GameCharacters
                     WHERE user_id IN (${pageUserIds.map(() => '?').join(',')})`,
            values: pageUserIds,
        }) as { user_id: number; uuid: string; character_name: string; server_id: number | string; server_name: string }[];

        const charactersByUser = new Map<number, { uuid: string; character_name: string; server_id: number | string; server_name: string }[]>();
        for (const row of characterRows) {
            const uid = Number(row.user_id);
            if (!charactersByUser.has(uid)) charactersByUser.set(uid, []);
            charactersByUser.get(uid)!.push({
                uuid: row.uuid,
                character_name: row.character_name,
                server_id: row.server_id,
                server_name: row.server_name,
            });
        }

        const list = pageRows.map((row, idx) => {
            const userId = Number(row.user_id);
            return {
                rank: effectiveOffset + idx + 1,
                user_id: userId,
                username: userMap.get(userId) || '-',
                total_amount: Number((parseFloat(row.total) || 0).toFixed(2)),
                recharge_count: Number(row.cnt) || 0,
                characters: charactersByUser.get(userId) || [],
                is_focus: focusUserId !== null && userId === focusUserId,
            };
        });

        return {
            code: 200,
            data: {
                period,
                start_date: startDate || null,
                end_date: endDate || null,
                focus_user_id: focusUserId,
                focus_rank: focusRank,
                list,
                pagination: {
                    page: effectivePage,
                    pageSize,
                    total: totalRankedUsers,
                    totalPages: Math.max(Math.ceil(totalRankedUsers / pageSize), 1),
                },
            },
            message: '获取成功',
        };
    } catch (error: any) {
        console.error('[Player Recharge Ranking] 查询失败:', error);
        throw error;
    }
};

