import * as UserModel from '../model/user';
import * as PlatformCoinRechargeModel from '../model/platformCoinRecharge';
import * as ExternalGiftPackageModel from '../model/externalGiftPackage';
import * as PaymentModel from '../model/payment';
import * as AdminModel from '../model/admin';
import {H3Event} from 'h3';
import {sql} from '../db';
import { getSystemConfig } from '../utils/systemConfig';
import { executePaymentBySystemParam } from '../utils/paymentGateways';
import { requireAuth } from '@quantum/shared/server/utils/jwt';

// 权限验证辅助函数
function normalizeClientIp(ip: string): string {
    if (!ip) return '127.0.0.1';
    const raw = ip.split(',')[0]?.trim() || '';
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    if (raw === '::1') return '127.0.0.1';
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(raw) ? raw : '127.0.0.1';
}

function getCurrentFormattedTime(): string {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份是从0开始的，所以要加1
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


function getClientIp(event: H3Event): string {
    const forwarded = event.node.req.headers['x-forwarded-for'];
    const headerIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const socketIp = event.node.req.socket?.remoteAddress || '';
    return normalizeClientIp(headerIp || socketIp);
}

// 权限验证辅助函数
const checkPermission = async (event: H3Event, userChannelCode: string): Promise<{ hasPermission: boolean; adminInfo?: any }> => {
    try {
        const authorizationHeader = getHeader(event, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        if (!token) {
            return { hasPermission: false };
        }
        
        // 获取管理员信息和权限
        const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
        if (!adminWithPermissions) {
            return { hasPermission: false };
        }
        
        // 超级管理员(level 0)可以访问所有数据
        if (adminWithPermissions.level === 0) {
            return { hasPermission: true, adminInfo: adminWithPermissions };
        }
        
        // 其他级别需要检查权限范围
        const allowedChannelCodes = adminWithPermissions.allowed_channel_codes || [];
        
        // 如果没有设置权限或用户的channel_code在允许范围内
        if (allowedChannelCodes.length === 0 || allowedChannelCodes.includes(userChannelCode)) {
            return { hasPermission: true, adminInfo: adminWithPermissions };
        }
        
        return { hasPermission: false };
    } catch (error) {
        console.error('权限验证失败:', error);
        return { hasPermission: false };
    }
};

// ========== 用户个人信息相关API ==========

// 获取当前用户个人信息
export const getUserProfile = defineEventHandler(async (event) => {
    try {
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询个人信息`);
        
        // 获取用户基本信息
        const user = await UserModel.findById(userId);
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }
        
        // 获取平台币余额
        const platformCoins = await UserModel.getPlatformCoins(userId);
        
        // 获取充值统计
        const totalRechargeAmount = await PlatformCoinRechargeModel.getTotalRechargeAmountByUserId(userId);
        const rechargeStats = await PlatformCoinRechargeModel.getRechargeStatsByTypeByUserId(userId);
        
        // 获取购买统计
        const totalPurchases = await ExternalGiftPackageModel.getUserPurchaseRecordsCountByUserId(userId);
        
        return {
            code: 200,
            data: {
                id: user.id,
                username: user.username,
                thirdparty_uid: user.thirdparty_uid,
                channel_code: user.channel_code,
                platform_coins: platformCoins,
                total_recharge_amount: totalRechargeAmount,
                recharge_stats: rechargeStats,
                total_purchases: totalPurchases,
                created_at: user.created_at
            },
            message: '获取用户信息成功'
        };
    } catch (error) {
        console.error('获取用户信息出错:', error);
        throw createError({
            status: 401,
            message: '未授权，请先登录'
        });
    }
});

// 获取可用的礼包列表
export const getAvailableGiftPackages = defineEventHandler(async (event) => {
    try {
        // 基本身份验证
        const authorizationHeader = getHeader(event, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        if (!token) {
            return {
                code: 401,
                message: '需要登录'
            };
        }
        
        // 验证管理员是否存在
        const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
        if (!adminWithPermissions) {
            return {
                code: 403,
                message: '管理员不存在'
            };
        }
        
        const query = getQuery(event);
        const category = query.category as string;
        
        let packages;
        if (category && category !== 'all') {
            packages = await ExternalGiftPackageModel.getGiftPackagesByCategory(category);
        } else {
            packages = await ExternalGiftPackageModel.getAllActiveGiftPackages();
        }
        
        return {
            code: 200,
            data: packages,
            message: '获取礼包列表成功'
        };
    } catch (error) {
        console.error('获取礼包列表出错:', error);
        throw createError({
            status: 500,
            message: '获取礼包列表时发生错误'
        });
    }
});


// ========== 公开的用户端API（无需管理员权限） ==========

// 获取公开的礼包列表（用户端使用）
export const getPublicGiftPackages = defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const category = query.category as string;
        
        let packages;
        if (category && category !== 'all') {
            packages = await ExternalGiftPackageModel.getGiftPackagesByCategory(category);
        } else {
            packages = await ExternalGiftPackageModel.getAllActiveGiftPackages();
        }
        
        return {
            code: 200,
            data: packages,
            message: '获取礼包列表成功'
        };
    } catch (error) {
        console.error('获取公开礼包列表出错:', error);
        throw createError({
            status: 500,
            message: '获取礼包列表时发生错误'
        });
    }
});

// 获取礼包分类列表
export const getGiftPackageCategories = defineEventHandler(async (event) => {
    try {
        const result = await sql({
            query: `SELECT DISTINCT category FROM ExternalGiftPackages 
                    WHERE is_active = 1 
                    AND category IS NOT NULL 
                    AND category != '' 
                    AND (start_time IS NULL OR start_time <= NOW()) 
                    AND (end_time IS NULL OR end_time >= NOW())
                    ORDER BY category`,
        }) as any[];
        
        const categories = result.map((row: any) => row.category);
        
        return {
            code: 200,
            data: categories,
            message: '获取分类列表成功'
        };
    } catch (error) {
        console.error('获取分类列表出错:', error);
        throw createError({
            status: 500,
            message: '获取分类列表时发生错误'
        });
    }
});

// 用户购买礼包（用户端使用，基于用户ID）
export const userPurchaseGiftPackage = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 正在购买礼包`);
        // ========================================================

        const body = await readBody(event);
        const { package_id, character_uuid } = body;  // ⚠️ 不再从 body 获取 user_id
        console.log(body);

        // 🔒 安全限制：强制购买数量为1，防止刷单
        const quantity = 1;

        if (!package_id) {
            return {
                code: 400,
                message: '缺少必要参数'
            };
        }

        // 验证角色参数
        if (!character_uuid) {
            return {
                code: 400,
                message: '请选择要发放的角色'
            };
        }

        // 🚦 Redis 接口限速：同一用户对同一礼包 1 秒内只能下单一次（防止快速双击重复提交）
        // key 含 package_id，使购物车里不同礼包互不影响；窗口 1s 既能防重复又不卡批量结算
        try {
            const { getRedisCluster } = await import('../utils/redis-cluster');
            const redis = getRedisCluster();
            const rateLimitKey = `purchase_cooldown:${userId}:${package_id}`;  // ✅ userId + package_id
            // SET key 1 NX EX 1 —— 只有 key 不存在时才设置成功
            const acquired = await redis.set(rateLimitKey, '1', 'EX', 1, 'NX');
            if (!acquired) {
                const ttl = await redis.ttl(rateLimitKey);
                return {
                    code: 429,
                    message: `操作太频繁，请 ${ttl} 秒后再试`
                };
            }
        } catch (redisErr) {
            // Redis 异常时不阻断业务，仅记录日志
            console.warn('[userPurchaseGiftPackage] Redis 限速检查失败:', redisErr);
        }


        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }

        // 验证角色是否属于该用户（通过子账号关联）
        const character = await sql({
            query: `SELECT gc.* FROM GameCharacters gc
                   INNER JOIN SubUsers su ON gc.subuser_id = su.id
                   WHERE su.parent_user_id = ? AND gc.uuid = ?`,
            values: [userId, character_uuid],  // ✅ 使用 JWT 中的 userId
        }) as any[];

        if (character.length === 0) {
            return {
                code: 400,
                message: '角色不存在或不属于该用户'
            };
        }

        const selectedCharacter = character[0];

        console.log(`========== 用户购买礼包开始 ==========`);
        console.log(`用户ID: ${userId}, 角色UUID: ${selectedCharacter.uuid}, 角色名: ${selectedCharacter.character_name}`);
        console.log(`礼包ID: ${package_id}, 数量: ${quantity}`);
        console.log(`========================================`);
        
        // 检查用户是否可以购买该礼包（使用角色UUID进行限购检查）
        const checkResult = await ExternalGiftPackageModel.checkUserCanPurchase(selectedCharacter.uuid, package_id, quantity);
        if (!checkResult.canPurchase) {
            console.log(`❌ 限购检查失败: ${checkResult.reason}`);
            return {
                code: 400,
                message: checkResult.reason
            };
        }
        console.log(`✅ 限购检查通过，继续购买流程`);

        
        // 获取礼包信息
        const giftPackage = await ExternalGiftPackageModel.getGiftPackageById(package_id);
        if (!giftPackage) {
            return {
                code: 404,
                message: '礼包不存在'
            };
        }

        // 🔒 安全校验1：礼包必须已上架
        if (!giftPackage.is_active) {
            return {
                code: 400,
                message: '礼包未上架'
            };
        }

        // 🔒 安全校验2：有效期校验
        const now = new Date();
        if (giftPackage.start_time && new Date(giftPackage.start_time) > now) {
            return {
                code: 400,
                message: '礼包未开始'
            };
        }
        if (giftPackage.end_time && new Date(giftPackage.end_time) < now) {
            return {
                code: 400,
                message: '礼包已结束'
            };
        }

        // 计算总价
        const totalAmount = giftPackage.price_platform_coins * quantity;

        // 检查用户平台币余额
        const currentBalance = await UserModel.getPlatformCoins(userId);  // ✅ 使用 JWT 中的 userId
        if (currentBalance < totalAmount) {
            return {
                code: 400,
                message: '平台币余额不足'
            };
        }

        // 扣除平台币并创建购买记录（使用统一方法，标志位1表示游戏内购扣款，这里用于礼包购买）
        const deductResult = await UserModel.updatePlatformCoinsUnified(userId, -totalAmount, 1);  // ✅ 使用 JWT 中的 userId
        if (!deductResult.success) {
            return {
                code: 400,
                message: deductResult.message || '扣除平台币失败'
            };
        }
        
        // 生成唯一订单号（时间戳 + 4位随机数，防止毫秒级并发碰撞）
        const orderTs = Date.now();
        const orderRand = Math.floor(Math.random() * 9000) + 1000; // 1000~9999
        const mchOrderId = `${orderTs}${orderRand}`;

        // 同时创建PaymentRecords记录（平台币消费记录）
        // 使用选择的角色信息填充 wuid 和 sub_user_id
        const transactionId = `PC${orderTs}${orderRand}${user.id}`;
        const paymentData = {
            user_id: user.id!,
            sub_user_id: selectedCharacter.subuser_id, // 使用角色的 subuser_id
            role_id: selectedCharacter.uuid, // 角色UUID作为role_id
            transaction_id: transactionId,
            wuid: selectedCharacter.uuid, // 使用角色的 uuid 作为 wuid
            payment_way: '平台币',
            payment_id: 0,
            world_id: selectedCharacter.server_id || 1,
            product_name: giftPackage.package_name,
            product_des: '礼包购买',
            ip: '',
            amount: totalAmount,
            mch_order_id: mchOrderId, // 使用相同的订单号
            msg: '',
            server_url: '',
            device: '',
            channel_code: user.channel_code || '',
            game_code: user.game_code || 'hzwqh',
            payment_status: 2, // 先标记为处理中
            ptb_before: currentBalance,
            ptb_change: -totalAmount,
            ptb_after: deductResult.newBalance
        };
        
        // 使用 PaymentModel.insert 方法插入完整的支付记录
        const PaymentModel = await import('../model/payment');
        await PaymentModel.insert(paymentData);
        
        // 更新礼包销售数量
        if (giftPackage.is_limited) {
            await ExternalGiftPackageModel.updatePackageSoldQuantity(package_id, quantity);
        }
        

        
        // 创建购买记录
        const purchaseRecord = {
            user_id: user.id!,
            thirdparty_uid: selectedCharacter.uuid, // 使用角色UUID作为thirdparty_uid
            mch_order_id: mchOrderId, // 使用生成的订单号
            package_id: package_id,
            package_code: giftPackage.package_code,
            package_name: giftPackage.package_name,
            quantity: quantity,
            unit_price: giftPackage.price_platform_coins,
            total_amount: totalAmount,
            balance_before: currentBalance,
            balance_after: deductResult.newBalance!,
            gift_items: giftPackage.gift_items,
            status: 'paid' as const,
            remark: `平台币购买 - 服务器${selectedCharacter.server_id || 1}`
        };
        
        console.log(`[userPurchaseGiftPackage] 创建购买记录, 用户ID: ${userId}, 礼包ID: ${package_id}, 角色: ${selectedCharacter.uuid}`);
        const createResult = await ExternalGiftPackageModel.createPurchaseRecord(purchaseRecord);
        
        // 获取购买记录ID用于发放
        const purchaseRecordId = (createResult as any).insertId;
        console.log(`[userPurchaseGiftPackage] 购买记录创建成功, 记录ID: ${purchaseRecordId}`);
        
        // 自动发放礼包到游戏内（使用 IDIP 方式）
        console.log(`[userPurchaseGiftPackage] 开始自动发放礼包到游戏内...`);
        try {
            const deliveryResult = await ExternalGiftPackageModel.deliverPackageToGameViaIDIP(
                purchaseRecordId,
                selectedCharacter.server_id?.toString() || '1',
                selectedCharacter.uuid
            );
            
            if (deliveryResult.success) {
                console.log(`[userPurchaseGiftPackage] ✅ 礼包自动发放成功! 购买记录ID: ${purchaseRecordId}`);
                
                // 更新支付记录为成功，并记录到账时间
                const currentTime = getCurrentFormattedTime();
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 3,
                    notify_at: currentTime,
                    msg: '礼包发放成功'
                });
                
                return {
                    code: 200,
                    data: {
                        new_balance: deductResult.newBalance,
                        purchase_amount: totalAmount
                    },
                    message: '礼包购买成功'
                };
            } else if ((deliveryResult as any).timeout) {
                console.warn(`[userPurchaseGiftPackage] ⏳ 礼包发放超时，等待确认. 购买记录ID: ${purchaseRecordId}`);
                
                // 超时不退款，保持支付处理中
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 1,
                    msg: `DELIVERY_TIMEOUT:${deliveryResult.message || '发放超时，等待确认'}`
                });

                // 更新礼包购买记录为发送中
                await ExternalGiftPackageModel.updatePurchaseRecordStatus(
                    purchaseRecordId,
                    'paid',
                    'sent',
                    '发放超时，等待确认'
                );

                return {
                    code: 202,
                    message: '礼包发放处理中，请稍后查询'
                };
            } else {
                console.error(`[userPurchaseGiftPackage] ❌ 礼包自动发放失败! 购买记录ID: ${purchaseRecordId}, 错误: ${deliveryResult.message}`);

                const { getPaymentRefundEnabled } = await import('../model/systemParams');
                const refundEnabled = await getPaymentRefundEnabled();

                if (refundEnabled) {
                    // 退还平台币（使用统一方法）
                    const refundResult = await UserModel.updatePlatformCoinsUnified(userId, totalAmount, 6);  // ✅ 使用 JWT 中的 userId
                    if (!refundResult.success) {
                        console.error(`[userPurchaseGiftPackage] ⚠️ 退款失败:`, refundResult.message);
                    }
                    const refundBalance = refundResult.newBalance || deductResult.newBalance!;
                    console.log(`[userPurchaseGiftPackage] 💰 已退还平台币: ${totalAmount}, 新余额: ${refundBalance}`);
                    
                    // 更新支付记录为失败
                    await PaymentModel.updateByTransactionId(transactionId, {
                        payment_status: 2,
                        msg: `${deliveryResult.message || '未知错误'}`,
                        ptb_after: refundBalance,
                        ptb_change: 0
                    });
                    
                    // 更新礼包购买记录
                    await ExternalGiftPackageModel.updatePurchaseRecordStatus(
                        purchaseRecordId,
                        'failed',
                        'failed',
                        `已退款: ${deliveryResult.message || '未知错误'}`
                    );
                    
                    return {
                        code: 500,
                        message: `礼包发放失败: ${deliveryResult.message || '未知错误'}，平台币已退还`
                    };
                }

                // 退款开关关闭：保持处理中，等待后续确认
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 1,
                    msg: `GIFT_DELIVERY_FAILED_NO_REFUND:${deliveryResult.message || '未知错误'}`
                });
                await ExternalGiftPackageModel.updatePurchaseRecordStatus(
                    purchaseRecordId,
                    'paid',
                    'failed',
                    '发放失败（退款关闭，待确认）'
                );

                return {
                    code: 202,
                    message: '礼包发放失败，退款已关闭，请联系管理员处理'
                };
            }
        } catch (deliveryError) {
            console.error(`[userPurchaseGiftPackage] ❌ 自动发放礼包异常:`, deliveryError);

            const { getPaymentRefundEnabled } = await import('../model/systemParams');
            const refundEnabled = await getPaymentRefundEnabled();

            const errorMsg = deliveryError instanceof Error ? deliveryError.message : '系统错误';

            if (refundEnabled) {
                // 退还平台币（使用统一方法）
                const refundResult = await UserModel.updatePlatformCoinsUnified(userId, totalAmount, 7);  // ✅ 使用 JWT 中的 userId
                if (!refundResult.success) {
                    console.error(`[userPurchaseGiftPackage] ⚠️ 退款失败:`, refundResult.message);
                }
                const refundBalance = refundResult.newBalance || deductResult.newBalance!;
                console.log(`[userPurchaseGiftPackage] 💰 已退还平台币: ${totalAmount}, 新余额: ${refundBalance}`);
                
                // 更新支付记录为失败
                await PaymentModel.updateByTransactionId(transactionId, {
                    payment_status: 2,
                    msg: `${errorMsg}`,
                    ptb_after: refundBalance,
                    ptb_change: 0
                });
                
                // 更新礼包购买记录
                await ExternalGiftPackageModel.updatePurchaseRecordStatus(
                    purchaseRecordId,
                    'failed',
                    'failed',
                    `已退款: ${errorMsg}`
                );
                
                return {
                    code: 500,
                    message: `礼包发放异常: ${errorMsg}，平台币已退还`
                };
            }

            await PaymentModel.updateByTransactionId(transactionId, {
                payment_status: 1,
                msg: `GIFT_DELIVERY_EXCEPTION_NO_REFUND:${errorMsg}`
            });
            await ExternalGiftPackageModel.updatePurchaseRecordStatus(
                purchaseRecordId,
                'paid',
                'failed',
                '发放异常（退款关闭，待确认）'
            );
            return {
                code: 202,
                message: '礼包发放异常，退款已关闭，请联系管理员处理'
            };
        }
    } catch (error) {
        console.error('用户购买礼包出错:', error);
        throw createError({
            status: 500,
            message: '购买礼包时发生错误'
        });
    }
});


// 获取用户购买记录（用户端使用）
export const getUserPurchaseHistory = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询购买记录`);
        // ========================================================

        const query = getQuery(event);
        const page = parseInt(query.page as string) || 1;
        const pageSize = parseInt(query.pageSize as string) || 10;

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }

        // 获取购买记录
        const records = await ExternalGiftPackageModel.getUserPurchaseRecords(user.thirdparty_uid!, page, pageSize);
        const total = await ExternalGiftPackageModel.getUserPurchaseRecordsCount(user.thirdparty_uid!);

        return {
            code: 200,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            },
            message: '获取购买记录成功'
        };
    } catch (error) {
        console.error('获取用户购买记录出错:', error);
        throw createError({
            status: 500,
            message: '获取购买记录时发生错误'
        });
    }
});

// 获取用户充值记录（从PaymentRecords表）
export const getUserRechargeHistory = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询充值记录`);
        // ========================================================

        const query = getQuery(event);
        const page = parseInt(query.page as string) || 1;
        const pageSize = parseInt(query.pageSize as string) || 10;

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }

        const offset = (page - 1) * pageSize;

        // 从PaymentRecords表获取真实充值记录（排除平台币消费，关联 GameCharacters 表获取角色名字）
        const records = await sql({
            query: `SELECT pr.*, gc.character_name as role_name
                   FROM PaymentRecords pr
                   LEFT JOIN GameCharacters gc ON pr.role_id = gc.uuid
                   WHERE pr.user_id = ? AND pr.payment_status = 3
                   AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
                   ORDER BY pr.created_at DESC
                   LIMIT ?, ?`,
            values: [userId, offset, pageSize],  // ✅ 使用 JWT 中的 userId
        });

        // 获取总数
        const countResult = await sql({
            query: `SELECT COUNT(*) as total FROM PaymentRecords
                   WHERE user_id = ? AND payment_status = 3
                   AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')`,
            values: [userId],  // ✅ 使用 JWT 中的 userId
        }) as any[];

        const total = countResult[0]?.total || 0;

        return {
            code: 200,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            },
            message: '获取充值记录成功'
        };
    } catch (error) {
        console.error('获取用户充值记录出错:', error);
        throw createError({
            status: 500,
            message: '获取充值记录时发生错误'
        });
    }
});

// 获取用户平台币消费记录（从PaymentRecords表）
export const getUserPlatformCoinSpendHistory = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询getUserPlatformCoinSpendHistory`);
        // ========================================================

        const query = getQuery(event);
        const page = parseInt(query.page as string) || 1;
        const pageSize = parseInt(query.pageSize as string) || 10;

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }
        
        const offset = (page - 1) * pageSize;
        
        const statusFilter = (query.status as string || 'all').toLowerCase();
        const baseWhereClauses = [
            'pr.user_id = ?',
            "pr.payment_way = '平台币'",
            'pr.role_id IS NOT NULL',
            "TRIM(pr.role_id) <> ''"
        ];
        const whereValues: any[] = [userId];  // ✅ 使用 JWT 中的 userId
        
        if (statusFilter === 'success') {
            baseWhereClauses.push('pr.payment_status = 3');
        } else if (statusFilter === 'failed') {
            baseWhereClauses.push('(pr.payment_status IS NULL OR pr.payment_status <> 3)');
        }
        
        const whereClauseSql = baseWhereClauses.join(' AND ');
        
        const records = await sql({
            query: `SELECT pr.*, gc.character_name as role_name
                   FROM PaymentRecords pr
                   LEFT JOIN GameCharacters gc ON pr.role_id = gc.uuid
                   WHERE ${whereClauseSql}
                   ORDER BY pr.created_at DESC 
                   LIMIT ?, ?`,
            values: [...whereValues, offset, pageSize],
        });
        
        // 获取总数（按当前状态过滤）
        const countResult = await sql({
            query: `SELECT COUNT(*) as total 
                   FROM PaymentRecords pr
                   WHERE ${whereClauseSql}`,
            values: whereValues,
        }) as any[];
        
        // 获取已完成订单数量
        const completedCountResult = await sql({
            query: `SELECT COUNT(*) as completed 
                   FROM PaymentRecords 
                   WHERE user_id = ?
                     AND payment_way = '平台币'
                     AND payment_status = 3
                     AND role_id IS NOT NULL
                     AND TRIM(role_id) <> ''`,
            values: [userId],  // ✅ 修复: user_id → userId
        }) as any[];
        
        const totalSpentResult = await sql({
            query: `SELECT COALESCE(SUM(amount), 0) AS total_spent
                   FROM PaymentRecords
                   WHERE user_id = ?
                     AND payment_way = '平台币'
                     AND payment_status = 3
                     AND role_id IS NOT NULL
                     AND TRIM(role_id) <> ''`,
            values: [userId],  // ✅ 修复: user_id → userId
        }) as any[];
        
        const totalSpent = Number(totalSpentResult[0]?.total_spent || 0);
        const completedCount = Number(completedCountResult[0]?.completed || 0);
        
        const total = countResult[0]?.total || 0;
        
        return {
            code: 200,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                },
                totalSpent,
                completedCount
            },
            message: '获取消费记录成功'
        };
    } catch (error) {
        console.error('获取用户消费记录出错:', error);
        throw createError({
            status: 500,
            message: '获取消费记录时发生错误'
        });
    }
});

// 获取用户首页统计数据（从PaymentRecords表）
export const getUserHomeStats = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询getUserHomeStats`);
        // ========================================================

        const query = getQuery(event);

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }
        
        // 获取累计充值金额（真实充值：排除平台币支付，只统计支付宝、微信等现金充值）
        const totalRechargeResult = await sql({
            query: `SELECT SUM(amount) as total FROM PaymentRecords
                   WHERE user_id = ? AND payment_status = 3
                   AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')`,
            values: [userId],  // ✅ 使用 JWT 中的 userId
        }) as any[];

        const totalRecharge = totalRechargeResult[0]?.total || 0;

        // 获取购买次数（payment_way是"平台币"且已完成的记录）
        const purchaseCountResult = await sql({
            query: `SELECT COUNT(*) as count FROM PaymentRecords
                   WHERE user_id = ? AND payment_way = '平台币' AND payment_status = 3`,
            values: [userId],
        }) as any[];

        const purchaseCount = purchaseCountResult[0]?.count || 0;

        // 获取最近3次购买记录（payment_way是"平台币"的记录）
        const recentOrdersResult = await sql({
            query: `SELECT * FROM PaymentRecords
                   WHERE user_id = ? AND payment_way = '平台币'
                   ORDER BY created_at DESC
                   LIMIT 3`,
            values: [userId],
        });
        
        return {
            code: 200,
            data: {
                totalRecharge,
                purchaseCount,
                recentOrders: recentOrdersResult
            },
            message: '获取用户统计数据成功'
        };
    } catch (error) {
        console.error('获取用户统计数据出错:', error);
        throw createError({
            status: 500,
            message: '获取统计数据时发生错误'
        });
    }
});

// 获取用户个人资料统计数据（专为个人资料页面设计）
export const getUserStats = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询统计数据`);
        // ========================================================

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }

        // 获取累计充值金额（真实充值：排除平台币支付）
        const totalRechargeResult = await sql({
            query: `SELECT SUM(amount) as total FROM PaymentRecords
                   WHERE user_id = ? AND payment_status = 3
                   AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')`,
            values: [userId],  // ✅ 使用 JWT 中的 userId
        }) as any[];

        const totalRecharge = totalRechargeResult[0]?.total || 0;

        // 获取购买次数（使用平台币的消费次数）
        const purchaseCountResult = await sql({
            query: `SELECT COUNT(*) as count FROM PaymentRecords 
                   WHERE user_id = ? AND payment_way = '平台币' AND payment_status = 3`,
            values: [userId],  // ✅ 修复: user_id → userId
        }) as any[];
        
        const purchaseCount = purchaseCountResult[0]?.count || 0;
        
        return {
            code: 200,
            data: {
                total_recharge: totalRecharge,
                total_purchases: purchaseCount
            },
            message: '获取用户统计数据成功'
        };
    } catch (error) {
        console.error('获取用户统计数据出错:', error);
        throw createError({
            status: 500,
            message: '获取统计数据时发生错误'
        });
    }
});

// 获取当前登录用户信息（Cookie JWT 会话校验）
export const getCurrentUser = defineEventHandler(async (event) => {
    try {
        const { userId } = await requireAuth(event);
        const user = await UserModel.findById(userId);
        if (!user) {
            return { code: 404, message: '用户不存在', data: null };
        }

        const platformCoins = await UserModel.getPlatformCoins(userId);
        const { password, ...safeUser } = user as any;
        return {
            code: 200,
            message: '会话有效',
            data: {
                user: {
                    ...safeUser,
                    platform_coins: platformCoins,
                }
            }
        };
    } catch (error) {
        console.error('[会话校验] 异常:', error);
        return { code: 401, message: '未授权，请先登录', data: null };
    }
});

// 获取当前用户的平台币余额
export const getUserBalance = defineEventHandler(async (event) => {
    try {
        // Cookie JWT 优先：从 HttpOnly Cookie / Bearer token 获取真实用户ID，不再信任前端 user_id 或数字 Authorization
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询余额`);
        
        // 验证用户是否存在
        const user = await UserModel.findById(userId);
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }
        
        // 实时从数据库获取余额
        const platformCoins = await UserModel.getPlatformCoins(userId);
        
        return {
            code: 200,
            data: {
                platform_coins: platformCoins
            },
            message: '获取余额成功'
        };
    } catch (error) {
        console.error('[余额查询] 异常:', error);
        return {
            code: 401,
            message: '未授权，请先登录'
        };
    }
});

// 获取用户角色信息（不分子账号，直接返回所有角色）
export const getUserCharacters = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询getUserCharacters`);
        // ========================================================

        const query = getQuery(event);

        // 检查用户是否存在
        const user = await UserModel.findById(userId);  // ✅ 使用 JWT 中的 userId
        if (!user) {
            return {
                code: 404,
                message: '用户不存在'
            };
        }
        
        // 获取用户的所有角色：主账号与子账号双重归属校验
        const characters = await sql({
            query: `SELECT gc.*
                   FROM GameCharacters gc
                   INNER JOIN SubUsers su ON su.id = gc.subuser_id
                   WHERE gc.user_id = ? AND su.parent_user_id = ?
                   ORDER BY gc.created_at DESC`,
            values: [userId, userId],
        }) as any[];

        // 批量查 gameservers 真实名称（用 server_id 对应）
        const GameServersModel = await import('../model/gameServers');
        const uniqueServerIds = [...new Set(characters.map(c => c.server_id).filter(Boolean))];
        const serverNameMap: Record<number, string> = {};
        await Promise.all(uniqueServerIds.map(async (sid) => {
            const gs = await GameServersModel.getByServerId(Number(sid));
            if (gs) serverNameMap[Number(sid)] = gs.name;
        }));

        return {
            code: 200,
            data: {
                user_id: userId,
                characters: characters.map(char => ({
                    id: char.id,
                    uuid: char.uuid,
                    subuser_id: char.subuser_id,
                    character_name: char.character_name,
                    character_level: char.character_level,
                    // 优先用 gameservers.name，兜底用存储的 server_name
                    server_name: serverNameMap[Number(char.server_id)] || char.server_name,
                    server_id: char.server_id,
                    game_id: char.game_id,
                    last_login_at: char.last_login_at
                }))
            },
            message: '获取用户角色信息成功'
        };
    } catch (error) {
        console.error('获取用户角色信息出错:', error);
        throw createError({
            status: 500,
            message: '获取用户角色信息时发生错误'
        });
    }
});

// 根据用户ID查询礼包购买记录（支持日期和类型过滤）
export const getPlayerGiftPackageRecords = defineEventHandler(async (event) => {
    try {
        // ============ JWT 认证: 从 token 获取真实用户ID ============
        const { userId } = await requireAuth(event);
        console.log(`[JWT认证] 用户ID: ${userId} 查询礼包记录`);
        // ========================================================

        const query = getQuery(event);
        const page = parseInt(query.page as string) || 1;
        const pageSize = parseInt(query.pageSize as string) || 10;
        const startDate = query.startDate as string;
        const endDate = query.endDate as string;
        const packageType = query.packageType as string || 'all'; // all, purchased, daily, cumulative

        // 获取礼包购买记录
        const records = await ExternalGiftPackageModel.getPlayerGiftPackageRecords(
            userId,  // ✅ 使用 JWT 中的 userId
            page,
            pageSize,
            startDate,
            endDate,
            packageType
        );

        // 获取总数
        const total = await ExternalGiftPackageModel.getPlayerGiftPackageRecordsCount(
            userId,  // ✅ 使用 JWT 中的 userId
            startDate,
            endDate,
            packageType
        );
        
        return {
            code: 200,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                },
                filters: {
                    user_id,
                    startDate,
                    endDate,
                    packageType
                }
            },
            message: '获取礼包记录成功'
        };
    } catch (error) {
        console.error('获取玩家礼包记录出错:', error);
        throw createError({
            status: 500,
            message: '获取礼包记录时发生错误'
        });
    }
});