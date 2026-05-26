/**
 * 自动礼包发放脚本
 * 根据用户当日充值和累计充值自动发放礼包
 * 
 * 计算规则（消费累计，包含平台币和第三方支付礼包）：
 * 1. 平台币消费：PaymentRecords.payment_way 包含"平台币"，直接累加金额
 * 2. 微信/支付宝购买礼包：PaymentRecords.payment_way 包含"微信"或"支付宝"且 server_url 以 'gift://' 开头，金额 × 10 转换为平台币等价值
 * 3. 使用 gamecharacters.uuid 进行角色关联与区服归属（按 gc.server_id 分区）
 * 4. payment_status IN (3, 4) 视为成功消费（3=已完成，4=已通知游戏服）
 */

import mysql from 'mysql2/promise';
import { createHmac } from 'crypto';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';
import { AUTO_GIFT_CONFIG, validateGiftRule, validateUser } from './auto-gift-config.js';

// ── REST 签名工具（与 gameServerClient.ts 保持一致）────────────────────────
const API_SIGN_KEY = process.env.API_SIGN_KEY || '';
const GM_TIMEOUT_MS = parseInt(process.env.GM_TIMEOUT_MS || '10000', 10);

function genNonce() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 12)}`;
}
function hmacSign(timestamp, nonce, body, signKey) {
    const payload = `${timestamp}\n${nonce}\n${body}`;
    return createHmac('sha256', signKey).update(payload).digest('hex');
}
function genSerial() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 统一金额显示（避免控制台不支持“¥”导致乱码）
function formatMoney(n) {
    const num = Number(n);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

/**
 * 标准化日期格式
 * 将 2025-7-20 转换为 2025-07-20
 */
function normalizeDate(dateStr) {
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return dateStr;
    } catch (error) {
        logWarn(`日期格式化失败，使用原始格式: ${dateStr}`);
        return dateStr;
    }
}

// 更新发放状态并去重追加备注
async function updateDeliveryRemark(connection, recordId, status, message) {
    const msg = String(message || '').trim();
    if (!msg) {
        await connection.execute(
            'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ? WHERE id = ?',
            [status, recordId]
        );
        return;
    }
    await connection.execute(
        `UPDATE GiftPackagePurchaseRecords
         SET game_delivery_status = ?,
             remark = CASE
                 WHEN remark IS NULL OR remark = '' THEN ?
                 WHEN remark LIKE ? THEN remark
                 ELSE CONCAT(remark, ' | ', ?)
             END
         WHERE id = ?`,
        [status, msg, `%${msg}%`, msg, recordId]
    );
}



/**
 * 创建数据库连接
 */
async function createDbConnection() {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        logInfo('数据库连接创建成功');
        return connection;
    } catch (error) {
        logError(`数据库连接失败: ${error.message}`);
        throw error;
    }
}

/**
 * 获取用户当日充值总额（按服务器分区）
 * 统计规则：
 * 1. 平台币购买：直接累加金额
 * 2. 微信/支付宝购买礼包：金额 × 10 转换为平台币等价值
 */
async function getUserDailyConsumeByServer(connection, subUserId, targetDate, serverId) {
try {
        // 1. 统计平台币消费
        const platformCoinQuery = `
            SELECT COALESCE(SUM(pr.amount), 0) as daily_amount
            FROM PaymentRecords pr
            WHERE pr.wuid IN (
                SELECT DISTINCT uuid FROM gamecharacters 
                WHERE subuser_id = ? AND server_id = ?
            )
            AND DATE(pr.created_at) = ?
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%平台币%')
        `;
        
        const [platformRows] = await connection.execute(platformCoinQuery, [subUserId, serverId, targetDate]);
        const platformAmount = parseFloat(platformRows[0]?.daily_amount || 0);
        
        // 2. 统计微信/支付宝购买礼包的金额（×10转换为平台币）
        const thirdPartyGiftQuery = `
            SELECT COALESCE(SUM(pr.amount), 0) as gift_amount
            FROM PaymentRecords pr
            WHERE pr.role_id IN (
                SELECT DISTINCT uuid FROM gamecharacters 
                WHERE subuser_id = ? AND server_id = ?
            )
            AND DATE(pr.created_at) = ?
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%微信%' OR pr.payment_way LIKE '%支付宝%' OR pr.payment_way LIKE '%wechat%' OR pr.payment_way LIKE '%alipay%')
            AND (pr.server_url LIKE 'gift://%')
        `;
        
        const [giftRows] = await connection.execute(thirdPartyGiftQuery, [subUserId, serverId, targetDate]);
        const giftAmount = parseFloat(giftRows[0]?.gift_amount || 0) * 10; // 礼包金额×10
        
        const totalAmount = platformAmount + giftAmount;
        
        if (giftAmount > 0) {
            logInfo(`📊 [当日消费] 子账号=${subUserId}, 服务器=${serverId}, 平台币=${formatMoney(platformAmount)}, 礼包(×10)=${formatMoney(giftAmount)}, 总计=${formatMoney(totalAmount)}`);
        }
        
        return totalAmount;
    } catch (error) {
        logError(`获取用户当日消费失败: ${error.message}`);
        return 0;
    }
}

/**
 * 获取用户累计充值总额（按服务器分区）
 * 统计规则：
 * 1. 平台币购买：直接累加金额
 * 2. 微信/支付宝购买礼包：金额 × 10 转换为平台币等价值
 */
async function getUserTotalConsumeByServer(connection, subUserId, serverId) {
    try {
        // 1. 统计平台币消费
        const platformCoinQuery = `
            SELECT COALESCE(SUM(pr.amount), 0) as total_amount
            FROM PaymentRecords pr
            WHERE pr.wuid IN (
                SELECT DISTINCT uuid FROM gamecharacters 
                WHERE subuser_id = ? AND server_id = ?
            )
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%平台币%')
        `;
        
        const [platformRows] = await connection.execute(platformCoinQuery, [subUserId, serverId]);
        const platformAmount = parseFloat(platformRows[0]?.total_amount || 0);
        
        // 2. 统计微信/支付宝购买礼包的金额（×10转换为平台币）
        const thirdPartyGiftQuery = `
            SELECT COALESCE(SUM(pr.amount), 0) as gift_amount
            FROM PaymentRecords pr
            WHERE pr.role_id IN (
                SELECT DISTINCT uuid FROM gamecharacters 
                WHERE subuser_id = ? AND server_id = ?
            )
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%微信%' OR pr.payment_way LIKE '%支付宝%' OR pr.payment_way LIKE '%wechat%' OR pr.payment_way LIKE '%alipay%')
            AND (pr.server_url LIKE 'gift://%')
        `;
        
        const [giftRows] = await connection.execute(thirdPartyGiftQuery, [subUserId, serverId]);
        const giftAmount = parseFloat(giftRows[0]?.gift_amount || 0) * 10; // 礼包金额×10
        
        const totalAmount = platformAmount + giftAmount;
        
        if (giftAmount > 0) {
            logInfo(`📊 [累计消费] 子账号=${subUserId}, 服务器=${serverId}, 平台币=${formatMoney(platformAmount)}, 礼包(×10)=${formatMoney(giftAmount)}, 总计=${formatMoney(totalAmount)}`);
        }
        
        return totalAmount;
    } catch (error) {
        logError(`获取用户累计消费失败: ${error.message}`);
        return 0;
    }
}

/**
 * 获取用户在哪些服务器有充值记录
 * 包括：平台币消费 + 微信/支付宝购买礼包
 */
async function getUserServerList(connection, subUserId, targetDate) {
    try {
        // 1. 获取平台币消费的服务器列表
        const platformQuery = `
            SELECT DISTINCT gc.server_id as server_id
            FROM gamecharacters gc
            WHERE gc.subuser_id = ? 
            AND gc.server_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM PaymentRecords pr
                WHERE pr.wuid = gc.uuid
                AND DATE(pr.created_at) = ?
                AND pr.payment_status IN (3, 4)
                AND (pr.payment_way LIKE '%平台币%')
            )
        `;
        
        // 2. 获取微信/支付宝购买礼包的服务器列表
        const giftQuery = `
            SELECT DISTINCT gc.server_id as server_id
            FROM gamecharacters gc
            WHERE gc.subuser_id = ? 
            AND gc.server_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM PaymentRecords pr
                WHERE pr.role_id = gc.uuid
                AND DATE(pr.created_at) = ?
                AND pr.payment_status IN (3, 4)
                AND (pr.payment_way LIKE '%微信%' OR pr.payment_way LIKE '%支付宝%' OR pr.payment_way LIKE '%wechat%' OR pr.payment_way LIKE '%alipay%')
                AND (pr.server_url LIKE 'gift://%')
            )
        `;
        
        const [platformRows] = await connection.execute(platformQuery, [subUserId, targetDate]);
        const [giftRows] = await connection.execute(giftQuery, [subUserId, targetDate]);
        
        // 合并并去重服务器ID
        const serverSet = new Set();
        platformRows.forEach(row => serverSet.add(row.server_id));
        giftRows.forEach(row => serverSet.add(row.server_id));
        
        const serverList = Array.from(serverSet).sort((a, b) => a - b);
        
        if (giftRows.length > 0) {
            logInfo(`📊 [服务器列表] 子账号=${subUserId}, 平台币服务器=${platformRows.length}个, 礼包服务器=${giftRows.length}个, 合并后=${serverList.length}个`);
        }
        
        return serverList;
    } catch (error) {
        logError(`获取用户服务器列表失败: ${error.message}`);
        return [];
    }
}

/**
 * 获取指定分类的活跃礼包
 */
async function getActiveGiftPackagesByCategory(connection, category) {
    try {
        const query = `
            SELECT * FROM ExternalGiftPackages 
            WHERE is_active = 1 
            AND category = ?
            AND (start_time IS NULL OR start_time <= NOW()) 
            AND (end_time IS NULL OR end_time >= NOW()) 
            ORDER BY price_platform_coins ASC
        `;
        
        const [rows] = await connection.execute(query, [category]);
        return rows;
    } catch (error) {
        logError(`获取礼包列表失败: ${error.message}`);
        return [];
    }
}

/**
 * 检查用户是否已经领取过指定礼包（按服务器分区）
 * @param {*} connection 数据库连接
 * @param {*} subUserId 子账号ID
 * @param {*} packageId 礼包ID
 * @param {*} category 礼包分类 ('daily' 或 'cumulative')
 * @param {*} serverId 服务器ID
 * @param {*} targetDate 目标日期（仅对每日礼包有效）
 * @returns {Object} { received: boolean, failedRecordId: number|null } 
 */
async function hasUserReceivedPackageByServer(connection, subUserId, packageId, category, serverId, targetDate = null) {
    try {
        let query = `
            SELECT COUNT(*) as count
            FROM GiftPackagePurchaseRecords 
            WHERE user_id IN (
                SELECT parent_user_id FROM SubUsers WHERE id = ?
            )
            AND package_id = ?
            AND status = 'delivered'
            AND game_delivery_status = 'success'
            AND remark LIKE ?
        `;
        
        const values = [subUserId, packageId, `%服务器${serverId}%`];
        
        // 对于每日礼包，只检查当天是否已经领取过
        if (category === 'daily' && targetDate) {
            query += ' AND DATE(created_at) = ?';
            values.push(targetDate);
        }
        // 对于累计充值礼包，检查历史是否领取过（一次性奖励）
        
        logInfo(`🔍 [重复检查] 子账号=${subUserId}, 礼包=${packageId}, 分类=${category}, 服务器=${serverId}, 日期=${targetDate}`);
        logInfo(`🔍 [重复检查] SQL: ${query}`);
        logInfo(`🔍 [重复检查] 参数: [${values.join(', ')}]`);
        
        // 先查询主账号ID用于调试
        const [userRows] = await connection.execute('SELECT parent_user_id FROM SubUsers WHERE id = ?', [subUserId]);
        const parentUserId = userRows[0]?.parent_user_id;
        logInfo(`🔍 [重复检查] 子账号${subUserId}对应主账号: ${parentUserId}`);
        
        const [rows] = await connection.execute(query, values);
        const hasReceived = parseInt(rows[0]?.count || 0) > 0;
        
        logInfo(`🔍 [重复检查] 查询结果: count=${rows[0]?.count}, 已领取=${hasReceived}`);
        
        // 检查是否有失败的记录需要重试
        // 注意：只有在没有成功记录的情况下才检查失败记录
        // 如果既有成功又有失败，以成功为准，不再重试
        let failedRecordId = null;
        if (!hasReceived) {
            let failedQuery = `
                SELECT id FROM GiftPackagePurchaseRecords 
                WHERE user_id IN (
                    SELECT parent_user_id FROM SubUsers WHERE id = ?
                )
                AND package_id = ?
                AND status = 'paid'
                AND game_delivery_status = 'failed'
                AND remark LIKE ?
            `;
            const failedValues = [subUserId, packageId, `%服务器${serverId}%`];
            
            if (category === 'daily' && targetDate) {
                failedQuery += ' AND DATE(created_at) = ?';
                failedValues.push(targetDate);
            }
            failedQuery += ' ORDER BY created_at DESC LIMIT 1';
            
            const [failedRows] = await connection.execute(failedQuery, failedValues);
            if (failedRows.length > 0) {
                failedRecordId = failedRows[0].id;
                logWarn(`⚠️ [失败记录] 发现失败的礼包记录ID=${failedRecordId}，将重新尝试发送`);
            }
        } else {
            logInfo(`✅ [已成功] 该礼包已成功发送过，跳过任何失败记录`);
        }
        
        // 如果是每日礼包且未找到记录，显示详细的现有记录
        if (category === 'daily' && !hasReceived && !failedRecordId && targetDate) {
            logWarn(`⚠️ [每日礼包] 未找到${targetDate}的记录，检查现有记录...`);
            const [existingRows] = await connection.execute(`
                SELECT DATE(created_at) as record_date, COUNT(*) as count 
                FROM GiftPackagePurchaseRecords 
                WHERE user_id = ? AND package_id = ? AND status = 'delivered' 
                AND game_delivery_status = 'success' AND remark LIKE ? 
                GROUP BY DATE(created_at) 
                ORDER BY record_date DESC LIMIT 5
            `, [parentUserId, packageId, `%服务器${serverId}%`]);
            
            logWarn(`⚠️ [每日礼包] 现有记录日期: ${JSON.stringify(existingRows)}`);
        }
        
        return { received: hasReceived, failedRecordId };
    } catch (error) {
        logError(`检查用户领取记录失败: ${error.message}`);
        return { received: true, failedRecordId: null }; // 出错时假设已领取，避免重复发放
    }
}

/**
 * 获取用户信息
 */
async function getUserInfo(connection, subUserId) {
    try {
        const query = `
            SELECT su.*, u.thirdparty_uid, u.channel_code 
            FROM SubUsers su
            LEFT JOIN Users u ON su.parent_user_id = u.id
            WHERE su.id = ?
        `;
        
        const [rows] = await connection.execute(query, [subUserId]);
        return rows[0] || null;
    } catch (error) {
        logError(`获取用户信息失败: ${error.message}`);
        return null;
    }
}

/**
 * 创建自动发放的礼包购买记录
 */
async function createAutoGiftRecord(connection, userInfo, giftPackage, rechargeAmount, category, serverId, targetDate = null) {
    try {
        // thirdparty_uid 使用角色表 uuid（同服最近登录优先）；只查询当前子账号的角色，避免匹配到其他子账号
        let thirdpartyUid = '';
        try {
            const [gcRows] = await connection.execute(
                `SELECT uuid FROM gamecharacters 
                 WHERE subuser_id = ? AND server_id = ?
                 ORDER BY last_login_at DESC, id DESC LIMIT 1`,
                [userInfo.id, Number(serverId)]
            );
            if (Array.isArray(gcRows) && gcRows.length > 0 && gcRows[0].uuid) {
                thirdpartyUid = String(gcRows[0].uuid);
            }
        } catch {}
        if (!thirdpartyUid && userInfo.wuid) thirdpartyUid = String(userInfo.wuid);
        if (!thirdpartyUid && userInfo.thirdparty_uid) thirdpartyUid = String(userInfo.thirdparty_uid);

        const record = {
            user_id: userInfo.parent_user_id,
            thirdparty_uid: thirdpartyUid,
            package_id: giftPackage.id,
            package_code: giftPackage.package_code,
            package_name: giftPackage.package_name,
            quantity: 1,
            unit_price: 0, // 自动发放，价格为0
            total_amount: 0,
            balance_before: 0,
            balance_after: 0,
            gift_items: giftPackage.gift_items,
            status: 'paid',
            game_delivery_status: 'waiting',
            remark: `自动发放 - 服务器${serverId} - ${category === 'daily' ? '当日' : '累计'}平台币消费达到${formatMoney(rechargeAmount)}元`
        };

        // 补发模式：使用目标日期的23:59:59（修复时区问题）
        // 实时模式：使用数据库当前时间
        let createdAt = null;
        const dateObj = new Date(`${targetDate}T23:59:59+08:00`); // 明确指定东八区时间
        createdAt = dateObj.toISOString().slice(0, 19).replace('T', ' '); // 转为 MySQL datetime 格式
    
        
        logInfo(`📝 [创建记录] 补发模式=${!!targetDate}, 目标日期=${targetDate}, 创建时间=${createdAt || 'NOW()'}`);
        
        const query = `INSERT INTO GiftPackagePurchaseRecords 
            (user_id, thirdparty_uid, package_id, package_code, package_name, quantity, 
             unit_price, total_amount, balance_before, balance_after, gift_items, 
             status, game_delivery_status, remark, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ;

        const values = [
            record.user_id,
            record.thirdparty_uid,
            record.package_id,
            record.package_code,
            record.package_name,
            record.quantity,
            record.unit_price,
            record.total_amount,
            record.balance_before,
            record.balance_after,
            typeof record.gift_items === 'string' ? record.gift_items : JSON.stringify(record.gift_items),
            record.status,
            record.game_delivery_status,
            record.remark,
            createdAt
        ];
        


        const [result] = await connection.execute(query, values);
        return result.insertId;
    } catch (error) {
        logError(`创建自动礼包记录失败: ${error.message}`);
        throw error;
    }
}

/**
 * 发放礼包到游戏内
 */
async function deliverGiftToGame(connection, purchaseRecordId, userInfo, serverId = null) {
    try {
        // 这里使用用户的游戏信息进行发放
        const targetServerId = serverId || userInfo.server_id || '1'; // 使用传入的服务器ID或默认服务器
        const partitionId = String(targetServerId); // 直接使用 gamecharacters.server_id（如 10001），无需映射
        // RoleId 必须使用 gamecharacters.uuid（同服，最近登录优先）
        // 只查询当前子账号的角色，避免匹配到同一主账号下其他子账号的角色
        let roleId = '';
        let characterName = '';
        try {
            const [gcRows] = await connection.execute(
                `SELECT uuid, character_name FROM gamecharacters 
                 WHERE subuser_id = ? AND server_id = ?
                 ORDER BY last_login_at DESC, id DESC LIMIT 1`,
                [userInfo.id, Number(targetServerId)]
            );
            if (Array.isArray(gcRows) && gcRows.length > 0 && gcRows[0].uuid) {
                roleId = String(gcRows[0].uuid);
                characterName = String(gcRows[0].character_name || '');
            }
        } catch {}
        if (!roleId && userInfo.wuid) {
            roleId = String(userInfo.wuid);
        }
        // 按区服配置调用该服 IDIP(4283) 发放物资
        
        // 获取购买记录
        const [recordRows] = await connection.execute(
            'SELECT * FROM GiftPackagePurchaseRecords WHERE id = ?',
            [purchaseRecordId]
        );
        
        if (recordRows.length === 0) {
            throw new Error('购买记录不存在');
        }
        
        const record = recordRows[0];
        let giftItems;
        try {
            // 安全地解析gift_items，可能是字符串或已经是对象
            if (typeof record.gift_items === 'string') {
                giftItems = JSON.parse(record.gift_items);
            } else {
                giftItems = record.gift_items;
            }
        } catch (error) {
            logError(`解析礼包物品失败: ${error.message}, gift_items: ${record.gift_items}`);
            giftItems = [];
        }
        
        // 从 GameServers 读取区服配置（优先 server_id，其次 bname）
        const bname = `game_${partitionId}`;
        const serverIdNum = Number(partitionId);
        const [serverCfgRows] = await connection.execute(
            'SELECT name, webhost, dbip, dbuser, dbpass, bname FROM GameServers WHERE server_id = ? OR bname = ? OR name = ? LIMIT 1',
            [Number.isFinite(serverIdNum) ? serverIdNum : -1, bname, bname]
        );
        const serverCfg = serverCfgRows[0];
        if (!serverCfg) {
            const errMsg = `区服配置缺失: ${bname}`;
            await updateDeliveryRemark(connection, purchaseRecordId, 'failed', errMsg);
            return { success: false, message: `未找到区服配置: ${bname}` };
        }

        // 构造 REST 基础地址（/open_api/mail/send-with-items）
        const rawBase = String(serverCfg.webhost || '').replace(/\/+$/, '').replace(/\/script$/, '');
        const sendUrl = `${rawBase}/open_api/mail/send-with-items`;

        // 规范化物资列表 → REST camelCase 格式 { itemId, itemCount }
        const toNumber = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        };
        const items = Array.isArray(giftItems) ? giftItems.map((it) => {
            const id  = toNumber(it?.itemId  ?? it?.ItemId  ?? it?.id   ?? it?.ItemID  ?? it?.item_id ?? it?.i);
            const num = toNumber(it?.itemCount ?? it?.ItemNum ?? it?.num ?? it?.quantity ?? it?.count  ?? it?.a);
            return { itemId: id, itemCount: num };
        }).filter(x => Number.isFinite(x.itemId) && x.itemId > 0 && Number.isFinite(x.itemCount) && x.itemCount > 0) : [];

        if (items.length === 0) {
            const errMsg = '发放失败: 物资列表为空或无效';
            await updateDeliveryRemark(connection, purchaseRecordId, 'failed', errMsg);
            return { success: false, message: '物资列表为空或无效' };
        }

        // 更新状态为正在发送
        await connection.execute(
            'UPDATE GiftPackagePurchaseRecords SET game_delivery_status = ?, delivery_attempts = delivery_attempts + 1 WHERE id = ?',
            ['sent', purchaseRecordId]
        );

        // 构造 REST 请求体（与 gameServerClient.sendItemMail rest 模式一致）
        const mailContent = `系统自动发放：${record.package_name || ''}`;
        const serialNo = genSerial();
        const restPayload = {
            openId:      String(userInfo.id),   // 子账号 ID（同 CDK 兑换逻辑）
            serverId:    partitionId,
            platform:    'android',
            roleId:      roleId || '',
            serialNo,
            mailTitle:   record.package_name || '系统发放',
            mailContent,
            items,
        };

        const bodyStr = JSON.stringify(restPayload);
        logInfo(`[REST] 请求URL: ${sendUrl}`);
        logInfo(`[REST] 请求Body: ${JSON.stringify(restPayload, null, 2)}`);

        // 构造 HMAC-SHA256 签名 Header（与 gameServerClient.ts 一致）
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = genNonce();
        const headers = { 'Content-Type': 'application/json' };
        if (API_SIGN_KEY) {
            const sign = hmacSign(timestamp, nonce, bodyStr, API_SIGN_KEY);
            headers['X-Timestamp'] = timestamp;
            headers['X-Nonce']     = nonce;
            headers['X-Sign']      = sign;
            logInfo(`[REST] 签名: ts=${timestamp}, nonce=${nonce}, sign=${sign.substring(0, 16)}...`);
        }

        // 发送请求
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), GM_TIMEOUT_MS);
        let respText = '';
        try {
            const response = await fetch(sendUrl, {
                method: 'POST',
                headers,
                body: bodyStr,
                signal: controller.signal
            });
            clearTimeout(timeout);
            logInfo(`[REST] HTTP状态: ${response.status} ${response.statusText}`);
            respText = await response.text();
            logInfo(`[REST] 响应内容: ${respText}`);
        } catch (err) {
            clearTimeout(timeout);
            const errorMsg = err?.message || String(err);
            const isTimeout = err?.name === 'AbortError' || errorMsg.includes('timeout') || errorMsg.includes('超时');
            const logMessage = isTimeout ? `请求超时: ${errorMsg}` : `请求失败: ${errorMsg}`;
            logError(`[REST] ${logMessage}`);
            await updateDeliveryRemark(connection, purchaseRecordId, 'failed', logMessage);
            return { success: false, message: logMessage };
        }

        let respData;
        try {
            respData = JSON.parse(respText);
        } catch {
            respData = { raw: respText };
        }

        // 更新游戏响应数据
        await connection.execute(
            'UPDATE GiftPackagePurchaseRecords SET game_delivery_data = ? WHERE id = ?',
            [JSON.stringify(respData), purchaseRecordId]
        );

        // REST 响应：code === 0 或 200 为成功（与 gameServerClient.normalizeResponse 一致）
        const resultCode = respData?.code;
        if (resultCode === 0 || resultCode === 200) {
            await connection.execute(
                'UPDATE GiftPackagePurchaseRecords SET status = ?, game_delivery_status = ?, delivered_at = NOW() WHERE id = ?',
                ['delivered', 'success', purchaseRecordId]
            );
            logInfo(`礼包发放成功: 记录ID=${purchaseRecordId}`);
            return { success: true, message: '发放成功' };
        } else {
            const errMsg = respData?.message || respData?.msg || `REST发放失败(code=${resultCode})`;
            await updateDeliveryRemark(connection, purchaseRecordId, 'failed', `发放失败: ${errMsg}`);
            logError(`礼包发放失败: 记录ID=${purchaseRecordId}, 错误: ${errMsg}`);
            return { success: false, message: errMsg };
        }
    } catch (error) {
        logError(`发放礼包异常: ${error.message}`);
        
        // 更新状态为失败
        await updateDeliveryRemark(connection, purchaseRecordId, 'failed', `发放异常: ${error.message}`);
        
        return { success: false, message: error.message };
    }
}

/**
 * 处理单个用户的自动礼包发放（按服务器分区）
 */
async function processUserAutoGifts(connection, subUserId, targetDate) {
    try {
        if (AUTO_GIFT_CONFIG.logging.verbose) {
            logInfo(`处理用户自动礼包: 子账号ID=${subUserId}, 日期=${targetDate}`);
        }
        
        // 获取用户信息
        const userInfo = await getUserInfo(connection, subUserId);
        if (!userInfo) {
            logWarn(`用户信息不存在: 子账号ID=${subUserId}`);
            return { processed: 0, delivered: 0 };
        }
        
        // 验证用户是否符合条件
        const userValidation = validateUser(userInfo);
        if (!userValidation.valid) {
            if (AUTO_GIFT_CONFIG.logging.verbose) {
                logInfo(`用户 ${subUserId} 不符合条件: ${userValidation.reason}`);
            }
            return { processed: 0, delivered: 0 };
        }
        
        // 获取用户当日在哪些服务器有“平台币消费”记录
        const serverList = await getUserServerList(connection, subUserId, targetDate);
        if (serverList.length === 0) {
            if (AUTO_GIFT_CONFIG.logging.verbose) {
                logInfo(`用户 ${subUserId} 今日无充值记录`);
            }
            return { processed: 0, delivered: 0 };
        }
        
        let totalProcessed = 0;
        let totalDelivered = 0;
        
        // 按服务器分区处理
        for (const serverId of serverList) {
            if (AUTO_GIFT_CONFIG.logging.verbose) {
                logInfo(`处理服务器 ${serverId} 的充值记录`);
            }
            
            // 获取该服务器的当日/累计平台币消费
            const [dailyAmount, totalAmount] = await Promise.all([
                getUserDailyConsumeByServer(connection, subUserId, targetDate, serverId),
                getUserTotalConsumeByServer(connection, subUserId, serverId)
            ]);
            
        logInfo(`用户 ${subUserId} 服务器 ${serverId} 平台币消费: 当日=${formatMoney(dailyAmount)} 元, 累计=${formatMoney(totalAmount)} 元`);
            
            let processed = 0;
            let delivered = 0;
            
            // 处理当日“消费”礼包（平台币消费）
            if (dailyAmount >= AUTO_GIFT_CONFIG.categories.daily.minAmount) {
                const dailyPackages = await getActiveGiftPackagesByCategory(connection, 'daily');
                
                for (const giftPackage of dailyPackages) {
                    // 验证礼包发放规则
                    const ruleValidation = validateGiftRule(dailyAmount, giftPackage, 'daily');
                    logInfo(`礼包验证: ${giftPackage.package_name} - 当日消费:${formatMoney(dailyAmount)} 平台币 vs 礼包要求:${formatMoney(giftPackage.price_platform_coins)} 平台币 - 结果:${ruleValidation.valid} - 原因:${ruleValidation.reason}`);
                    if (!ruleValidation.valid) {
                        continue;
                    }
                    
                    // 检查当天是否已经领取过该礼包（按服务器检查）
                    const receiveCheck = await hasUserReceivedPackageByServer(connection, subUserId, giftPackage.id, 'daily', serverId, targetDate);
                    
                    logInfo(`📦 [每日礼包] ${giftPackage.package_name}: 用户=${subUserId}, 服务器=${serverId}, 已领取=${receiveCheck.received}, 失败记录ID=${receiveCheck.failedRecordId}`);
                    
                    if (!receiveCheck.received) {
                        try {
                            let recordId;
                            
                            // 如果有失败的记录，重新发送；否则创建新记录
                            if (receiveCheck.failedRecordId) {
                                logInfo(`🔄 [重试发送] 重新发送失败的礼包记录ID=${receiveCheck.failedRecordId}`);
                                recordId = receiveCheck.failedRecordId;
                            } else {
                                logInfo(`发放当日消费礼包: ${giftPackage.package_name} (${formatMoney(giftPackage.price_platform_coins)} 平台币) 给用户 ${subUserId} 服务器 ${serverId}`);
                                
                                // 创建购买记录
                                recordId = await createAutoGiftRecord(
                                    connection, 
                                    userInfo, 
                                    giftPackage, 
                                    dailyAmount, 
                                    'daily',
                                    serverId,
                                    targetDate  // 传入目标日期用于补发
                                );
                            }
                            
                            processed++;
                            
                            // 发放到游戏内
                            const deliveryResult = await deliverGiftToGame(connection, recordId, userInfo, serverId);
                            if (deliveryResult.success) {
                                delivered++;
                            }
                            
                        } catch (error) {
                            logError(`发放当日充值礼包失败: ${error.message}`);
                        }
                    }
                }
            }
            
            // 处理“累计消费”礼包（平台币消费累计）
            if (totalAmount >= AUTO_GIFT_CONFIG.categories.cumulative.minAmount) {
                const cumulativePackages = await getActiveGiftPackagesByCategory(connection, 'cumulative');
                
                for (const giftPackage of cumulativePackages) {
                    // 验证礼包发放规则
                    const ruleValidation = validateGiftRule(totalAmount, giftPackage, 'cumulative');
                    if (!ruleValidation.valid) {
                        continue;
                    }
                    
                    // 检查历史是否已经领取过该礼包（累计充值礼包按服务器一次性）
                    const receiveCheck = await hasUserReceivedPackageByServer(connection, subUserId, giftPackage.id, 'cumulative', serverId);
                    
                    logInfo(`📦 [累计礼包] ${giftPackage.package_name}: 用户=${subUserId}, 服务器=${serverId}, 已领取=${receiveCheck.received}, 失败记录ID=${receiveCheck.failedRecordId}`);
                    
                    if (!receiveCheck.received) {
                        try {
                            let recordId;
                            
                            // 如果有失败的记录，重新发送；否则创建新记录
                            if (receiveCheck.failedRecordId) {
                                logInfo(`🔄 [重试发送] 重新发送失败的礼包记录ID=${receiveCheck.failedRecordId}`);
                                recordId = receiveCheck.failedRecordId;
                            } else {
                                logInfo(`发放累计消费礼包: ${giftPackage.package_name} (${formatMoney(giftPackage.price_platform_coins)} 平台币) 给用户 ${subUserId} 服务器 ${serverId}`);
                                
                                // 创建购买记录
                                recordId = await createAutoGiftRecord(
                                    connection, 
                                    userInfo, 
                                    giftPackage, 
                                    totalAmount, 
                                    'cumulative',
                                    serverId,
                                    targetDate  // 传入目标日期用于补发
                                );
                            }
                            
                            processed++;
                            
                            // 发放到游戏内
                            const deliveryResult = await deliverGiftToGame(connection, recordId, userInfo, serverId);
                            if (deliveryResult.success) {
                                delivered++;
                            }
                            
                        } catch (error) {
                            logError(`发放累计充值礼包失败: ${error.message}`);
                        }
                    }
                }
            }
            
            totalProcessed += processed;
            totalDelivered += delivered;
            
            if (processed > 0) {
                logInfo(`服务器 ${serverId} 处理完成: 创建 ${processed} 个礼包记录，成功发放 ${delivered} 个`);
            }
        }
        
        return { processed: totalProcessed, delivered: totalDelivered };
        
    } catch (error) {
        logError(`处理用户自动礼包失败: ${error.message}`);
        return { processed: 0, delivered: 0 };
    }
}

/**
 * 获取需要处理的用户列表
 * 包括：当日有平台币消费 + 微信/支付宝购买礼包的子账号
 */
async function getUsersWithRecharge(connection, targetDate) {
    try {
        // 1. 获取当日有平台币消费的子账号
        const platformQuery = `
            SELECT DISTINCT COALESCE(pr.sub_user_id, gc.subuser_id) AS sub_user_id
            FROM PaymentRecords pr
            LEFT JOIN gamecharacters gc ON gc.uuid = pr.wuid
            WHERE DATE(pr.created_at) = ?
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%平台币%')
            AND COALESCE(pr.sub_user_id, gc.subuser_id) IS NOT NULL
        `;
        
        // 2. 获取当日有微信/支付宝购买礼包的子账号
        const giftQuery = `
            SELECT DISTINCT gc.subuser_id AS sub_user_id
            FROM PaymentRecords pr
            JOIN gamecharacters gc ON gc.uuid = pr.role_id
            WHERE DATE(pr.created_at) = ?
            AND pr.payment_status IN (3, 4)
            AND (pr.payment_way LIKE '%微信%' OR pr.payment_way LIKE '%支付宝%' OR pr.payment_way LIKE '%wechat%' OR pr.payment_way LIKE '%alipay%')
            AND (pr.server_url LIKE 'gift://%')
            AND gc.subuser_id IS NOT NULL
        `;
        
        const [platformRows] = await connection.execute(platformQuery, [targetDate]);
        const [giftRows] = await connection.execute(giftQuery, [targetDate]);
        
        // 合并并去重子账号ID
        const userSet = new Set();
        platformRows.forEach(row => userSet.add(row.sub_user_id));
        giftRows.forEach(row => userSet.add(row.sub_user_id));
        
        const userList = Array.from(userSet).sort((a, b) => a - b);
        
        logInfo(`📊 [用户列表] 平台币用户=${platformRows.length}个, 礼包用户=${giftRows.length}个, 合并后=${userList.length}个`);
        
        return userList;
    } catch (error) {
        logError(`获取充值用户列表失败: ${error.message}`);
        return [];
    }
}

/**
 * 主执行函数
 */
async function main() {
    const startTime = Date.now();
    logInfo('======== 自动礼包发放脚本开始执行 ========');
    logInfo('计算逻辑: 统计平台币消费 + 微信/支付宝礼包(×10)的"成功消费"(status=3或4)');
    logInfo('说明: 按子账号维度筛选当日发生消费的用户');
    
    // 检查是否启用自动发放
    if (!AUTO_GIFT_CONFIG.enabled) {
        logInfo('自动礼包发放功能已禁用，脚本退出');
        return;
    }
    
    let connection;
    try {
        // 创建数据库连接
        connection = await createDbConnection();
        
        // 获取目标日期（默认为当天）
        let inputDate = process.argv[2] || new Date().toISOString().split('T')[0];
        
        // 标准化日期格式 (将 2025-7-20 转换为 2025-07-20)
        const targetDate = normalizeDate(inputDate);
        logInfo(`原始日期参数: ${inputDate}`);
        logInfo(`标准化后日期: ${targetDate}`);
        
        const today = new Date().toISOString().split('T')[0];
        const isBackfill = targetDate !== today;
        logInfo(`当前日期: ${today}`);
        logInfo(`补发模式: ${isBackfill ? '是' : '否'} - ${isBackfill ? '礼包记录将使用目标日期时间戳' : '礼包记录使用当前时间戳'}`);
        
        // 获取需要处理的用户列表
        const userIds = await getUsersWithRecharge(connection, targetDate);
        logInfo(`找到 ${userIds.length} 个有充值记录的用户需要处理`);
        
        if (userIds.length === 0) {
            logInfo('没有用户需要处理，脚本结束');
            return;
        }
        
        let totalProcessed = 0;
        let totalDelivered = 0;
        let processedUsers = 0;
        
        // 处理每个用户
        for (const subUserId of userIds) {
            try {
                const result = await processUserAutoGifts(connection, subUserId, targetDate);
                totalProcessed += result.processed;
                totalDelivered += result.delivered;
                processedUsers++;
                
                if (result.processed > 0) {
                    logInfo(`用户 ${subUserId} 处理完成: 创建 ${result.processed} 个礼包记录，成功发放 ${result.delivered} 个`);
                }
                
                // 每处理10个用户输出一次进度
                if (processedUsers % 10 === 0) {
                    logInfo(`处理进度: ${processedUsers}/${userIds.length} 用户`);
                }
                
            } catch (error) {
                logError(`处理用户 ${subUserId} 失败: ${error.message}`);
            }
        }
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        logInfo('======== 自动礼包发放脚本执行完成 ========');
        logInfo(`处理统计:`);
        logInfo(`  - 处理日期: ${targetDate}`);
        logInfo(`  - 处理用户数: ${processedUsers}/${userIds.length}`);
        logInfo(`  - 创建礼包记录: ${totalProcessed} 个`);
        logInfo(`  - 成功发放: ${totalDelivered} 个`);
        logInfo(`  - 执行时间: ${duration} 秒`);
        
    } catch (error) {
        logError(`脚本执行失败: ${error.message}`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            logInfo('数据库连接已关闭');
        }
    }
}

// 执行主函数
main().catch(error => {
    logError(`脚本执行异常: ${error.message}`);
    process.exit(1);
});