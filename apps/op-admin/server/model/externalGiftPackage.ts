import { sql } from '../db';
import { getSystemConfig } from '../utils/systemConfig';
import { getByWorldId } from '../model/gameServers';

export type ExternalGiftPackage = {
    id?: number;
    package_code: string;
    package_name: string;
    description?: string;
    price_platform_coins: number;
    price_real_money?: number;
    gift_items: any; // JSON格式
    category?: string;
    icon_url?: string;
    is_active?: boolean;
    is_limited?: boolean;
    total_quantity?: number;
    sold_quantity?: number;
    max_per_user?: number;
    start_time?: string;
    end_time?: string;
    sort_order?: number;
    game_server_config?: any; // JSON格式
    created_at?: string;
    updated_at?: string;
};

export type GiftPackagePurchaseRecord = {
    id?: number;
    user_id: number;
    thirdparty_uid: string;
    mch_order_id?: string;
    package_id: number;
    package_code: string;
    package_name: string;
    quantity?: number;
    unit_price: number;
    total_amount: number;
    balance_before: number;
    balance_after: number;
    gift_items: any; // JSON格式
    status?: 'pending' | 'paid' | 'delivered' | 'failed' | 'cancelled';
    game_delivery_status?: 'waiting' | 'sent' | 'success' | 'failed';
    game_delivery_data?: any; // JSON格式
    delivery_attempts?: number;
    remark?: string;
    created_at?: string;
    updated_at?: string;
    delivered_at?: string;
};

// ========== 外部礼包管理 ==========

// 获取所有可用的礼包（排除自动发放类型）
export const getAllActiveGiftPackages = async () => {
    const packages = await sql({
        query: `SELECT * FROM ExternalGiftPackages 
                WHERE is_active = 1 
                AND (start_time IS NULL OR start_time <= NOW()) 
                AND (end_time IS NULL OR end_time >= NOW()) 
                AND category NOT IN ('daily', 'cumulative')
                ORDER BY sort_order DESC, created_at DESC`,
    }) as ExternalGiftPackage[];

    // 过滤限期礼包（检查 available_weekdays）
    const currentWeekday = new Date().getDay(); // 0=周日, 1=周一, ..., 6=周六
    const weekdayMap = currentWeekday === 0 ? 7 : currentWeekday; // 转换为 1=周一, 7=周日

    return packages.filter(pkg => {
        // 如果是限期礼包，检查今天是否可用
        if (pkg.category === 'scheduled' && (pkg as any).available_weekdays) {
            const availableDays = String((pkg as any).available_weekdays).split(',').map(d => parseInt(d.trim()));
            return availableDays.includes(weekdayMap);
        }
        // 其他礼包都返回
        return true;
    });
};

// 根据分类获取礼包
export const getGiftPackagesByCategory = async (category: string) => {
    const packages = await sql({
        query: `SELECT * FROM ExternalGiftPackages 
                WHERE is_active = 1 AND category = ?
                AND (start_time IS NULL OR start_time <= NOW()) 
                AND (end_time IS NULL OR end_time >= NOW()) 
                ORDER BY sort_order DESC, created_at DESC`,
        values: [category],
    }) as ExternalGiftPackage[];

    // 如果是限期礼包，检查今天是否可用
    if (category === 'scheduled') {
        const currentWeekday = new Date().getDay(); // 0=周日, 1=周一, ..., 6=周六
        const weekdayMap = currentWeekday === 0 ? 7 : currentWeekday; // 转换为 1=周一, 7=周日

        return packages.filter(pkg => {
            if ((pkg as any).available_weekdays) {
                const availableDays = String((pkg as any).available_weekdays).split(',').map(d => parseInt(d.trim()));
                return availableDays.includes(weekdayMap);
            }
            return true;
        });
    }

    return packages;
};

// 根据ID获取单个礼包
export const getGiftPackageById = async (id: number) => {
    const result = await sql({
        query: 'SELECT * FROM ExternalGiftPackages WHERE id = ?',
        values: [id],
    }) as ExternalGiftPackage[];

    return result.length > 0 ? result[0] : null;
};

// 根据代码获取单个礼包
export const getGiftPackageByCode = async (package_code: string) => {
    const result = await sql({
        query: 'SELECT * FROM ExternalGiftPackages WHERE package_code = ?',
        values: [package_code],
    }) as ExternalGiftPackage[];

    return result.length > 0 ? result[0] : null;
};

// 检查用户是否可以购买该礼包
export const checkUserCanPurchase = async (thirdparty_uid: string, package_id: number, quantity = 1) => {
    console.log(`[限购检查] 开始检查 - 角色UUID: ${thirdparty_uid}, 礼包ID: ${package_id}, 数量: ${quantity}`);

    // 获取礼包信息
    const giftPackage = await getGiftPackageById(package_id);
    if (!giftPackage) {
        console.log(`[限购检查] 失败 - 礼包不存在`);
        return { canPurchase: false, reason: '礼包不存在' };
    }

    console.log(`[限购检查] 礼包信息 - 名称: ${giftPackage.package_name}, 分类: ${giftPackage.category}, 限购: ${giftPackage.max_per_user}`);

    // 检查礼包是否启用
    if (!giftPackage.is_active) {
        console.log(`[限购检查] 失败 - 礼包已下架`);
        return { canPurchase: false, reason: '礼包已下架' };
    }

    // 检查时间限制
    const now = new Date();
    if (giftPackage.start_time && new Date(giftPackage.start_time) > now) {
        console.log(`[限购检查] 失败 - 礼包尚未开始销售`);
        return { canPurchase: false, reason: '礼包尚未开始销售' };
    }
    if (giftPackage.end_time && new Date(giftPackage.end_time) < now) {
        console.log(`[限购检查] 失败 - 礼包销售已结束`);
        return { canPurchase: false, reason: '礼包销售已结束' };
    }

    // 检查星期限制（限期礼包）
    if (giftPackage.category === 'scheduled' && (giftPackage as any).available_weekdays) {
        const currentWeekday = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
        const weekdayMap = currentWeekday === 0 ? 7 : currentWeekday; // 转换为 1=周一, 7=周日
        const availableDays = String((giftPackage as any).available_weekdays).split(',').map(d => parseInt(d.trim()));

        console.log(`[限购检查] 限期礼包 - 当前星期: ${weekdayMap}, 可购买星期: [${availableDays.join(', ')}]`);

        if (!availableDays.includes(weekdayMap)) {
            const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
            const availableNames = availableDays.map(d => weekdayNames[d]).join('、');
            console.log(`[限购检查] 失败 - 今日不可购买此礼包`);
            return { canPurchase: false, reason: `该礼包仅在${availableNames}可购买` };
        }
        console.log(`[限购检查] 通过 - 今日可购买`);
    }

    // 检查库存限制
    if (giftPackage.is_limited && giftPackage.total_quantity && giftPackage.total_quantity > 0) {
        const remainingQuantity = giftPackage.total_quantity - (giftPackage.sold_quantity || 0);
        console.log(`[限购检查] 库存检查 - 总量: ${giftPackage.total_quantity}, 已售: ${giftPackage.sold_quantity}, 剩余: ${remainingQuantity}`);
        if (remainingQuantity < quantity) {
            console.log(`[限购检查] 失败 - 礼包库存不足`);
            return { canPurchase: false, reason: '礼包库存不足' };
        }
    }

    // 检查用户购买限制
    if (giftPackage.max_per_user && giftPackage.max_per_user > 0) {
        if (giftPackage.category === 'daily_recharge') {
            console.log(`[限购检查] 每日充值礼包 - 开始查询今日购买次数`);
            const todayCount = await getUserPackagePurchaseCount(thirdparty_uid, package_id, { todayOnly: true });
            console.log(`[限购检查] 今日已购买: ${todayCount}次, 限购: ${giftPackage.max_per_user}次, 本次购买: ${quantity}次`);
            if (todayCount + quantity > giftPackage.max_per_user) {
                console.log(`[限购检查] 失败 - 超过每日限购 (${todayCount} + ${quantity} > ${giftPackage.max_per_user})`);
                return { canPurchase: false, reason: `每日最多购买${giftPackage.max_per_user}次` };
            }
            console.log(`[限购检查] 通过 - 未超过每日限购`);
        } else {
            console.log(`[限购检查] 普通礼包 - 开始查询总购买次数`);
            const userPurchaseCount = await getUserPackagePurchaseCount(thirdparty_uid, package_id);
            console.log(`[限购检查] 总共已购买: ${userPurchaseCount}次, 限购: ${giftPackage.max_per_user}次, 本次购买: ${quantity}次`);
            if (userPurchaseCount + quantity > giftPackage.max_per_user) {
                console.log(`[限购检查] 失败 - 超过总限购 (${userPurchaseCount} + ${quantity} > ${giftPackage.max_per_user})`);
                return { canPurchase: false, reason: `每用户最多购买${giftPackage.max_per_user}个` };
            }
            console.log(`[限购检查] 通过 - 未超过总限购`);
        }
    } else {
        console.log(`[限购检查] 无限购限制`);
    }

    console.log(`[限购检查] ✅ 通过 - 允许购买`);
    return { canPurchase: true, reason: '' };
};

// 获取用户对某个礼包的购买次数
export const getUserPackagePurchaseCount = async (
    thirdparty_uid: string,
    package_id: number,
    options?: { todayOnly?: boolean }
) => {
    const where: string[] = [
        'thirdparty_uid = ?',
        'package_id = ?',
        "status IN ('paid', 'delivered')"
    ];
    const values: any[] = [thirdparty_uid, package_id];
    if (options?.todayOnly) {
        where.push('DATE(created_at) = CURDATE()');
    }

    const query = `SELECT SUM(quantity) as total FROM GiftPackagePurchaseRecords 
                WHERE ${where.join(' AND ')}`;

    console.log(`[购买次数查询] SQL: ${query}, 参数: [${values.join(', ')}]`);

    const result = await sql({
        query,
        values,
    }) as any[];

    const count = parseInt(result[0]?.total || 0);
    console.log(`[购买次数查询] 结果: ${count}次, 原始数据: ${JSON.stringify(result[0])}`);

    return count;
};

// ========== 礼包购买记录管理 ==========

// 创建购买记录
export const createPurchaseRecord = async (record: Omit<GiftPackagePurchaseRecord, 'id' | 'created_at' | 'updated_at'>) => {
    console.log(`[创建购买记录] 开始创建 - 用户ID: ${record.user_id}, 角色UUID: ${record.thirdparty_uid}, 商户订单号: ${record.mch_order_id || '无'}, 礼包ID: ${record.package_id}, 礼包名: ${record.package_name}, 数量: ${record.quantity || 1}, 状态: ${record.status || 'pending'}`);

    // 🔒 安全验证：防止负数和异常数量
    const safeQuantity = Math.max(1, Math.abs(record.quantity || 1));
    if (record.quantity !== safeQuantity) {
        console.error(`[创建购买记录] ⚠️ 检测到异常数量: ${record.quantity}，已强制修正为: ${safeQuantity}`);
    }

    // 🔒 安全验证：防止负数金额
    const safeTotalAmount = Math.abs(record.total_amount);
    const safeUnitPrice = Math.abs(record.unit_price);
    if (record.total_amount < 0 || record.unit_price < 0) {
        console.error(`[创建购买记录] ⚠️ 检测到负数金额 - 原始: ${record.total_amount}/${record.unit_price}，已修正为: ${safeTotalAmount}/${safeUnitPrice}`);
    }

    const result = await sql({
        query: `INSERT INTO GiftPackagePurchaseRecords 
                (user_id, thirdparty_uid, mch_order_id, package_id, package_code, package_name, quantity, 
                 unit_price, total_amount, balance_before, balance_after, gift_items, 
                 status, game_delivery_status, remark) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
            record.user_id,
            record.thirdparty_uid,
            record.mch_order_id || null,
            record.package_id,
            record.package_code,
            record.package_name,
            safeQuantity,  // 使用安全验证后的数量
            safeUnitPrice, // 使用安全验证后的单价
            safeTotalAmount, // 使用安全验证后的总金额
            record.balance_before,
            record.balance_after,
            JSON.stringify(record.gift_items),
            record.status || 'pending',
            record.game_delivery_status || 'waiting',
            record.remark || ''
        ],
    });

    console.log(`[创建购买记录] ✅ 创建成功 - 记录ID: ${(result as any).insertId}`);
    return result;
};

// 获取用户购买记录
export const getUserPurchaseRecords = async (thirdparty_uid: string, page = 1, pageSize = 10) => {
    const offset = (page - 1) * pageSize;

    const records = await sql({
        query: `SELECT * FROM GiftPackagePurchaseRecords 
                WHERE thirdparty_uid = ? 
                ORDER BY created_at DESC 
                LIMIT ?, ?`,
        values: [thirdparty_uid, offset, pageSize],
    }) as GiftPackagePurchaseRecord[];

    return records;
};

// 获取用户购买记录总数
export const getUserPurchaseRecordsCount = async (thirdparty_uid: string) => {
    const result = await sql({
        query: 'SELECT COUNT(*) as total FROM GiftPackagePurchaseRecords WHERE thirdparty_uid = ?',
        values: [thirdparty_uid],
    }) as any[];

    return result[0]?.total || 0;
};

// 根据用户ID获取用户购买记录总数
export const getUserPurchaseRecordsCountByUserId = async (user_id: number) => {
    const result = await sql({
        query: 'SELECT COUNT(*) as total FROM GiftPackagePurchaseRecords WHERE user_id = ?',
        values: [user_id],
    }) as any[];

    return result[0]?.total || 0;
};

// 更新购买记录状态
export const updatePurchaseRecordStatus = async (id: number, status: string, game_delivery_status?: string, remark?: string) => {
    let query = 'UPDATE GiftPackagePurchaseRecords SET status = ?';
    const values = [status];

    if (game_delivery_status) {
        query += ', game_delivery_status = ?';
        values.push(game_delivery_status);
    }

    if (remark) {
        query += ', remark = ?';
        values.push(remark);
    }

    if (status === 'delivered') {
        query += ', delivered_at = NOW()';
    }

    query += ' WHERE id = ?';
    values.push(id.toString());

    const result = await sql({
        query,
        values,
    });

    return result;
};

// 根据用户ID查询礼包购买记录（支持日期和类型过滤）
export const getPlayerGiftPackageRecords = async (
    user_id: number,
    page = 1,
    pageSize = 10,
    startDate?: string,
    endDate?: string,
    packageType?: string
) => {
    const offset = (page - 1) * pageSize;

    let whereConditions = ['gpr.user_id = ?'];
    let values: any[] = [user_id];

    // 日期过滤
    if (startDate) {
        whereConditions.push('DATE(gpr.created_at) >= ?');
        values.push(startDate);
    }

    if (endDate) {
        whereConditions.push('DATE(gpr.created_at) <= ?');
        values.push(endDate);
    }

    // 礼包类型过滤（基于礼包表的category字段）
    if (packageType && packageType !== 'all') {
        whereConditions.push('egp.category = ?');
        values.push(packageType);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
        SELECT 
            gpr.*,
            egp.category,
            egp.description as package_description,
            egp.icon_url as package_icon,
            u.username as user_name,
            u.channel_code,
            u.game_code,
            -- 从remark中提取服务器信息
            CASE 
                WHEN gpr.remark LIKE '%服务器%' THEN
                    SUBSTRING_INDEX(SUBSTRING_INDEX(gpr.remark, '服务器', -1), ' ', 1)
                ELSE ''
            END as server_info,
            -- 礼包类型直接使用category字段
            egp.category as gift_type
        FROM GiftPackagePurchaseRecords gpr
        LEFT JOIN ExternalGiftPackages egp ON gpr.package_id = egp.id
        LEFT JOIN Users u ON gpr.user_id = u.id
        ${whereClause}
        ORDER BY gpr.created_at DESC 
        LIMIT ?, ?
    `;

    values.push(offset, pageSize);

    const records = await sql({
        query,
        values,
    }) as any[];

    return records;
};

// 获取玩家礼包购买记录总数（支持日期和类型过滤）
export const getPlayerGiftPackageRecordsCount = async (
    user_id: number,
    startDate?: string,
    endDate?: string,
    packageType?: string
) => {
    let whereConditions = ['gpr.user_id = ?'];
    let values: any[] = [user_id];

    // 日期过滤
    if (startDate) {
        whereConditions.push('DATE(gpr.created_at) >= ?');
        values.push(startDate);
    }

    if (endDate) {
        whereConditions.push('DATE(gpr.created_at) <= ?');
        values.push(endDate);
    }

    // 礼包类型过滤（基于礼包表的category字段）
    if (packageType && packageType !== 'all') {
        whereConditions.push('egp.category = ?');
        values.push(packageType);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
        SELECT COUNT(*) as total 
        FROM GiftPackagePurchaseRecords gpr
        LEFT JOIN ExternalGiftPackages egp ON gpr.package_id = egp.id
        ${whereClause}
    `;

    const result = await sql({
        query,
        values,
    }) as any[];

    return result[0]?.total || 0;
};

// 更新礼包销售数量
export const updatePackageSoldQuantity = async (package_id: number, quantity: number) => {
    const result = await sql({
        query: 'UPDATE ExternalGiftPackages SET sold_quantity = sold_quantity + ? WHERE id = ?',
        values: [quantity, package_id],
    });

    return result;
};

// ========== 游戏内发放功能 ==========

// 发放礼包到游戏内
export const deliverPackageToGame = async (purchaseRecordId: number, server_id: string, role_id: string) => {
    console.log(`[deliverPackageToGame] 开始发放礼包, 购买记录ID: ${purchaseRecordId}, 服务器ID: ${server_id}, 角色ID: ${role_id}`);

    try {
        // 获取购买记录
        console.log(`[deliverPackageToGame] 查询购买记录...`);
        const purchaseRecord = await sql({
            query: 'SELECT * FROM GiftPackagePurchaseRecords WHERE id = ?',
            values: [purchaseRecordId],
        }) as GiftPackagePurchaseRecord[];

        if (purchaseRecord.length === 0) {
            console.error(`[deliverPackageToGame] 购买记录不存在, ID: ${purchaseRecordId}`);
            return { success: false, message: '购买记录不存在' };
        }

        const record = purchaseRecord[0];
        console.log(`[deliverPackageToGame] 获取到购买记录:`, JSON.stringify(record, null, 2));

        // 获取礼包配置
        console.log(`[deliverPackageToGame] 查询礼包配置, 礼包ID: ${record.package_id}`);
        const giftPackage = await getGiftPackageById(record.package_id);
        if (!giftPackage || !giftPackage.gift_items) {
            console.error(`[deliverPackageToGame] 礼包配置不存在或未配置游戏服务器, 礼包ID: ${record.package_id}`);
            return { success: false, message: '礼包配置不存在或未配置游戏服务器' };
        }

        console.log(`[deliverPackageToGame] 获取到礼包配置:`, JSON.stringify(giftPackage, null, 2));


        // 组装邮件数据
        const mailPayload = {
            serverId: server_id,
            userId: role_id,
            items: giftPackage.gift_items,
            title: giftPackage.package_name,
            content: `您购买的${giftPackage.package_name}已到账，请查收！`
        };

        console.log('[deliverPackageToGame] 发放邮件数据:', JSON.stringify(mailPayload, null, 2));

        // 更新发放状态为正在发送
        console.log(`[deliverPackageToGame] 更新状态为正在发送...`);
        await updatePurchaseRecordStatus(purchaseRecordId, 'paid', 'sent', '正在发放到游戏内');

        console.log(`[deliverPackageToGame] 解析服务器地址...`);
        let targetGameServerUrl = '';
        try {
            const worldId = Number(server_id);
            if (!isNaN(worldId) && worldId > 0) {
                const serverCfg = await getByWorldId(worldId);
                if (serverCfg && serverCfg.webhost) {
                    const base = serverCfg.webhost.replace(/\/$/, '');
                    targetGameServerUrl = `${base}/send_mail`;
                }
            }
        } catch { }
        if (!targetGameServerUrl) {
            const systemConfig = await getSystemConfig();
            targetGameServerUrl = systemConfig.gift_url || 'http://160.202.240.19:8888/send_mail';
        }

        console.log(`[deliverPackageToGame] 目标游戏服务器URL: ${targetGameServerUrl}`);

        // 向游戏服务器发送请求
        console.log(`[deliverPackageToGame] 发送请求到游戏服务器...`);
        console.log(`[deliverPackageToGame] send_mail接口参数:`, {
            url: targetGameServerUrl,
            serverId: server_id,
            userId: role_id,
            items: mailPayload.items,
            title: mailPayload.title
        });
        const response = await fetch(targetGameServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mailPayload)
        });

        console.log(`[deliverPackageToGame] 游戏服务器响应状态: ${response.status}`);

        const respData = await response.json();
        console.log('[deliverPackageToGame] 游戏服务器返回:', JSON.stringify(respData, null, 2));

        // 增加发放尝试次数
        console.log(`[deliverPackageToGame] 更新发放尝试次数和响应数据...`);
        await sql({
            query: 'UPDATE GiftPackagePurchaseRecords SET delivery_attempts = delivery_attempts + 1, game_delivery_data = ? WHERE id = ?',
            values: [JSON.stringify(respData), purchaseRecordId],
        });

        if (respData && respData.code == 0) {
            // 发放成功
            console.log(`[deliverPackageToGame] 发放成功! 购买记录ID: ${purchaseRecordId}`);

            // 从 game_delivery_data 中提取 success_list 里的 "u" 值，更新 thirdparty_uid
            try {
                if (respData.result && respData.result.success_list && respData.result.success_list.length > 0) {
                    const successItem = respData.result.success_list[0]; // 取第一个成功项
                    if (successItem.u) {
                        console.log(`[deliverPackageToGame] 提取到用户ID: ${successItem.u}, 更新thirdparty_uid字段`);

                        // 同时更新状态和 thirdparty_uid
                        await sql({
                            query: 'UPDATE GiftPackagePurchaseRecords SET status = ?, game_delivery_status = ?, remark = ?, thirdparty_uid = ?, delivered_at = NOW() WHERE id = ?',
                            values: ['delivered', 'success', '发放成功', successItem.u, purchaseRecordId],
                        });

                        console.log(`[deliverPackageToGame] thirdparty_uid 已更新为: ${successItem.u}`);
                    } else {
                        // 没有找到 u 值，只更新状态
                        await updatePurchaseRecordStatus(purchaseRecordId, 'delivered', 'success', '发放成功');
                        console.log(`[deliverPackageToGame] 未找到用户ID，仅更新状态`);
                    }
                } else {
                    // success_list 为空或不存在，只更新状态
                    await updatePurchaseRecordStatus(purchaseRecordId, 'delivered', 'success', '发放成功');
                    console.log(`[deliverPackageToGame] success_list为空，仅更新状态`);
                }
            } catch (extractError) {
                console.error(`[deliverPackageToGame] 提取用户ID失败:`, extractError);
                // 提取失败时仍然更新状态为成功
                await updatePurchaseRecordStatus(purchaseRecordId, 'delivered', 'success', '发放成功');
            }

            return { success: true, message: '礼包发放成功' };
        } else {
            // 发放失败
            console.error(`[deliverPackageToGame] 发放失败! 购买记录ID: ${purchaseRecordId}, 错误: ${respData?.msg || '未知错误'}`);
            await updatePurchaseRecordStatus(purchaseRecordId, 'paid', 'failed', respData?.msg || '发放失败');
            return { success: false, message: respData?.msg || '礼包发放失败' };
        }
    } catch (error) {
        console.error(`[deliverPackageToGame] 发放礼包异常, 购买记录ID: ${purchaseRecordId}:`, error);

        // 更新状态为失败
        await updatePurchaseRecordStatus(purchaseRecordId, 'paid', 'failed', '发放异常: ' + (error as Error).message);

        return { success: false, message: '发放异常: ' + (error as Error).message };
    }
};

// 基于 IDIP 的礼包发放方法（参照 auto-gift-delivery.js）
export const deliverPackageToGameViaIDIP = async (purchaseRecordId: number, serverId: string, roleId: string) => {
    console.log(`[deliverPackageToGameViaIDIP] 开始发放礼包, 购买记录ID: ${purchaseRecordId}, 服务器ID: ${serverId}, 角色ID: ${roleId}`);

    try {
        // 获取购买记录
        const purchaseRecord = await sql({
            query: 'SELECT * FROM GiftPackagePurchaseRecords WHERE id = ?',
            values: [purchaseRecordId],
        }) as any[];

        if (purchaseRecord.length === 0) {
            console.error(`[deliverPackageToGameViaIDIP] 购买记录不存在, ID: ${purchaseRecordId}`);
            return { success: false, message: '购买记录不存在' };
        }

        const record = purchaseRecord[0];
        console.log(`[deliverPackageToGameViaIDIP] 获取到购买记录:`, JSON.stringify(record, null, 2));

        // 获取礼包配置
        const giftPackage = await getGiftPackageById(record.package_id);
        if (!giftPackage || !giftPackage.gift_items) {
            console.error(`[deliverPackageToGameViaIDIP] 礼包配置不存在, 礼包ID: ${record.package_id}`);
            return { success: false, message: '礼包配置不存在' };
        }

        console.log(`[deliverPackageToGameViaIDIP] 获取到礼包配置:`, JSON.stringify(giftPackage, null, 2));

        // 解析礼包物品
        let giftItems;
        try {
            if (typeof giftPackage.gift_items === 'string') {
                giftItems = JSON.parse(giftPackage.gift_items);
            } else {
                giftItems = giftPackage.gift_items;
            }
        } catch (error) {
            console.error(`[deliverPackageToGameViaIDIP] 解析礼包物品失败:`, error);
            giftItems = [];
        }

        // 规范化物资列表（兼容多种字段命名，包括 i/a 形式）
        const toNumber = (v: any) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        };
        const sendItemList = Array.isArray(giftItems) ? giftItems.map((it: any) => {
            const id = toNumber(it?.ItemId ?? it?.itemId ?? it?.id ?? it?.ItemID ?? it?.item_id ?? it?.i);
            const num = toNumber(it?.ItemNum ?? it?.itemNum ?? it?.num ?? it?.quantity ?? it?.count ?? it?.a);
            return { ItemId: id, ItemNum: num };
        }).filter(x => Number.isFinite(x.ItemId) && x.ItemId > 0 && Number.isFinite(x.ItemNum) && x.ItemNum > 0) : [];

        if (sendItemList.length === 0) {
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | 发放失败: 物资列表为空或无效") WHERE id = ?',
                values: ['failed', purchaseRecordId],
            });
            return { success: false, message: '物资列表为空或无效' };
        }

        // 更新状态为正在发送
        await sql({
            query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, delivery_attempts = delivery_attempts + 1 WHERE id = ?',
            values: ['sent', purchaseRecordId],
        });

        // RoleId 使用 thirdparty_uid（即角色UUID）
        const actualRoleId = record.thirdparty_uid || roleId || '';

        // 通过角色UUID获取对应的子账号ID（OpenId）和服务器ID
        const gcRows = await sql({
            query: 'SELECT subuser_id, server_id FROM gamecharacters WHERE uuid = ? LIMIT 1',
            values: [actualRoleId],
        }) as any[];

        console.log(`[deliverPackageToGameViaIDIP] 查询角色信息结果:`, gcRows);

        if (!gcRows || gcRows.length === 0) {
            const errorMsg = `未找到角色信息: uuid=${actualRoleId}`;
            console.error(`[deliverPackageToGameViaIDIP] ${errorMsg}`);
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | ", ?) WHERE id = ?',
                values: ['failed', errorMsg, purchaseRecordId],
            });
            return { success: false, message: errorMsg };
        }

        const characterInfo = gcRows[0];
        const subUserId = characterInfo.subuser_id || record.user_id;
        const actualServerId = characterInfo.server_id || serverId;
        console.log(`[deliverPackageToGameViaIDIP] 角色UUID=${actualRoleId}, 子账号ID=${subUserId}, 服务器ID=${actualServerId}`);

        // 从 GameServers 读取区服配置（使用从角色表获取的 server_id）
        const worldId = Number(actualServerId);
        const serverCfg = await getByWorldId(worldId);
        if (!serverCfg || !serverCfg.webhost) {
            const errorMsg = `未找到服务器配置: world_id=${actualServerId}`;
            console.error(`[deliverPackageToGameViaIDIP] ${errorMsg}`);
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | ", ?) WHERE id = ?',
                values: ['failed', errorMsg, purchaseRecordId],
            });
            return { success: false, message: errorMsg };
        }

        console.log(`[deliverPackageToGameViaIDIP] 找到服务器配置: name=${serverCfg.name}, webhost=${serverCfg.webhost}`);

        // 构造 IDIP 基础地址（直连 /script）
        const rawBase = String(serverCfg.webhost || '').replace(/\/+$/, '');
        const baseURL = rawBase.includes('/script') ? rawBase : `${rawBase}/script`;
        const idipUrl = `${baseURL}/idip/4283`;

        // OpenId 使用 subuser_id
        const playerInfo = { openid: String(subUserId), platform: 1 };

        // 计算平台 ID
        let platId = 1; // 1=Android, 2=iOS
        const pf: any = playerInfo.platform;
        if (typeof pf === 'string') {
            platId = pf.toLowerCase() === 'ios' ? 2 : 1;
        } else {
            platId = Number(pf) === 2 ? 2 : 1;
        }

        // 生成幂等序列号
        const serial = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 构造 IDIP 请求体
        const idipPayload = {
            head: {
                Cmdid: 4283,
                Seqid: '1',
                TimeStamp: Math.floor(Date.now() / 1000)
            },
            body: {
                PlatId: platId,
                OpenId: String(playerInfo.openid),
                Partition: String(actualServerId), // 使用从角色表获取的 server_id
                RoleId: actualRoleId, // 使用购买记录中的 thirdparty_uid（角色UUID）
                Serial: serial,
                MailTitle: encodeURIComponent(giftPackage.package_name || '系统发放'),
                MailContent: encodeURIComponent(`您购买的${giftPackage.package_name}已到账，请查收！`),
                SendItemList: sendItemList
            }
        };

        console.log(`[deliverPackageToGameViaIDIP] IDIP URL: ${idipUrl}`);
        console.log(`[deliverPackageToGameViaIDIP] IDIP请求Body:`, JSON.stringify(idipPayload.body, null, 2));

        // 发送请求到区服 IDIP
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let respText = '';
        try {
            const response = await fetch(idipUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(idipPayload),
                signal: controller.signal
            });
            console.log(`[deliverPackageToGameViaIDIP] HTTP状态: ${response.status} ${response.statusText}`);
            respText = await response.text();
            clearTimeout(timeout);
            console.log(`[deliverPackageToGameViaIDIP] 响应内容: ${respText}`);
        } catch (err: any) {
            clearTimeout(timeout);
            const errorMsg = err?.message || String(err);
            const isTimeout = err?.name === 'AbortError' || errorMsg.includes('timeout') || errorMsg.includes('超时');
            const logMessage = isTimeout ? `请求超时: ${errorMsg}` : `请求失败: ${errorMsg}`;

            console.error(`[deliverPackageToGameViaIDIP] ${logMessage}`);

            if (isTimeout) {
                // 超时视为“待确认”，避免误判失败
                await sql({
                    query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | ", ?) WHERE id = ?',
                    values: ['sent', logMessage, purchaseRecordId],
                });
                return { success: false, message: logMessage, timeout: true };
            }

            // 更新礼包购买记录
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | ", ?) WHERE id = ?',
                values: ['failed', logMessage, purchaseRecordId],
            });


            return { success: false, message: logMessage, timeout: false };
        }

        let respData;
        try {
            respData = JSON.parse(respText);
        } catch {
            respData = { raw: respText };
        }

        // 更新游戏响应数据
        await sql({
            query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_data = ? WHERE id = ?',
            values: [JSON.stringify(respData), purchaseRecordId],
        });

        const resultCode = respData?.body?.Result;
        if (resultCode === 0) {
            // 发放成功
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET status = ?, game_delivery_status = ?, delivered_at = NOW() WHERE id = ?',
                values: ['delivered', 'success', purchaseRecordId],
            });
            console.log(`[deliverPackageToGameViaIDIP] 礼包发放成功: 记录ID=${purchaseRecordId}`);
            return { success: true, message: '发放成功' };
        } else {
            const errMsg = respData?.body?.RetMsg || 'IDIP发放失败';
            await sql({
                query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | 发放失败: ", ?) WHERE id = ?',
                values: ['failed', errMsg, purchaseRecordId],
            });
            console.error(`[deliverPackageToGameViaIDIP] 礼包发放失败: 记录ID=${purchaseRecordId}, 错误: ${errMsg}`);
            return { success: false, message: errMsg };
        }
    } catch (error: any) {
        console.error(`[deliverPackageToGameViaIDIP] 发放礼包异常:`, error);

        // 更新状态为失败
        await sql({
            query: 'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, remark = CONCAT(remark, " | 发放异常: ", ?) WHERE id = ?',
            values: ['failed', error.message, purchaseRecordId],
        });

        return { success: false, message: error.message };
    }
};

// 批量重试失败的发放
export const retryFailedDeliveries = async () => {
    try {
        // 获取所有发放失败的记录
        const failedRecords = await sql({
            query: `SELECT id FROM GiftPackagePurchaseRecords 
                   WHERE status = 'paid' AND game_delivery_status = 'failed' 
                   AND delivery_attempts < 3`,
        }) as any[];

        let successCount = 0;
        let failCount = 0;

        for (const record of failedRecords) {
            // 这里需要获取用户的游戏角色信息，暂时使用占位符
            const result = await deliverPackageToGame(record.id, '1', 'user_role_id');
            if (result.success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        return {
            success: true,
            message: `重试完成: 成功 ${successCount} 个，失败 ${failCount} 个`,
            data: { successCount, failCount, total: failedRecords.length }
        };
    } catch (error) {
        console.error('批量重试发放失败:', error);
        return { success: false, message: '批量重试失败' };
    }
}; 