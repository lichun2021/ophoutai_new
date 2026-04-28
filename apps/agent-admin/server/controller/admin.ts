import {H3Event, readBody, readMultipartFormData, createError, defineEventHandler, getQuery, getHeader} from 'h3';
import * as AdminModel from '../model/admin';
import * as PlatformCoinsModel from '../model/platformCoins';
import * as PaymentModel from '../model/payment';
import { generate2FASecret, verify2FAToken } from '../utils/auth';
import crypto from 'crypto';
import {sql} from '../db';
import { getItemName, formatGiftItemsDisplay } from '../utils/itemConfig';
import { extractWorldIdFromBName } from '../model/gameServers';
import { queryRechargeDaily, countRechargeDaily } from '../model/rechargeDaily';
import { convertToChinaDateString, getChinaDateString, getChinaDateStringDaysAgo, getChinaYesterdayString } from '../utils/timezone';


export const read = async(evt?: H3Event) => {
    try{
        const result = await AdminModel.read();
        const admins = Array.isArray(result) ? (result as any[]) : [];

        const AgentRelationships = await import('../model/agentRelationships');

        const channelToAdmin = new Map<string, any>();
        admins.forEach(admin => {
            if (admin?.channel_code) {
                channelToAdmin.set(admin.channel_code, admin);
            }
        });

        const cashRows = await sql({
            query: `
                SELECT channel_code, SUM(amount) AS total_amount
                FROM paymentrecords
                WHERE payment_status = 3
                  AND channel_code IS NOT NULL
                  AND channel_code <> ''
                  AND (
                    payment_way LIKE '%支付宝%' OR
                    payment_way LIKE '%微信%' OR
                    LOWER(payment_way) LIKE '%alipay%' OR
                    LOWER(payment_way) LIKE '%wechat%' OR
                    LOWER(payment_way) LIKE 'zfb%' OR
                    LOWER(payment_way) LIKE 'wx%'
                  )
                GROUP BY channel_code
            `
        }) as Array<{ channel_code: string; total_amount: any }>;

        const cashMap = new Map<string, number>();
        cashRows.forEach(row => {
            const code = row.channel_code;
            if (!code) return;
            const total = parseFloat(row.total_amount ?? 0);
            if (!Number.isFinite(total)) return;
            cashMap.set(code, total);
        });

        const parseAllowedChannels = (value: any): string[] => {
            if (!value) return [];
            if (Array.isArray(value)) {
                return value.map(v => String(v)).filter(Boolean);
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        return parsed.map(v => String(v)).filter(Boolean);
                    }
                } catch {
                    // fall through to comma separated parsing
                }
                return value
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean);
            }
            return [];
        };

        const enrichRows = async (rows: any[]): Promise<any[]> => {
            return await Promise.all(rows.map(async (row) => {
                if (!row) return row;

                const allowedChannels = parseAllowedChannels(row.allowed_channel_codes);
                const allChannels = new Set<string>();
                allowedChannels.forEach(code => {
                    if (code) allChannels.add(code);
                });
                if (row.channel_code) {
                    allChannels.add(row.channel_code);
                }

                let totalCash = 0;
                allChannels.forEach(code => {
                    const cashVal = cashMap.get(code);
                    if (cashVal) totalCash += cashVal;
                });

                const divideRate = parseFloat(row.divide_rate ?? 0) || 0;
                const totalShare = totalCash * (divideRate / 100);

                let parentChannelCode: string | null = null;
                let parentAdminName = '';
                if (row.channel_code) {
                    try {
                        parentChannelCode = await AgentRelationships.getParentChannelCode(row.channel_code) || null;
                        if (parentChannelCode) {
                            const parentAdmin = channelToAdmin.get(parentChannelCode);
                            if (parentAdmin) {
                                parentAdminName = parentAdmin.name || '';
                            }
                        }
                    } catch (error) {
                        console.error('获取上级渠道失败:', error);
                    }
                }

                return {
                    ...row,
                    allowed_channel_codes: allowedChannels,
                    all_channel_codes: Array.from(allChannels),
                    parent_channel_code: parentChannelCode,
                    parent_admin_name: parentAdminName,
                    total_cash_flow: Number(totalCash.toFixed(2)),
                    total_rev_share: Number(totalShare.toFixed(2))
                };
            }));
        };

        if (!evt) {
            const enriched = await enrichRows(admins);
            return {
                data: enriched,
            };
        }

        const authHeader = getHeader(evt, 'authorization') || '';
        const currentAdminId = authHeader ? parseInt(String(authHeader)) || null : null;

        if (!currentAdminId) {
            const enriched = await enrichRows(admins);
            return {
                data: enriched,
            };
        }

        const currentAdmin = await AdminModel.getAdminWithPermissions(currentAdminId);
        if (!currentAdmin) {
            const enriched = await enrichRows(admins);
            return {
                data: enriched,
            };
        }

        if (currentAdmin.level === 0) {
            const enriched = await enrichRows(admins);
            return {
                data: enriched,
            };
        }

        const allowedChannelCodes = currentAdmin.allowed_channel_codes || [];
        const filteredRows = admins.filter((row: any) => {
            if (!row || !row.channel_code) return false;
            return allowedChannelCodes.includes(row.channel_code);
        });

        const enriched = await enrichRows(filteredRows);
        return {
            data: enriched,
        };
    }catch(e: any){
        console.error('管理员读取失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

export const login = async(evt:H3Event) => {
    try{
        const body =  await readBody(evt);
        const name = String(body?.name || '').trim();
        const pwd = String(body?.password || '');
        const admin = await AdminModel.getByName(name);

        console.log("login:", admin ? { id: admin.id, level: admin.level, name: admin.name } : null, name);

        if (admin) {
            // 统一密码规则：md5(md5(password) + salt)
            const SALT = '1a!@#33er4r';
            const inner = crypto.createHash('md5').update(pwd).digest('hex');
            const finalHash = crypto.createHash('md5').update(inner + SALT).digest('hex');
            const passOk = (finalHash === admin.password);

            if (!passOk) {
                return { data: null };
            }

            // 密码验证通过，获取管理员的完整权限信息
            const adminWithPermissions = await AdminModel.getAdminWithPermissions(admin.id);
            
            if (!adminWithPermissions) {
                return { data: null };
            }

            // 如果权限数据为空，则初始化权限
            if (!adminWithPermissions.allowed_channel_codes || adminWithPermissions.allowed_channel_codes.length === 0) {
                const refreshedChannelCodes = await AdminModel.refreshAdminPermissions(admin.id);
                adminWithPermissions.allowed_channel_codes = refreshedChannelCodes;
            }
            
            const permissions = {
                level: adminWithPermissions.level,
                channel_codes: adminWithPermissions.allowed_channel_codes,
                game_ids: adminWithPermissions.allowed_game_ids,
                divide_rate: adminWithPermissions.divide_rate || 0,
                settlement_type: adminWithPermissions.settlement_type || 0,
                settlement_amount: adminWithPermissions.settlement_amount || 0,
                settlement_amount_available: adminWithPermissions.settlement_amount_available || 0,
                tg_account: adminWithPermissions.tg_account || '',
                qq_account: adminWithPermissions.qq_account || '',
                email: adminWithPermissions.email || '',
                phone: adminWithPermissions.phone || '',
                channel_code: adminWithPermissions.channel_code || ''
            };

            return {
                data: {
                    ...adminWithPermissions,
                    permissions: JSON.stringify(permissions)
                },
            };
        } else {
            return {
                data: null,
            };
        }
    }catch(e: any){
        console.error('登录失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}



// 刷新单个管理员权限
export const refreshPermissions = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const channelCodes = await AdminModel.refreshAdminPermissions(admin_id);
        
        return {
            success: true,
            message: '权限刷新成功',
            data: {
                admin_id,
                channel_codes: channelCodes
            }
        };
    }catch(e: any){
        console.error('刷新权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 批量刷新所有管理员权限
export const refreshAllPermissions = async(evt:H3Event) => {
    try{
        await AdminModel.refreshAllAdminPermissions();
        
        return {
            success: true,
            message: '所有管理员权限刷新成功'
        };
    }catch(e: any){
        console.error('批量刷新权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 实际到账查询（recharge_daily）
export const getRechargeDailyRecords = async (evt: H3Event) => {
    try {
        const q: any = getQuery(evt) || {};
        const page = Math.max(1, Number(q.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || 20)));
        const serverId = String(q.serverId || '').trim();
        const playerId = String(q.playerId || '').trim();
        const startDate = String(q.startDate || '');
        const endDate = String(q.endDate || '');

        // 仅玩家ID与时间为查询条件（按需求），服务器可选
        const toStartMs = (ds: string) => {
            if (!ds) return undefined as any;
            const d = new Date(ds + 'T00:00:00+08:00');
            return d.getTime();
        };
        const toEndMs = (ds: string) => {
            if (!ds) return undefined as any;
            const d = new Date(ds + 'T23:59:59.999+08:00');
            return d.getTime();
        };

        const startMs = startDate ? toStartMs(startDate) : undefined;
        const endMs = endDate ? toEndMs(endDate) : undefined;

        const filters: any = {};
        if (playerId) filters.playerId = playerId;
        // 服务器筛选：接口传入可能为 bname(如 game_10001)，库内为 "10001"，需转换
        if (serverId) {
            const worldId = extractWorldIdFromBName(serverId);
            const serverIdForFilter = worldId ? String(worldId) : serverId;
            filters.serverId = serverIdForFilter;
        }
        if (startMs !== undefined) filters.startMs = startMs;
        if (endMs !== undefined) filters.endMs = endMs;

        if (!serverId) {
            throw createError({ status: 400, message: '缺少serverId' });
        }

        const [list, total] = await Promise.all([
            queryRechargeDaily(page, pageSize, filters, serverId),
            countRechargeDaily(filters, serverId)
        ]);

        // 可在后端做商品名映射（前端已做降级映射，这里保持原样返回）
        return {
            success: true,
            data: {
                list,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        };
    } catch (e: any) {
        console.error('查询 recharge_daily 失败:', e);
        throw createError({ status: 500, message: e?.message || 'server_error' });
    }
}

// 手动更新管理员权限
export const updatePermissions = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id, channel_codes } = body;
        
        if (!admin_id || !Array.isArray(channel_codes)) {
            throw createError({
                status: 400,
                message: '参数错误：需要admin_id和channel_codes数组',
            });
        }
        
        await AdminModel.updateChannelCodes(admin_id, channel_codes);
        
        return {
            success: true,
            message: '权限更新成功',
            data: {
                admin_id,
                channel_codes
            }
        };
    }catch(e: any){
        console.error('更新权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取所有游戏列表
export const getAllGames = async(evt:H3Event) => {
    try{
        const games = await AdminModel.getAllGames();
        
        return {
            success: true,
            data: games
        };
    }catch(e: any){
        console.error('获取游戏列表失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 根据管理员权限获取游戏列表
export const getFilteredGames = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const games = await AdminModel.getFilteredGames(admin_id);
        
        return {
            success: true,
            data: games
        };
    }catch(e: any){
        console.error('获取过滤游戏列表失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

/**
 * 生成 2FA 绑定信息 (支持外部密钥校验)
 */
export const generate2FABinding = async (evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const admin_id_param = query.admin_id;
        const master_key = query.master_key;

        // 安全校验：要么是已登录用户给自己生成，要么是持有 master_key 的外部调用
        let targetAdminId: number | null = null;
        const MASTER_KEY = process.env.ADMIN_2FA_MASTER_KEY || 'QUANTUM_2FA_SAFE_KEY_2026';

        if (master_key === MASTER_KEY && admin_id_param) {
            targetAdminId = parseInt(String(admin_id_param));
        } else {
            const authorizationHeader = getHeader(evt, 'authorization');
            targetAdminId = authorizationHeader ? parseInt(authorizationHeader) : null;
        }

        if (!targetAdminId) throw createError({ statusCode: 401, message: '未授权或缺少参数' });

        const admin = await AdminModel.getAdminWithPermissions(targetAdminId);
        if (!admin) throw createError({ statusCode: 404, message: '管理员不存在' });

        const { secret, qrCodeUrl } = await generate2FASecret(admin.name);
        
        return {
            success: true,
            data: {
                admin_name: admin.name,
                secret,
                qrCodeUrl, // 这就是 Base64 图片字符串，可直接在浏览器打开或发给别人
                tip: '请将 qrCodeUrl 发送给管理员扫码，或手动输入 secret'
            }
        };
    } catch (e: any) {
        throw createError({ status: 500, message: e.message || '生成2FA失败' });
    }
};

/**
 * 确认绑定 2FA (支持外部密钥校验)
 */
export const confirm2FABinding = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { secret, code, admin_id, master_key } = body;

        if (!secret || !code) throw createError({ statusCode: 400, message: '参数不完整' });

        // 安全校验：要么是已登录用户给自己绑定，要么是持有 master_key 的外部调用
        let targetAdminId: number | null = null;
        const MASTER_KEY = process.env.ADMIN_2FA_MASTER_KEY || 'QUANTUM_2FA_SAFE_KEY_2026';

        if (master_key === MASTER_KEY && admin_id) {
            targetAdminId = parseInt(String(admin_id));
        } else {
            const authorizationHeader = getHeader(evt, 'authorization');
            targetAdminId = authorizationHeader ? parseInt(authorizationHeader) : null;
        }

        if (!targetAdminId) throw createError({ statusCode: 401, message: '未授权或缺少参数' });

        const isValid = verify2FAToken(code, secret);
        if (!isValid) throw createError({ statusCode: 400, message: '验证码错误' });

        // 存入数据库
        await sql({
            query: 'UPDATE Admins SET google_2fa_secret = ? WHERE id = ?',
            values: [secret, targetAdminId]
        });

        return { success: true, message: '绑定成功' };
    } catch (e: any) {
        throw createError({ status: 500, message: e.message || '绑定2FA失败' });
    }
};

/**
 * 解绑 2FA (仅限超级管理员或本人验证后)
 */
export const unbind2FA = async (evt: H3Event) => {
    try {
        const authorizationHeader = getHeader(evt, 'authorization');
        const adminId = authorizationHeader ? parseInt(authorizationHeader) : null;
        if (!adminId) throw createError({ statusCode: 401, message: '未授权' });

        const body = await readBody(evt);
        const targetAdminId = body.admin_id || adminId;

        const currentAdmin = await AdminModel.getAdminWithPermissions(adminId);
        if (!currentAdmin) throw createError({ statusCode: 404, message: '管理员不存在' });
        
        if (currentAdmin.level !== 0 && targetAdminId !== adminId) {
            throw createError({ statusCode: 403, message: '无权操作' });
        }

        await sql({
            query: 'UPDATE Admins SET google_2fa_secret = NULL WHERE id = ?',
            values: [targetAdminId]
        });

        return { success: true, message: '解绑成功' };
    } catch (e: any) {
        throw createError({ status: 500, message: e.message || '解绑2FA失败' });
    }
};

// 更新管理员游戏权限
export const updateGamePermissions = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id, game_ids } = body;
        
        if (!admin_id || !Array.isArray(game_ids)) {
            throw createError({
                status: 400,
                message: '参数错误：需要admin_id和game_ids数组',
            });
        }
        
        // 获取更新前的权限，计算被移除的游戏ID
        const adminBefore = await AdminModel.getAdminWithPermissions(admin_id);
        const beforeGameIds = adminBefore?.allowed_game_ids || [];
        const removedGameIds = beforeGameIds.filter(id => !game_ids.includes(id));
        
        // 更新当前管理员的游戏权限
        await AdminModel.updateGameIds(admin_id, game_ids);
        
        // 总是触发级联更新下级代理权限（确保下级权限不超出上级范围）
        // 传递更新后的权限给级联更新函数，避免从数据库重新获取时出现延迟
        await AdminModel.cascadeUpdateGamePermissionsWithNewPermissions(admin_id, game_ids, removedGameIds);
        
        return {
            success: true,
            message: '游戏权限更新成功，下级权限已同步',
            data: {
                admin_id,
                game_ids,
                removed_games: removedGameIds
            }
        };
    }catch(e: any){
        console.error('更新游戏权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 检查管理员游戏权限
export const checkGamePermission = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id, game_id } = body;
        
        if (!admin_id || !game_id) {
            throw createError({
                status: 400,
                message: '参数错误：需要admin_id和game_id',
            });
        }
        
        const hasPermission = await AdminModel.hasGamePermission(admin_id, game_id);
        
        return {
            success: true,
            data: {
                admin_id,
                game_id,
                has_permission: hasPermission
            }
        };
    }catch(e: any){
        console.error('检查游戏权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取可管理的下级管理员列表
export const getManageableAdmins = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        // 检查是否有编辑权限
        const canEdit = await AdminModel.canEditGamePermissions(admin_id);
        if (!canEdit) {
            throw createError({
                status: 403,
                message: '无权限编辑游戏权限',
            });
        }
        
        const manageableAdmins = await AdminModel.getManageableAdmins(admin_id);
        
        return {
            success: true,
            data: manageableAdmins
        };
    }catch(e: any){
        console.error('获取可管理管理员失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 检查是否可以编辑游戏权限
export const checkEditPermission = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const canEdit = await AdminModel.canEditGamePermissions(admin_id);
        
        return {
            success: true,
            data: {
                can_edit: canEdit
            }
        };
    }catch(e: any){
        console.error('检查编辑权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 同步所有代理的游戏权限
export const syncAllGamePermissions = async(evt:H3Event) => {
    try{
        await AdminModel.syncAllGamePermissions();
        
        return {
            success: true,
            message: '所有代理的游戏权限同步完成'
        };
    }catch(e: any){
        console.error('同步游戏权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 从所有代理中移除指定游戏权限
// 修改管理员密码
// 已禁用：修改管理员密码功能
export const changePassword = async(evt:H3Event) => {
    throw createError({ status: 403, statusMessage: 'Forbidden' });
}

// 更新管理员个人信息
export const updateProfile = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id, qq_account, tg_account } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const success = await AdminModel.updateProfile(admin_id, {
            qq_account: qq_account || '',
            tg_account: tg_account || ''
        });
        
        if (success) {
            return {
                success: true,
                message: '个人信息更新成功'
            };
        } else {
            throw createError({
                status: 500,
                message: '个人信息更新失败',
            });
        }
    }catch(e: any){
        console.error('更新个人信息失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取管理员个人详细信息
export const getProfile = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const profile = await AdminModel.getAdminProfile(admin_id);
        
        if (profile) {
            return {
                success: true,
                data: profile
            };
        } else {
            throw createError({
                status: 404,
                message: '管理员不存在',
            });
        }
    }catch(e: any){
        console.error('获取个人信息失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

export const removeGameFromAllAdmins = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { game_id } = body;
        
        if (!game_id) {
            throw createError({
                status: 400,
                message: '缺少游戏ID',
            });
        }
        
        await AdminModel.removeGameFromAllAdmins(game_id);
        
        return {
            success: true,
            message: `已从所有代理中移除游戏权限: ${game_id}`
        };
    }catch(e: any){
        console.error('移除游戏权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 创建代理
export const createPromoter = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { 
            name, 
            password, 
            level, 
            channel_code, 
            phone, 
            settlement_type, 
            divide_rate, 
            tg_account, 
            qq_account, 
            email,
            parent_admin_id,
            parent_channel_code,
            current_admin_id
        } = body;
        
        // 验证必填项
        if (!name || !password || !channel_code) {
            throw createError({
                status: 400,
                message: '缺少必填项：代理名称、密码、渠道代码',
            });
        }
        
        // 验证等级和上级选择
        if (level >= 2 && level <= 4 && !parent_admin_id) {
            throw createError({
                status: 400,
                message: '创建2-4级代理时必须选择上级代理',
            });
        }
        
        // 获取当前操作者信息
        const currentAdminId = current_admin_id;
        let currentAdmin = null;
        if (currentAdminId) {
            currentAdmin = await AdminModel.getAdminWithPermissions(currentAdminId);
        }
        
        // 验证分成比例权限
        if (divide_rate !== undefined && divide_rate > 0) {
            if (!currentAdmin) {
                throw createError({
                    status: 403,
                    message: '无法获取当前用户信息',
                });
            }
            
            // 超级管理员可以设置任意比例
            if (currentAdmin.level !== 0) {
                const currentDivideRate = currentAdmin.divide_rate || 0;
                const maxAllowedRate = Math.max(0, currentDivideRate - 5);
                
                if (divide_rate > maxAllowedRate) {
                    throw createError({
                        status: 400,
                        message: `分成比例不能超过您的比例减5个点，最大允许设置: ${maxAllowedRate}%`,
                    });
                }
            }
        }
        
        // 验证渠道代码格式和唯一性
        const { validateChannelCode } = await import('../utils/channelCodeValidator');
        const channelValidation = await validateChannelCode(channel_code);
        
        if (!channelValidation.valid) {
            throw createError({
                status: 400,
                message: channelValidation.message,
            });
        }
        
        // 使用清理后的渠道代码
        const cleanChannelCode = channelValidation.cleanCode || channel_code.trim();
        
        // 获取创建者的游戏权限，让新创建的代理继承
        let inheritedGameIds = [];
        if (currentAdmin && currentAdmin.allowed_game_ids) {
            inheritedGameIds = Array.isArray(currentAdmin.allowed_game_ids) 
                ? currentAdmin.allowed_game_ids 
                : JSON.parse(currentAdmin.allowed_game_ids || '[]');
        }

        // 唯一性重查：name 与 channel_code
        const dupByName = await sql({
            query: 'SELECT id FROM Admins WHERE name = ? LIMIT 1',
            values: [name]
        }) as any[];
        if (dupByName.length > 0) {
            throw createError({ status: 400, message: '代理名称已存在' });
        }

        const dupByChannel = await sql({
            query: 'SELECT id FROM Admins WHERE channel_code = ? LIMIT 1',
            values: [cleanChannelCode]
        }) as any[];
        if (dupByChannel.length > 0) {
            throw createError({ status: 400, message: '渠道代码已存在' });
        }

        // 创建管理员数据（密码使用 md5(md5(password)+salt)）
        const SALT = '1a!@#33er4r';
        const inner = crypto.createHash('md5').update(password).digest('hex');
        const finalHash = crypto.createHash('md5').update(inner + SALT).digest('hex');
        const adminData = {
            name,
            password: finalHash,
            level: level || 1,
            channel_code: cleanChannelCode, // 使用清理后的渠道代码
            phone: phone || '',
            settlement_type: settlement_type || 0,
            settlement_amount: 0,
            settlement_amount_available: 0,
            divide_rate: divide_rate || 0,
            tg_account: tg_account || '',
            qq_account: qq_account || '',
            email: email || '',
            is_active: true, // 新创建的管理员默认启用
            allowed_channel_codes: [],
            allowed_game_ids: inheritedGameIds // 继承创建者的游戏权限
        };
        
        // 插入管理员记录
        const result = await AdminModel.insert(adminData) as any;
        const newAdminId = result.insertId;

        // 📝 记录创建日志
        try {
            const { insertGmOperationLog } = await import('../model/gmOperationLogs');
            
            // 获取客户端 IP
            const headers = getHeaders(evt);
            const clientIp = (headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                             (headers['x-real-ip'] as string) || 
                             evt.node.req.socket.remoteAddress || 'unknown';

            await insertGmOperationLog({
                op_type: 'create_admin',
                server: 'system',
                player_id: '0',
                player_name: 'system',
                open_id: 'system',
                request_params: { 
                    new_admin_name: name, 
                    new_admin_level: level, 
                    new_channel_code: cleanChannelCode,
                    divide_rate: divide_rate,
                    client_ip: clientIp // 记录 IP 到请求参数中
                },
                response_result: { success: true, new_admin_id: newAdminId },
                success: 1,
                admin_id: currentAdmin?.id || 0,
                admin_name: currentAdmin?.name || 'unknown'
            });
        } catch (logError) {
            console.error('记录创建管理员日志失败:', logError);
        }
        
        // 如果有上级代理，创建代理关系
        let resolvedParentChannelCode = parent_channel_code;
        
        // 如果没有传递parent_channel_code但有parent_admin_id，则从数据库获取
        if (parent_admin_id && !resolvedParentChannelCode) {
            const parentAdmin = await AdminModel.getAdminWithPermissions(parent_admin_id);
            if (parentAdmin && parentAdmin.channel_code) {
                resolvedParentChannelCode = parentAdmin.channel_code;
            }
        }
        
        if (resolvedParentChannelCode && channel_code) {
            try {
                const AgentRelationships = await import('../model/agentRelationships');
                
                // 检查关系是否已存在
                const existingRelations = await AgentRelationships.findByChildChannelCode(channel_code);
                if (existingRelations.length > 0) {
                    // 代理关系已存在，跳过创建
                } else {
                    const result = await AgentRelationships.insert({
                        parent_channel_code: resolvedParentChannelCode,
                        child_channel_code: channel_code
                    });
                }
            } catch (relationshipError) {
                console.error('创建代理关系失败:', relationshipError);
                // 代理关系创建失败不影响管理员创建，继续执行
            }
        }
        
        // 刷新新代理的权限
        try {
            await AdminModel.refreshAdminPermissions(newAdminId);
        } catch (permissionError) {
            console.error('刷新新代理权限失败:', permissionError);
        }
        
        // 向上级联刷新所有上级代理的权限
        if (channel_code) {
            try {
                await AdminModel.cascadeRefreshUpwardPermissions(channel_code);
                console.log(`已完成向上级联刷新权限，新代理渠道: ${channel_code}`);
            } catch (permissionError) {
                console.error('向上级联刷新权限失败:', permissionError);
            }
        }
        
        return {
            success: true,
            message: '代理创建成功',
            data: {
                id: newAdminId,
                name,
                channel_code,
                level
            }
        };
    }catch(e: any){
        console.error('创建代理失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 更新代理信息
export const updatePromoter = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { 
            id,
            name, 
            password, 
            level, 
            channel_code, 
            phone, 
            settlement_type, 
            divide_rate, 
            tg_account, 
            qq_account, 
            email,
            current_admin_id
        } = body;
        
        if (!id) {
            throw createError({
                status: 400,
                message: '缺少代理ID',
            });
        }
        
        // 验证必填项
        if (!name || !channel_code) {
            throw createError({
                status: 400,
                message: '缺少必填项：代理名称、渠道代码',
            });
        }
        
        // 获取当前操作者信息
        const currentAdminId = current_admin_id;
        let currentAdmin = null;
        if (currentAdminId) {
            currentAdmin = await AdminModel.getAdminWithPermissions(currentAdminId);
            console.log(`更新代理 - 获取当前操作者信息: ID=${currentAdminId}, Level=${currentAdmin?.level}, DivideRate=${currentAdmin?.divide_rate}`);
        }
        
        // 验证分成比例权限
        if (divide_rate !== undefined && divide_rate > 0) {
            if (!currentAdmin) {
                throw createError({
                    status: 403,
                    message: '无法获取当前用户信息',
                });
            }
            
            // 超级管理员可以设置任意比例
            if (currentAdmin.level !== 0) {
                const currentDivideRate = currentAdmin.divide_rate || 0;
                const maxAllowedRate = Math.max(0, currentDivideRate - 5);
                
                if (divide_rate > maxAllowedRate) {
                    throw createError({
                        status: 400,
                        message: `分成比例不能超过您的比例减5个点，最大允许设置: ${maxAllowedRate}%`,
                    });
                }
            }
        }
        
        // 检查代理是否存在
        const existingAdmin = await AdminModel.getAdminWithPermissions(id);
        if (!existingAdmin) {
            throw createError({
                status: 404,
                message: '代理不存在',
            });
        }
        
        // 验证渠道代码格式和唯一性（排除当前代理）
        const { validateChannelCode } = await import('../utils/channelCodeValidator');
        const channelValidation = await validateChannelCode(channel_code, id);
        
        if (!channelValidation.valid) {
            throw createError({
                status: 400,
                message: channelValidation.message,
            });
        }
        
        // 使用清理后的渠道代码
        const cleanChannelCode = channelValidation.cleanCode || channel_code.trim();
        
        // 准备更新数据
        const updateData: any = {
            name,
            level: level !== undefined ? level : existingAdmin.level,
            channel_code: cleanChannelCode, // 使用清理后的渠道代码
            phone: phone || '',
            settlement_type: settlement_type !== undefined ? settlement_type : existingAdmin.settlement_type,
            divide_rate: divide_rate !== undefined ? divide_rate : existingAdmin.divide_rate,
            tg_account: tg_account || '',
            qq_account: qq_account || '',
            email: email || ''
        };
        
        // 如果提供了密码，则更新密码
        if (password && password.trim() !== '') {
            updateData.password = password;
        }
        
        // 更新管理员信息
        await AdminModel.updateAdmin(id, updateData);
        
        // 刷新权限
        try {
            await AdminModel.refreshAdminPermissions(id);
        } catch (permissionError) {
            console.error('刷新权限失败:', permissionError);
        }
        
        return {
            success: true,
            message: '代理信息更新成功',
            data: {
                id,
                name,
                channel_code,
                level: updateData.level
            }
        };
    }catch(e: any){
        console.error('更新代理失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 删除代理
export const deletePromoter = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { id, channel_code } = body;
        
        if (!id) {
            throw createError({
                status: 400,
                message: '缺少代理ID',
            });
        }
        
        // 检查代理是否存在
        const existingAdmin = await AdminModel.getAdminWithPermissions(id);
        if (!existingAdmin) {
            throw createError({
                status: 404,
                message: '代理不存在',
            });
        }
        
        // 检查是否为超级管理员（超级管理员不能被删除）
        if (existingAdmin.level === 0) {
            throw createError({
                status: 403,
                message: '超级管理员不能被删除',
            });
        }
        
        // 删除相关的代理关系
        if (channel_code) {
            try {
                const AgentRelationships = await import('../model/agentRelationships');
                
                // 删除作为上级的关系
                const childRelations = await AgentRelationships.findByParentChannelCode(channel_code);
                for (const relation of childRelations) {
                    await AgentRelationships.remove(relation.id!);
                    console.log(`删除代理关系: ${channel_code} -> ${relation.child_channel_code}`);
                }
                
                // 删除作为下级的关系
                const parentRelations = await AgentRelationships.findByChildChannelCode(channel_code);
                for (const relation of parentRelations) {
                    await AgentRelationships.remove(relation.id!);
                    console.log(`删除代理关系: ${relation.parent_channel_code} -> ${channel_code}`);
                }
            } catch (relationshipError) {
                console.error('删除代理关系失败:', relationshipError);
                // 代理关系删除失败不阻止管理员删除，继续执行
            }
        }
        
        // 删除管理员记录
        await AdminModel.remove(id);
        
        // 刷新其他管理员的权限（因为代理关系变化）
        try {
            await AdminModel.refreshAllAdminPermissions();
        } catch (permissionError) {
            console.error('刷新权限失败:', permissionError);
        }
        
        return {
            success: true,
            message: '代理删除成功',
            data: {
                id,
                name: existingAdmin.name,
                channel_code: existingAdmin.channel_code
            }
        };
    }catch(e: any){
        console.error('删除代理失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 切换代理状态
export const togglePromoterStatus = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { id, is_active } = body;
        
        if (!id) {
            throw createError({
                status: 400,
                message: '缺少代理ID',
            });
        }
        
        if (is_active === undefined) {
            throw createError({
                status: 400,
                message: '缺少状态参数',
            });
        }
        
        // 检查代理是否存在
        const existingAdmin = await AdminModel.getAdminWithPermissions(id);
        if (!existingAdmin) {
            throw createError({
                status: 404,
                message: '代理不存在',
            });
        }
        
        // 切换状态
        await AdminModel.toggleAdminStatus(id, is_active);
        
        return {
            success: true,
            message: `代理状态已${is_active ? '启用' : '禁用'}`,
            data: {
                id,
                name: existingAdmin.name,
                is_active
            }
        };
    }catch(e: any){
        console.error('切换代理状态失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 检查和修复代理关系
export const checkAndFixAgentRelationships = async(evt:H3Event) => {
    try{
        console.log('开始检查和修复代理关系...');
        
        // 获取所有管理员
        const allAdmins = await AdminModel.read();
        const AgentRelationships = await import('../model/agentRelationships');
        
        console.log(`当前管理员数量: ${allAdmins.length}`);
        
        // 显示当前管理员信息
        allAdmins.forEach(admin => {
            console.log(`管理员: ${admin.name} (ID: ${admin.id}, Channel: ${admin.channel_code}, Level: ${admin.level})`);
        });
        
        // 获取现有的代理关系
        const existingRelations = await AgentRelationships.read();
        console.log(`现有代理关系数量: ${existingRelations.length}`);
        
        existingRelations.forEach(relation => {
            console.log(`现有关系: ${relation.parent_channel_code} -> ${relation.child_channel_code}`);
        });
        
        // 根据初始数据建立正确的代理关系
        const expectedRelations = [
            { parent_channel_code: 'channelB', child_channel_code: 'channelC' },
            { parent_channel_code: 'channelB', child_channel_code: 'channelD' },
            { parent_channel_code: 'channelC', child_channel_code: 'channelE' }
        ];
        
        console.log('期望的代理关系:');
        expectedRelations.forEach(relation => {
            console.log(`期望关系: ${relation.parent_channel_code} -> ${relation.child_channel_code}`);
        });
        
        // 检查并创建缺失的关系
        let createdCount = 0;
        for (const expectedRelation of expectedRelations) {
            const exists = existingRelations.some(existing => 
                existing.parent_channel_code === expectedRelation.parent_channel_code &&
                existing.child_channel_code === expectedRelation.child_channel_code
            );
            
            if (!exists) {
                // 验证渠道代码是否存在
                const parentExists = allAdmins.some(admin => admin.channel_code === expectedRelation.parent_channel_code);
                const childExists = allAdmins.some(admin => admin.channel_code === expectedRelation.child_channel_code);
                
                if (parentExists && childExists) {
                    try {
                        await AgentRelationships.insert(expectedRelation);
                        console.log(`✓ 创建代理关系: ${expectedRelation.parent_channel_code} -> ${expectedRelation.child_channel_code}`);
                        createdCount++;
                    } catch (error) {
                        console.error(`✗ 创建代理关系失败: ${expectedRelation.parent_channel_code} -> ${expectedRelation.child_channel_code}`, error);
                    }
                } else {
                    console.log(`⚠ 跳过创建关系(渠道不存在): ${expectedRelation.parent_channel_code} -> ${expectedRelation.child_channel_code}`);
                }
            } else {
                console.log(`✓ 关系已存在: ${expectedRelation.parent_channel_code} -> ${expectedRelation.child_channel_code}`);
            }
        }
        
        // 重新获取更新后的关系
        const updatedRelations = await AgentRelationships.read();
        console.log(`修复后代理关系数量: ${updatedRelations.length}`);
        
        // 测试代理关系查询
        console.log('\n测试代理关系查询:');
        for (const admin of allAdmins.filter(a => a.channel_code)) {
            if (admin.channel_code) {
                const children = await AgentRelationships.getAllChildChannelCodes(admin.channel_code);
                const parent = await AgentRelationships.getParentChannelCode(admin.channel_code);
                console.log(`${admin.channel_code} - 下级: [${children.join(', ')}], 上级: ${parent || '无'}`);
            }
        }
        
        // 检查并设置初始游戏权限（如果下级代理没有权限的话）
        console.log('\n检查并设置初始游戏权限:');
        const channelPermissions = {
            'channelB': [1, 2, 3], // agent1 有游戏1,2,3
            'channelC': [1, 3],    // agent2 有游戏1,3  
            'channelD': [1, 2],    // agent3 有游戏1,2
            'channelE': [4, 5]     // agent4 有游戏4,5
        };
        
        let permissionUpdateCount = 0;
        for (const admin of allAdmins.filter(a => a.channel_code)) {
            const adminWithPermissions = await AdminModel.getAdminWithPermissions(admin.id);
            if (adminWithPermissions) {
                const currentPermissions = adminWithPermissions.allowed_game_ids || [];
                const expectedPermissions = channelPermissions[admin.channel_code as keyof typeof channelPermissions] || [];
                
                console.log(`${admin.channel_code} - 当前权限: [${currentPermissions.join(', ')}], 期望权限: [${expectedPermissions.join(', ')}]`);
                
                if (currentPermissions.length === 0 && expectedPermissions.length > 0) {
                    await AdminModel.updateGameIds(admin.id, expectedPermissions);
                    console.log(`✓ 已设置 ${admin.channel_code} 的初始游戏权限: [${expectedPermissions.join(', ')}]`);
                    permissionUpdateCount++;
                }
            }
        }
        
        return {
            success: true,
            message: `代理关系检查完成，创建了 ${createdCount} 个新关系，设置了 ${permissionUpdateCount} 个代理的初始权限`,
            data: {
                total_admins: allAdmins.length,
                existing_relations: existingRelations.length,
                updated_relations: updatedRelations.length,
                created_relations: createdCount,
                permission_updates: permissionUpdateCount
            }
        };
    }catch(e: any){
        console.error('检查代理关系失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 创建游戏
export const createGame = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { 
            game_name, 
            icon_url, 
            supported_devices, 
            register_url, 
            ios_download_url, 
            android_download_url, 
            description,
            admin_id 
        } = body;
        
        if (!admin_id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        // 检查权限 - 只有超级管理员能添加游戏
        const AdminModel = await import('../model/admin');
        const currentAdmin = await AdminModel.getAdminWithPermissions(admin_id);
        
        if (!currentAdmin || currentAdmin.level !== 0) {
            throw createError({
                status: 403,
                message: '只有超级管理员可以添加游戏',
            });
        }
        
        // 验证必填项
        if (!game_name || !supported_devices) {
            throw createError({
                status: 400,
                message: '游戏名称和支持设备为必填项',
            });
        }
        
        // 检查游戏名称是否已存在
        const GamesModel = await import('../model/games');
        const existingGame = await GamesModel.findByGameName(game_name);
        if (existingGame) {
            throw createError({
                status: 400,
                message: '游戏名称已存在',
            });
        }
        
        // 创建游戏
        await GamesModel.insert({
            game_name,
            icon_url: icon_url || '',
            supported_devices,
            register_url: register_url || '',
            ios_download_url: ios_download_url || '',
            android_download_url: android_download_url || '',
            description: description || '',
            is_active: 1
        });
        
        return {
            success: true,
            message: '游戏创建成功'
        };
    }catch(e: any){
        console.error('创建游戏失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 更新游戏信息
export const updateGame = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { 
            id,
            game_name, 
            icon_url, 
            supported_devices, 
            register_url, 
            ios_download_url, 
            android_download_url, 
            description,
            admin_id 
        } = body;
        
        if (!admin_id || !id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID或游戏ID',
            });
        }
        
        // 检查权限 - 只有超级管理员能编辑游戏
        const AdminModel = await import('../model/admin');
        const currentAdmin = await AdminModel.getAdminWithPermissions(admin_id);
        
        if (!currentAdmin || currentAdmin.level !== 0) {
            throw createError({
                status: 403,
                message: '只有超级管理员可以编辑游戏',
            });
        }
        
        // 检查游戏是否存在
        const GamesModel = await import('../model/games');
        const existingGame = await GamesModel.findById(id);
        if (!existingGame) {
            throw createError({
                status: 404,
                message: '游戏不存在',
            });
        }
        
        // 如果修改了游戏名称，检查是否与其他游戏重名
        if (game_name && game_name !== existingGame.game_name) {
            const duplicateGame = await GamesModel.findByGameName(game_name);
            if (duplicateGame) {
                throw createError({
                    status: 400,
                    message: '游戏名称已被其他游戏使用',
                });
            }
        }
        
        // 更新游戏信息
        await GamesModel.update(id, {
            game_name,
            icon_url,
            supported_devices,
            register_url,
            ios_download_url,
            android_download_url,
            description
        });
        
        return {
            success: true,
            message: '游戏信息更新成功'
        };
    }catch(e: any){
        console.error('更新游戏失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 删除游戏
export const deleteGame = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { id, admin_id } = body;
        
        if (!admin_id || !id) {
            throw createError({
                status: 400,
                message: '缺少管理员ID或游戏ID',
            });
        }
        
        // 检查权限 - 只有超级管理员能删除游戏
        const AdminModel = await import('../model/admin');
        const currentAdmin = await AdminModel.getAdminWithPermissions(admin_id);
        
        if (!currentAdmin || currentAdmin.level !== 0) {
            throw createError({
                status: 403,
                message: '只有超级管理员可以删除游戏',
            });
        }
        
        // 检查游戏是否存在
        const GamesModel = await import('../model/games');
        const existingGame = await GamesModel.findById(id);
        if (!existingGame) {
            throw createError({
                status: 404,
                message: '游戏不存在',
            });
        }
        
        // 删除游戏前，先从所有管理员的权限中移除该游戏
        await AdminModel.removeGameFromAllAdmins(id);
        
        // 删除游戏
        await GamesModel.remove(id);
        
        return {
            success: true,
            message: '游戏删除成功'
        };
    }catch(e: any){
        console.error('删除游戏失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 切换游戏状态
export const toggleGameStatus = async(evt:H3Event) => {
    try{
        const body = await readBody(evt);
        const { id, is_active, admin_id } = body;
        
        if (!admin_id || !id || is_active === undefined) {
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        // 检查权限 - 只有超级管理员能切换游戏状态
        const AdminModel = await import('../model/admin');
        const currentAdmin = await AdminModel.getAdminWithPermissions(admin_id);
        
        if (!currentAdmin || currentAdmin.level !== 0) {
            throw createError({
                status: 403,
                message: '只有超级管理员可以切换游戏状态',
            });
        }
        
        // 检查游戏是否存在
        const GamesModel = await import('../model/games');
        const existingGame = await GamesModel.findById(id);
        if (!existingGame) {
            throw createError({
                status: 404,
                message: '游戏不存在',
            });
        }
        
        // 更新游戏状态
        await GamesModel.updateStatus(id, is_active ? 1 : 0);
        
        return {
            success: true,
            message: `游戏已${is_active ? '启用' : '禁用'}`
        };
    }catch(e: any){
        console.error('切换游戏状态失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 设置初始游戏权限
export const setInitialGamePermissions = async(evt:H3Event) => {
    try{
        console.log('开始设置初始游戏权限...');
        
        // 预设的权限配置
        const channelPermissions = {
            'channelB': [1, 2, 3], // agent1 有游戏1,2,3
            'channelC': [1, 3],    // agent2 有游戏1,3  
            'channelD': [1, 2],    // agent3 有游戏1,2
            'channelE': [4, 5]     // agent4 有游戏4,5
        };
        
        const allAdmins = await AdminModel.read();
        let permissionUpdateCount = 0;
        
        for (const admin of allAdmins.filter(a => a.channel_code)) {
            if (!admin.channel_code) continue;
            
            const adminWithPermissions = await AdminModel.getAdminWithPermissions(admin.id);
            if (adminWithPermissions) {
                const currentPermissions = adminWithPermissions.allowed_game_ids || [];
                const expectedPermissions = channelPermissions[admin.channel_code as keyof typeof channelPermissions] || [];
                
                console.log(`${admin.channel_code} (${admin.name}) - 当前权限: [${currentPermissions.join(', ')}], 设置权限: [${expectedPermissions.join(', ')}]`);
                
                if (expectedPermissions.length > 0) {
                    await AdminModel.updateGameIds(admin.id, expectedPermissions);
                    console.log(`✓ 已设置 ${admin.channel_code} (${admin.name}) 的游戏权限: [${expectedPermissions.join(', ')}]`);
                    permissionUpdateCount++;
                }
            }
        }
        
        return {
            success: true,
            message: `已为 ${permissionUpdateCount} 个代理设置初始游戏权限`,
            data: {
                permission_updates: permissionUpdateCount,
                permissions: channelPermissions
            }
        };
    }catch(e: any){
        console.error('设置初始游戏权限失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取用户登录记录
export const getUserLoginLogs = async(evt:H3Event) => {
    try{
        const query = getQuery(evt);
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const statsOnly = query.statsOnly === 'true';
        
        // 权限验证和获取允许的渠道
        let allowedChannelCodes: string[] = [];
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        if (token) {
            try {
                const adminResult = await AdminModel.getAdminWithPermissions(token);
                if (adminResult && adminResult.level > 0) {
                    // 非超级管理员需要按权限过滤
                    allowedChannelCodes = adminResult.allowed_channel_codes || [];
                    console.log(`管理员 ${adminResult.name} 的渠道权限:`, allowedChannelCodes);
                }
            } catch (error) {
                throw createError({
                   status: 403,
                   message: '权限验证失败',
                });
            }
        } else {
            throw createError({
                status: 401,
                message: '未提供认证token',
            });
        }
        
        const filters: any = {};
        if (query.username) filters.username = query.username as string;
        if (query.sub_user_name) filters.sub_user_name = query.sub_user_name as string;
        if (query.game_code) filters.game_code = query.game_code as string;
        if (query.imei) filters.imei = query.imei as string;
        if (query.channel_code) filters.channel_code = query.channel_code as string;
        if (query.startDate) filters.startDate = query.startDate as string;
        if (query.endDate) filters.endDate = query.endDate as string;
        
        const UserLoginLogsModel = await import('../model/userLoginLogs');
        
        // 如果只需要统计数据
        if (statsOnly) {
            const stats = await UserLoginLogsModel.getLoginStatsForDateRange(filters.startDate, filters.endDate, allowedChannelCodes);
            return {
                success: true,
                data: {
                    totalLogs: stats.total_logins,
                    uniqueUsers: stats.unique_users
                }
            };
        }
        
        // 获取完整的日志数据
        const [logs, total] = await Promise.all([
            UserLoginLogsModel.getLoginLogs(page, pageSize, filters, allowedChannelCodes),
            UserLoginLogsModel.getLoginLogsCount(filters, allowedChannelCodes)
        ]);
        
        return {
            success: true,
            data: {
                logs,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        };
    }catch(e: any){
        console.error('获取用户登录记录失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取今日登录统计
export const getTodayLoginStats = async(evt:H3Event) => {
    try{
        const UserLoginLogsModel = await import('../model/userLoginLogs');
        const stats = await UserLoginLogsModel.getTodayLoginStats();
        
        return {
            success: true,
            data: stats
        };
    }catch(e: any){
        console.error('获取今日登录统计失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取下级渠道代码列表
export const getChildChannels = async(evt:H3Event) => {
    try{
        // 同时兼容 JSON body 与 query 传参，避免前端签名参数注入影响原有参数位置
        const body: any = await readBody(evt).catch(() => ({}));
        const query: any = getQuery(evt);
        const channel_code = body?.channel_code ?? query?.channel_code;
        const adminId = body?.adminId ?? query?.adminId ?? query?.admin_id;
        const parentChannelCode = body?.parentChannelCode ?? query?.parentChannelCode;
        
        // 如果有父级渠道代码，获取该渠道的下一级（二级选择框）
        if (parentChannelCode) {
            try {
                // 使用AgentRelationships表查找真正的下级渠道
                const AgentRelationships = await import('../model/agentRelationships');
                const childChannelCodes = await AgentRelationships.getDirectChildChannelCodes(parentChannelCode);
                
                if (childChannelCodes.length === 0) {
                    return {
                        success: true,
                        data: []
                    };
                }
                
                // 根据下级渠道代码获取管理员详细信息
                const channelPlaceholders = childChannelCodes.map(() => '?').join(',');
                const childAdminsResult = await sql({
                    query: `SELECT id, name, channel_code, level FROM Admins 
                            WHERE channel_code IN (${channelPlaceholders}) AND is_active = 1
                            ORDER BY name`,
                    values: childChannelCodes
                }) as any;
                
                const childChannels = childAdminsResult.map((admin: any) => ({
                    channel_code: admin.channel_code,
                    channel_name: admin.name || admin.channel_code,
                    level: admin.level
                }));
                
                return {
                    success: true,
                    data: childChannels
                };
            } catch (error) {
                console.error('查询下级渠道失败:', error);
                return {
                    success: true,
                    data: []
                };
            }
        }
        
        // 如果提供了adminId，使用allowed_channel_codes获取可查看的下级渠道（一级选择框）
        if (adminId) {
            const adminInfo = await AdminModel.getAdminWithPermissions(parseInt(adminId));
            if (!adminInfo) {
                throw createError({
                    status: 404,
                    message: '管理员不存在',
                });
            }
            
            // 根据当前级别确定直接下一级（一级选择框）
            let targetLevel: number | null = null;
            
            if (adminInfo.level === 0) {
                // 0级：直接下一级是1级
                targetLevel = 1;
            } else if (adminInfo.level === 1) {
                // 1级：直接下一级是2级
                targetLevel = 2;
            } else if (adminInfo.level === 2) {
                // 2级：直接下一级是3级
                targetLevel = 3;
            } else if (adminInfo.level === 3) {
                // 3级：直接下一级是4级
                targetLevel = 4;
            } else if (adminInfo.level === 4) {
                // 4级：没有下级
                targetLevel = null;
            }
            
            if (targetLevel === null) {
                return {
                    success: true,
                    data: []
                };
            }
            
            // 查询直接下一级的管理员
            const childAdminsResult = await sql({
                query: `SELECT id, name, channel_code, level FROM Admins 
                        WHERE level = ? AND is_active = 1 AND channel_code IS NOT NULL
                        ORDER BY name`,
                values: [targetLevel]
            }) as any;
            
            // 权限过滤逻辑
            let filteredAdmins = [];
            if (adminInfo.level === 0) {
                // 超级管理员可以看到所有该级别的代理
                filteredAdmins = childAdminsResult;
            } else {
                // 非超级管理员只能看到allowed_channel_codes中的代理
                const allowedChannels = adminInfo.allowed_channel_codes || [];
                filteredAdmins = childAdminsResult.filter((admin: any) => 
                    allowedChannels.includes(admin.channel_code)
                );
            }
            
            const childChannels = filteredAdmins.map((admin: any) => ({
                channel_code: admin.channel_code,
                channel_name: admin.name || admin.channel_code,
                level: admin.level
            }));
            
            return {
                success: true,
                data: childChannels
            };
        }
        
        // 原有逻辑：根据渠道代码获取下级渠道
        if (!channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码或级别参数',
            });
        }
        
        const AgentRelationships = await import('../model/agentRelationships');
        const childChannelCodes = await AgentRelationships.getAllChildChannelCodes(channel_code);
        
        return {
            success: true,
            data: childChannelCodes
        };
    }catch(e: any){
        console.error('获取下级渠道失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取用户注册记录
export const getUsers = async(evt:H3Event) => {
    try{
        const query = getQuery(evt);
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const statsOnly = query.statsOnly === 'true';
        
        // 权限检查 - 获取当前登录管理员的权限
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        let adminPermissions = null;
        let allowedChannelCodes: string[] = [];
        
        if (token) {
            try {
                const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
                
                if (!adminWithPermissions) {
                    throw createError({
                        status: 403,
                        message: '管理员不存在',
                    });
                }

                adminPermissions = adminWithPermissions;
                
                // 超级管理员(level 0)可以查看所有数据
                if (adminWithPermissions.level === 0) {
                    allowedChannelCodes = []; // 空数组表示无限制
                } else {
                    // 普通管理员使用 allowed_channel_codes 权限
                    allowedChannelCodes = adminWithPermissions.allowed_channel_codes || [];
                }
                
                console.log(`管理员 ${adminWithPermissions.name} 的用户数据权限:`, {
                    level: adminWithPermissions.level,
                    allowedChannelCodes: allowedChannelCodes
                });
            } catch (error) {
                console.error('用户数据权限检查失败:', error);
                throw createError({
                    status: 403,
                    message: '权限验证失败',
                });
            }
        } else {
            throw createError({
                status: 401,
                message: '未提供认证token',
            });
        }
        
        const filters: any = {};
        if (query.user_id) filters.user_id = Number(query.user_id);
        if (query.username) filters.username = query.username as string;
        if (query.iphone) filters.iphone = query.iphone as string;
        if (query.thirdparty_uid) filters.thirdparty_uid = query.thirdparty_uid as string;
        if (query.channel_code) filters.channel_code = query.channel_code as string;
        if (query.startDate) filters.startDate = query.startDate as string;
        if (query.endDate) filters.endDate = query.endDate as string;
        
        
        const UserModel = await import('../model/user');
        
        // 如果只需要统计数据
        if (statsOnly) {
            const stats = await getUserStatsForDateRange(filters.startDate, filters.endDate, allowedChannelCodes);
            return {
                success: true,
                data: {
                    todayRegisterCount: stats.today_register_count,
                    totalUsers: stats.total_users
                }
            };
        }
        
        // 获取完整的用户数据
        const [users, total] = await Promise.all([
            getUsersWithFilters(page, pageSize, filters, allowedChannelCodes),
            getUsersCount(filters, allowedChannelCodes)
        ]);
        
        return {
            success: true,
            data: {
                users,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        };
    }catch(e: any){
        console.error('获取用户注册记录失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 管理员修改用户密码
export const changeUserPassword = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const user_id = Number(body?.user_id);
        const new_password = String(body?.new_password || '');
        if (!user_id || !new_password) {
            throw createError({ status: 400, message: '缺少参数 user_id/new_password' });
        }

        // 权限校验：必须是已登录的管理员
        const authz = getHeader(evt, 'authorization');
        const adminId = authz ? parseInt(String(authz)) : NaN;
        if (isNaN(adminId)) {
            throw createError({ status: 401, message: '未提供认证token' });
        }
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        if (!admin) {
            throw createError({ status: 403, message: '管理员不存在或无权限' });
        }

        // 更新密码（以明文或后续可替换为hash）
        await sql({
            query: 'UPDATE Users SET password = ? WHERE id = ? LIMIT 1',
            values: [new_password, user_id]
        });
        return { success: true, message: '密码已更新' };
    } catch (e: any) {
        throw createError({ status: e.statusCode || 500, message: e.message || '修改密码失败' });
    }
};

// 管理员修改用户渠道
export const changeUserChannel = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const user_id = Number(body?.user_id);
        const new_channel_code = String(body?.new_channel_code || '').trim();
        if (!user_id || !new_channel_code) {
            throw createError({ status: 400, message: '缺少参数 user_id/new_channel_code' });
        }

        // 权限校验：必须是已登录的管理员
        const authz = getHeader(evt, 'authorization');
        const adminId = authz ? parseInt(String(authz)) : NaN;
        if (isNaN(adminId)) {
            throw createError({ status: 401, message: '未提供认证token' });
        }
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        if (!admin) {
            throw createError({ status: 403, message: '管理员不存在或无权限' });
        }

        // 可选校验：渠道代码必须存在于 Admins 表
        const channelRows = await sql({
            query: 'SELECT id FROM Admins WHERE channel_code = ? LIMIT 1',
            values: [new_channel_code]
        }) as any[];
        if (!channelRows.length) {
            throw createError({ status: 400, message: '渠道代码不存在' });
        }

        const result = await sql({
            query: 'UPDATE Users SET channel_code = ? WHERE id = ? LIMIT 1',
            values: [new_channel_code, user_id]
        }) as any;

        if (!result?.affectedRows) {
            throw createError({ status: 404, message: '玩家不存在或未修改' });
        }

        return { success: true, message: '渠道已更新', data: { user_id, channel_code: new_channel_code } };
    } catch (e: any) {
        throw createError({ status: e.statusCode || 500, message: e.message || '修改渠道失败' });
    }
};

// 获取可选渠道代码列表（用于下拉搜索）
export const getChannelCodeOptions = async (evt: H3Event) => {
    try {
        const authz = getHeader(evt, 'authorization');
        const adminId = authz ? parseInt(String(authz)) : NaN;
        if (isNaN(adminId)) {
            throw createError({ status: 401, message: '未提供认证token' });
        }

        const admin = await AdminModel.getAdminWithPermissions(adminId);
        if (!admin) {
            throw createError({ status: 403, message: '管理员不存在或无权限' });
        }

        const rows = await sql({
            query: `
                SELECT DISTINCT channel_code
                FROM Admins
                WHERE channel_code IS NOT NULL
                  AND channel_code <> ''
                  AND is_active = 1
                ORDER BY channel_code ASC
            `
        }) as Array<{ channel_code: string }>;

        const allCodes = rows.map(r => String(r.channel_code || '').trim()).filter(Boolean);

        // 超级管理员可见全部；其他管理员仅可见其权限范围内渠道
        if (admin.level === 0) {
            return { success: true, data: allCodes };
        }

        const allowed = new Set<string>([
            ...(admin.allowed_channel_codes || []),
            String(admin.channel_code || '').trim()
        ].filter(Boolean));
        const filtered = allCodes.filter(code => allowed.has(code));
        return { success: true, data: filtered };
    } catch (e: any) {
        throw createError({ status: e.statusCode || 500, message: e.message || '获取渠道列表失败' });
    }
};

// 管理员验证用户密码是否匹配
export const verifyUserPassword = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const user_id = Number(body?.user_id);
        const password = String(body?.password || '');
        if (!user_id || !password) {
            throw createError({ status: 400, message: '缺少参数 user_id/password' });
        }

        // 权限校验：必须是已登录的管理员
        const authz = getHeader(evt, 'authorization');
        const adminId = authz ? parseInt(String(authz)) : NaN;
        if (isNaN(adminId)) {
            throw createError({ status: 401, message: '未提供认证token' });
        }
        const admin = await AdminModel.getAdminWithPermissions(adminId);
        if (!admin) {
            throw createError({ status: 403, message: '管理员不存在或无权限' });
        }

        const rows = await sql({
            query: 'SELECT password FROM Users WHERE id = ? LIMIT 1',
            values: [user_id]
        }) as any[];

        if (!rows.length) {
            throw createError({ status: 404, message: '玩家不存在' });
        }

        const matched = String(rows[0].password || '') === password;
        return { success: true, matched, message: matched ? '密码正确' : '密码不匹配' };
    } catch (e: any) {
        throw createError({ status: e.statusCode || 500, message: e.message || '验证密码失败' });
    }
};

// 获取用户列表（带筛选和分页）
const getUsersWithFilters = async (page: number, pageSize: number, filters: any, allowedChannelCodes: string[] = []) => {
    const offset = (page - 1) * pageSize;
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.username) {
        whereConditions.push('username LIKE ?');
        values.push(`%${filters.username}%`);
    }
    
    if (filters.iphone) {
        whereConditions.push('iphone LIKE ?');
        values.push(`%${filters.iphone}%`);
    }
    
    if (filters.thirdparty_uid) {
        whereConditions.push('thirdparty_uid LIKE ?');
        values.push(`%${filters.thirdparty_uid}%`);
    }
    
    if (filters.channel_code) {
        whereConditions.push('channel_code = ?');
        values.push(filters.channel_code);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = 'SELECT id, username, iphone, thirdparty_uid, channel_code, game_code, platform_coins, status, created_at FROM Users';
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    values.push(pageSize, offset);
    
    const result = await sql({
        query: query,
        values: values,
    });
    
    return result;
};

// 获取用户总数
const getUsersCount = async (filters: any, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.username) {
        whereConditions.push('username LIKE ?');
        values.push(`%${filters.username}%`);
    }
    
    if (filters.iphone) {
        whereConditions.push('iphone LIKE ?');
        values.push(`%${filters.iphone}%`);
    }
    
    if (filters.thirdparty_uid) {
        whereConditions.push('thirdparty_uid LIKE ?');
        values.push(`%${filters.thirdparty_uid}%`);
    }
    
    if (filters.channel_code) {
        whereConditions.push('channel_code = ?');
        values.push(filters.channel_code);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = 'SELECT COUNT(*) as total FROM Users';
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    const result = await sql({
        query: query,
        values: values,
    }) as any;
    
    return result[0].total;
};

// 获取指定日期范围的用户统计
const getUserStatsForDateRange = async (startDate?: string, endDate?: string, allowedChannelCodes: string[] = []) => {
    const today = getChinaDateString();
    
    // 今日注册统计
    let todayQuery = `SELECT COUNT(*) as today_register_count FROM Users WHERE DATE(created_at) = ?`;
    let todayValues = [today];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        todayQuery += ` AND channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`;
        todayValues.push(...allowedChannelCodes);
    }
    
    const todayResult = await sql({
        query: todayQuery,
        values: todayValues,
    }) as any;
    
    // 总用户数
    let totalQuery = 'SELECT COUNT(*) as total_users FROM Users';
    let totalValues: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        totalQuery += ` WHERE channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`;
        totalValues.push(...allowedChannelCodes);
    }
    
    const totalResult = await sql({
        query: totalQuery,
        values: totalValues,
    }) as any;
    
    return {
        today_register_count: todayResult[0].today_register_count,
        total_users: totalResult[0].total_users
    };
};

// 获取充值记录
// 获取最近7天各支付渠道的收款统计
export const getChannelPaymentStats = async (evt: H3Event) => {
    try {
        const { gatewayParamSets } = await import('../utils/paymentGateways');
        
        // 计算最近7天的日期范围
        const endDate = getChinaDateString();
        const startDate = getChinaDateStringDaysAgo(6); // 包含今天在内的最近7天

        // 查询 SQL：按日期和渠道 ID 分组统计成功订单金额
        const query = `
            SELECT 
                DATE(created_at) as stat_date,
                payment_id,
                COUNT(*) as count,
                SUM(amount) as amount
            FROM PaymentRecords
            WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? 
            AND payment_status = 3
            AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
            GROUP BY stat_date, payment_id
            ORDER BY stat_date DESC, payment_id ASC
        `;

        const statsRows = await sql({
            query,
            values: [startDate, endDate]
        }) as any[];

        // 整理数据格式
        const result: Record<string, any> = {};
        
        // 生成最近7天的日期列表作为索引
        const dateList: string[] = [];
        for (let i = 0; i < 7; i++) {
            dateList.push(getChinaDateStringDaysAgo(i));
        }

        // 初始化结果
        statsRows.forEach(row => {
            const date = row.stat_date instanceof Date
                ? convertToChinaDateString(row.stat_date)
                : formatDateToString(row.stat_date);
            const channelId = String(row.payment_id);
            const channelInfo = gatewayParamSets[channelId] || { name: `渠道${channelId}` };
            const channelName = channelInfo.remark || channelInfo.name || `渠道${channelId}`;

            if (!result[channelId]) {
                result[channelId] = {
                    id: channelId,
                    name: channelName,
                    totalAmount: 0,
                    totalCount: 0,
                    daily: {}
                };
            }

            result[channelId].daily[date] = {
                amount: parseFloat(row.amount || 0).toFixed(2),
                count: row.count || 0
            };
            result[channelId].totalAmount += parseFloat(row.amount || 0);
            result[channelId].totalCount += row.count || 0;
        });

        // 转换为数组并补充缺失日期
        const finalData = Object.values(result).map((channel: any) => {
            const dailyStats = dateList.map(date => ({
                date,
                amount: channel.daily[date]?.amount || '0.00',
                count: channel.daily[date]?.count || 0
            }));
            
            return {
                ...channel,
                totalAmount: channel.totalAmount.toFixed(2),
                daily: dailyStats
            };
        });

        return {
            success: true,
            data: {
                dates: dateList,
                channels: finalData
            }
        };
    } catch (error: any) {
        console.error('获取渠道统计失败:', error);
        throw createError({
            status: 500,
            message: error.message || '获取统计失败'
        });
    }
};

export const getPaymentRecords = async(evt:H3Event) => {
    try{
        const query = getQuery(evt);
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const statsOnly = query.statsOnly === 'true';
        
        // 权限检查 - 获取当前登录管理员的权限
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        let adminPermissions = null;
        let allowedChannelCodes: string[] = [];
        
        if (token) {
            try {
                const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
                
                if (!adminWithPermissions) {
                    throw createError({
                        status: 403,
                        message: '管理员不存在',
                    });
                }

                adminPermissions = adminWithPermissions;
                
                // 超级管理员(level 0)可以查看所有数据
                if (adminWithPermissions.level === 0) {
                    allowedChannelCodes = []; // 空数组表示无限制
                } else {
                    // 普通管理员使用 allowed_channel_codes 权限
                    allowedChannelCodes = adminWithPermissions.allowed_channel_codes || [];
                }
                
                console.log(`管理员 ${adminWithPermissions.name} 的支付数据权限:`, {
                    level: adminWithPermissions.level,
                    allowedChannelCodes: allowedChannelCodes
                });
            } catch (error) {
                console.error('支付数据权限检查失败:', error);
                throw createError({
                    status: 403,
                    message: '权限验证失败',
                });
            }
        } else {
            throw createError({
                status: 401,
                message: '未提供认证token',
            });
        }
        
        const filters: any = {};
        if (query.transaction_id) filters.transaction_id = query.transaction_id as string;
        if (query.user_id) filters.user_id = query.user_id as string;
        if (query.mch_order_id) filters.mch_order_id = query.mch_order_id as string;
        if (query.payment_status) filters.payment_status = query.payment_status as string;
        if (query.payment_method) filters.payment_method = query.payment_method as string;
        if (query.game_id) filters.game_id = query.game_id as string;
        if (query.level1_agent) filters.level1_agent = query.level1_agent as string;
        if (query.level2_agent) filters.level2_agent = query.level2_agent as string;
        if (query.startDate) filters.startDate = query.startDate as string;
        if (query.endDate) filters.endDate = query.endDate as string;
        
        // 如果只需要统计数据
        if (statsOnly) {
            const [todayStats, queryStats] = await Promise.all([
                getPaymentStatsForDateRange(filters.startDate, filters.endDate, true, null, allowedChannelCodes), // 今日统计
                getPaymentStatsForDateRange(filters.startDate, filters.endDate, false, filters, allowedChannelCodes) // 查询统计
            ]);
            return {
                success: true,
                data: {
                    ...todayStats,
                    ...queryStats
                }
            };
        }
        
        // 获取完整的充值记录数据
        const [payments, total, currentQueryStats] = await Promise.all([
            getPaymentRecordsWithFilters(page, pageSize, filters, allowedChannelCodes),
            getPaymentRecordsCount(filters, allowedChannelCodes),
            getCurrentQueryStats(filters, allowedChannelCodes)
        ]);
        
        return {
            success: true,
            data: {
                payments,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                },
                currentQueryStats
            }
        };
    }catch(e: any){
        console.error('获取充值记录失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 支付方式筛选统一处理（兼容中文名称和代码）
const applyPaymentMethodFilter = (filters: any, whereConditions: string[], values: any[]) => {
    if (!filters.payment_method) return;
    const method = String(filters.payment_method).trim();
    if (!method) return;

    console.log('筛选支付方式:', method);

    if (method === '支付宝+微信') {
        // 联合查询：支付宝+微信
        whereConditions.push('(pr.payment_way LIKE ? OR pr.payment_way LIKE ? OR pr.payment_way = ? OR pr.payment_way = ? OR pr.payment_way = ? OR pr.payment_way = ?)');
        values.push('%支付宝%', '%微信%', '支付宝', '微信', 'zfb', 'wx');
        return;
    }

    if (method === '支付宝') {
        // 兼容支付宝中文和代码
        whereConditions.push('(pr.payment_way LIKE ? OR pr.payment_way = ? OR pr.payment_way = ?)');
        values.push('%支付宝%', '支付宝', 'zfb');
        return;
    }

    if (method === '微信') {
        // 兼容微信中文和代码
        whereConditions.push('(pr.payment_way LIKE ? OR pr.payment_way = ? OR pr.payment_way = ?)');
        values.push('%微信%', '微信', 'wx');
        return;
    }

    // 其他方式：默认模糊 + 精确
    whereConditions.push('(pr.payment_way LIKE ? OR pr.payment_way = ?)');
    values.push(`%${method}%`, method);
};

// 获取充值记录列表（带筛选和分页）
const getPaymentRecordsWithFilters = async (page: number, pageSize: number, filters: any, allowedChannelCodes: string[] = []) => {
    const offset = (page - 1) * pageSize;
    
    console.log('getPaymentRecordsWithFilters 参数:', { page, pageSize, filters, allowedChannelCodes });
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.transaction_id) {
        whereConditions.push('pr.transaction_id LIKE ?');
        values.push(`%${filters.transaction_id}%`);
    }
    
    if (filters.user_id) {
        // 清理user_id参数，移除可能的空格和特殊字符
        const cleanUserId = filters.user_id.toString().trim().replace(/^\+/, '');
        console.log('getPaymentRecordsWithFilters 清理后的user_id:', cleanUserId, '原始值:', filters.user_id);
        
        // 兼容多个ID的查询：子账号ID、游戏账号ID、游戏角色ID
        whereConditions.push(`(
            pr.user_id = ? OR 
            su.id = ? OR 
            su.wuid = ? OR 
            pr.role_id = ? OR
            pr.wuid = ? OR
            pr.sub_user_id = ?
        )`);
        values.push(cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('pr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.payment_status) {
        whereConditions.push('pr.payment_status = ?');
        values.push(filters.payment_status);
    }
    
    applyPaymentMethodFilter(filters, whereConditions, values);
    
    if (filters.game_id) {
        whereConditions.push('g.id = ?');
        values.push(filters.game_id);
    }
    
    if (filters.level1_agent || filters.level2_agent) {
        // 如果有代理筛选，选择优先级更高的那个
        const targetAgent = filters.level2_agent || filters.level1_agent;
        whereConditions.push('u.channel_code = ?');
        values.push(targetAgent);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(pr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(pr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = `SELECT 
        pr.id,
        pr.user_id,
        pr.sub_user_id,
        pr.role_id,
        pr.transaction_id,
        pr.wuid,
        pr.payment_way,
        pr.payment_id,
        pr.world_id,
        pr.product_name,
        pr.product_des,
        pr.ip,
        pr.amount,
        pr.mch_order_id,
        pr.created_at,
        pr.notify_at,
        pr.callback_at,
        pr.msg,
        pr.server_url,
        pr.device,
        COALESCE(u.channel_code, pr.channel_code) as channel_code,
        pr.game_code,
        pr.payment_status,
        pr.ptb_before,
        pr.ptb_change,
        pr.ptb_after,
        g.game_name,
        COALESCE(su.wuid, pr.wuid) as role_id_from_join,
        gc.character_name as role_name,
        ps.payment_channel
    FROM PaymentRecords pr 
    LEFT JOIN Users u ON pr.user_id = u.id 
    LEFT JOIN Games g ON u.game_code = g.game_code
    LEFT JOIN SubUsers su ON pr.sub_user_id = su.id
    LEFT JOIN GameCharacters gc ON pr.role_id = gc.uuid
    LEFT JOIN PaymentSettings ps ON pr.payment_id = ps.id`;
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    query += ' GROUP BY pr.id ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
    
    values.push(pageSize, offset);
    
    console.log('执行查询:', query);
    console.log('查询参数:', values);
    
    const result = await sql({
        query: query,
        values: values,
    }) as any[];
    
    console.log('查询结果数量:', result.length);
    
    // 使用 Map 进一步去重（基于 id），防止 GROUP BY 在某些情况下仍可能产生重复
    const uniqueResults = new Map();
    for (const row of result) {
        if (!uniqueResults.has(row.id)) {
            // 清理临时字段
            if (row.role_id_from_join) {
                delete row.role_id_from_join;
            }
            uniqueResults.set(row.id, row);
        }
    }
    
    return Array.from(uniqueResults.values());
};

// 获取充值记录总数
const getPaymentRecordsCount = async (filters: any, allowedChannelCodes: string[] = []) => {
    console.log('getPaymentRecordsCount 参数:', { filters, allowedChannelCodes });
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.transaction_id) {
        whereConditions.push('pr.transaction_id LIKE ?');
        values.push(`%${filters.transaction_id}%`);
    }
    
    if (filters.user_id) {
        // 清理user_id参数，移除可能的空格和特殊字符
        const cleanUserId = filters.user_id.toString().trim().replace(/^\+/, '');
        console.log('getPaymentRecordsCount 清理后的user_id:', cleanUserId, '原始值:', filters.user_id);
        
        // 兼容多个ID的查询：子账号ID、游戏账号ID、游戏角色ID
        whereConditions.push(`(
            pr.user_id = ? OR 
            su.id = ? OR 
            su.wuid = ? OR 
            pr.role_id = ? OR
            pr.wuid = ? OR
            pr.sub_user_id = ?
        )`);
        values.push(cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('pr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.payment_status) {
        whereConditions.push('pr.payment_status = ?');
        values.push(filters.payment_status);
    }
    
    applyPaymentMethodFilter(filters, whereConditions, values);
    
    if (filters.game_id) {
        whereConditions.push('g.id = ?');
        values.push(filters.game_id);
    }
    
    if (filters.level1_agent || filters.level2_agent) {
        // 如果有代理筛选，选择优先级更高的那个
        const targetAgent = filters.level2_agent || filters.level1_agent;
        whereConditions.push('u.channel_code = ?');
        values.push(targetAgent);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(pr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(pr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = `SELECT COUNT(*) as total 
    FROM PaymentRecords pr 
    LEFT JOIN Users u ON pr.user_id = u.id 
    LEFT JOIN Games g ON u.game_code = g.game_code
    LEFT JOIN SubUsers su ON pr.sub_user_id = su.id`;
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    console.log('计数查询:', query);
    console.log('计数参数:', values);
    
    const result = await sql({
        query: query,
        values: values,
    }) as any;
    
    console.log('计数结果:', result[0].total);
    
    return result[0].total;
};

// 获取当前查询条件下的所有订单统计
const getCurrentQueryStats = async (filters: any, allowedChannelCodes: string[] = []) => {
    console.log('getCurrentQueryStats 参数:', { filters, allowedChannelCodes });
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.transaction_id) {
        whereConditions.push('pr.transaction_id LIKE ?');
        values.push(`%${filters.transaction_id}%`);
    }
    
    if (filters.user_id) {
        // 清理user_id参数，移除可能的空格和特殊字符
        const cleanUserId = filters.user_id.toString().trim().replace(/^\+/, '');
        console.log('getCurrentQueryStats 清理后的user_id:', cleanUserId, '原始值:', filters.user_id);
        
        whereConditions.push(`(
            pr.user_id = ? OR 
            su.id = ? OR 
            su.wuid = ? OR 
            pr.role_id = ? OR
            pr.wuid = ? OR
            pr.sub_user_id = ?
        )`);
        values.push(cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('pr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.payment_status) {
        whereConditions.push('pr.payment_status = ?');
        values.push(filters.payment_status);
    }
    
    applyPaymentMethodFilter(filters, whereConditions, values);
    
    if (filters.game_id) {
        whereConditions.push('g.id = ?');
        values.push(filters.game_id);
    }
    
    if (filters.level1_agent || filters.level2_agent) {
        const targetAgent = filters.level2_agent || filters.level1_agent;
        whereConditions.push('u.channel_code = ?');
        values.push(targetAgent);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(pr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(pr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(pr.amount), 0) as amount 
    FROM PaymentRecords pr 
    LEFT JOIN Users u ON pr.user_id = u.id 
    LEFT JOIN Games g ON u.game_code = g.game_code
    LEFT JOIN SubUsers su ON pr.sub_user_id = su.id`;
    
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    console.log('当前查询统计 SQL:', query);
    console.log('当前查询统计参数:', values);
    
    const result = await sql({
        query: query,
        values: values,
    }) as any[];
    
    return {
        count: result[0].count,
        amount: parseFloat(result[0].amount).toFixed(2)
    };
};

// 获取指定日期范围的充值统计
const getPaymentStatsForDateRange = async (startDate?: string, endDate?: string, isTodayStats: boolean = false, filters?: any, allowedChannelCodes: string[] = []) => {
    const today = getChinaDateString();
    
    if (isTodayStats) {
        // 今日统计：计算总的成功订单数和金额（排除平台币购买）
        let todaySuccessQuery = `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(pr.amount), 0) as amount 
            FROM PaymentRecords pr 
            LEFT JOIN Users u ON pr.user_id = u.id 
            WHERE DATE(pr.created_at) = ? AND pr.payment_status = 3
            AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
        `;
        
        let todayTotalQuery = `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(pr.amount), 0) as amount 
            FROM PaymentRecords pr 
            LEFT JOIN Users u ON pr.user_id = u.id 
            WHERE DATE(pr.created_at) = ?
        `;
        
        let todaySuccessValues = [today];
        let todayTotalValues = [today];
        
        // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
        if (allowedChannelCodes.length > 0) {
            const channelFilter = ` AND u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`;
            todaySuccessQuery += channelFilter;
            todayTotalQuery += channelFilter;
            todaySuccessValues.push(...allowedChannelCodes);
            todayTotalValues.push(...allowedChannelCodes);
        }
        
        const [todaySuccessResult, todayTotalResult] = await Promise.all([
            sql({ query: todaySuccessQuery, values: todaySuccessValues }),
            sql({ query: todayTotalQuery, values: todayTotalValues })
        ]) as any[];
        
        return {
            todaySuccessCount: todaySuccessResult[0].count,
            todaySuccessAmount: parseFloat(todaySuccessResult[0].amount).toFixed(2),
            todayTotalCount: todayTotalResult[0].count,
            todayTotalAmount: parseFloat(todayTotalResult[0].amount).toFixed(2)
        };
    } else {
        // 查询范围统计：计算总的成功订单数和金额（排除平台币购买）
        let whereConditions = ['pr.payment_status = 3', '(pr.payment_way NOT LIKE \'%平台币%\' OR pr.payment_way IS NULL OR pr.payment_way = \'\')'];
        let whereConditionsAll = ['1=1'];
        let values: any[] = [];
        let valuesAll: any[] = [];
        
        if (startDate) {
            whereConditions.push('DATE(pr.created_at) >= ?');
            whereConditionsAll.push('DATE(pr.created_at) >= ?');
            values.push(startDate);
            valuesAll.push(startDate);
        }
        
        if (endDate) {
            whereConditions.push('DATE(pr.created_at) <= ?');
            whereConditionsAll.push('DATE(pr.created_at) <= ?');
            values.push(endDate);
            valuesAll.push(endDate);
        }
        
        // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
        if (allowedChannelCodes.length > 0) {
            whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
            whereConditionsAll.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
            values.push(...allowedChannelCodes);
            valuesAll.push(...allowedChannelCodes);
        }
        
        // 添加其他筛选条件
        if (filters) {
            if (filters.transaction_id) {
                whereConditions.push('pr.transaction_id LIKE ?');
                whereConditionsAll.push('pr.transaction_id LIKE ?');
                values.push(`%${filters.transaction_id}%`);
                valuesAll.push(`%${filters.transaction_id}%`);
            }
            
            if (filters.user_id) {
                // 清理user_id参数，移除可能的空格和特殊字符
                const cleanUserId = filters.user_id.toString().trim().replace(/^\+/, '');
                console.log('getPaymentStatsForDateRange 清理后的user_id:', cleanUserId, '原始值:', filters.user_id);
                
                // 兼容多个ID的查询：子账号ID、游戏账号ID、游戏角色ID
                whereConditions.push(`(
                    pr.user_id = ? OR 
                    su.id = ? OR 
                    su.wuid = ? OR 
                    pr.role_id = ? OR
                    pr.wuid = ? OR
                    pr.sub_user_id = ?
                )`);
                whereConditionsAll.push(`(
                    pr.user_id = ? OR 
                    su.id = ? OR 
                    su.wuid = ? OR 
                    pr.role_id = ? OR
                    pr.wuid = ? OR
                    pr.sub_user_id = ?
                )`);
                values.push(cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId);
                valuesAll.push(cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId, cleanUserId);
            }
            
            if (filters.mch_order_id) {
                whereConditions.push('pr.mch_order_id LIKE ?');
                whereConditionsAll.push('pr.mch_order_id LIKE ?');
                values.push(`%${filters.mch_order_id}%`);
                valuesAll.push(`%${filters.mch_order_id}%`);
            }
            
            if (filters.payment_status) {
                whereConditions.push('pr.payment_status = ?');
                whereConditionsAll.push('pr.payment_status = ?');
                values.push(filters.payment_status);
                valuesAll.push(filters.payment_status);
            }
            
            if (filters.payment_method) {
                applyPaymentMethodFilter(filters, whereConditions, values);
                applyPaymentMethodFilter(filters, whereConditionsAll, valuesAll);
            }
            
            if (filters.game_id) {
                whereConditions.push('g.id = ?');
                whereConditionsAll.push('g.id = ?');
                values.push(filters.game_id);
                valuesAll.push(filters.game_id);
            }
            
            if (filters.level1_agent || filters.level2_agent) {
                // 如果有代理筛选，选择优先级更高的那个
                const targetAgent = filters.level2_agent || filters.level1_agent;
                whereConditions.push('u.channel_code = ?');
                whereConditionsAll.push('u.channel_code = ?');
                values.push(targetAgent);
                valuesAll.push(targetAgent);
            }
        }
        
        const successConditions = whereConditions.join(' AND ');
        const allConditions = whereConditionsAll.join(' AND ');
        
        let querySuccessQuery = `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(pr.amount), 0) as amount 
            FROM PaymentRecords pr 
            LEFT JOIN Users u ON pr.user_id = u.id 
            LEFT JOIN Games g ON u.game_code = g.game_code
            LEFT JOIN SubUsers su ON pr.sub_user_id = su.id
            WHERE ${successConditions}
        `;
        
        let queryTotalQuery = `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(pr.amount), 0) as amount 
            FROM PaymentRecords pr 
            LEFT JOIN Users u ON pr.user_id = u.id 
            LEFT JOIN Games g ON u.game_code = g.game_code
            LEFT JOIN SubUsers su ON pr.sub_user_id = su.id
            WHERE ${allConditions}
        `;
        
        const [querySuccessResult, queryTotalResult] = await Promise.all([
            sql({ query: querySuccessQuery, values: values }),
            sql({ query: queryTotalQuery, values: valuesAll })
        ]) as any[];
        
        return {
            querySuccessCount: querySuccessResult[0].count,
            querySuccessAmount: parseFloat(querySuccessResult[0].amount).toFixed(2),
            queryTotalCount: queryTotalResult[0].count,
            queryTotalAmount: parseFloat(queryTotalResult[0].amount).toFixed(2)
        };
    }
};

// 获取角色查询记录
export const getGameCharacters = async(evt:H3Event) => {
    try{
        const query = getQuery(evt);
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const statsOnly = query.statsOnly === 'true';
        
        // 权限验证和获取允许的渠道
        let allowedChannelCodes: string[] = [];
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        if (token) {
            try {
                const adminResult = await AdminModel.getAdminWithPermissions(token);
                if (adminResult && adminResult.level > 0) {
                    // 非超级管理员需要按权限过滤
                    allowedChannelCodes = adminResult.allowed_channel_codes || [];
                    console.log(`管理员 ${adminResult.name} 的渠道权限:`, allowedChannelCodes);
                }
            } catch (error) {
                throw createError({
                   status: 403,
                   message: '权限验证失败',
                });
            }
        } else {
            throw createError({
                status: 401,
                message: '未提供认证token',
            });
        }
        
        const filters: any = {};
        if (query.user_id) filters.user_id = query.user_id as string;
        if (query.subuser_id) filters.subuser_id = query.subuser_id as string;
        if (query.subuser_name) filters.subuser_name = query.subuser_name as string;
        if (query.character_name) filters.character_name = query.character_name as string;
        if (query.uuid) filters.uuid = query.uuid as string;
        if (query.game_id) filters.game_id = query.game_id as string;
        if (query.server_id) filters.server_id = query.server_id as string;
        if (query.startDate) filters.startDate = query.startDate as string;
        if (query.endDate) filters.endDate = query.endDate as string;
        
        // 如果只需要统计数据
        if (statsOnly) {
            const stats = await getCharacterStatsForDateRange(filters.startDate, filters.endDate, allowedChannelCodes);
            return {
                success: true,
                data: {
                    todayCharacterCount: stats.today_character_count,
                    totalCharacters: stats.total_characters
                }
            };
        }
        
        // 获取完整的角色数据
        const [characters, total] = await Promise.all([
            getGameCharactersWithFilters(page, pageSize, filters, allowedChannelCodes),
            getGameCharactersCount(filters, allowedChannelCodes)
        ]);
        
        return {
            success: true,
            data: {
                characters,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        };
    }catch(e: any){
        console.error('获取角色查询记录失败:', e);
        throw createError({
            status: 500,
            message: e.message,
        });
    }
}

// 获取角色列表（带筛选和分页）
const getGameCharactersWithFilters = async (page: number, pageSize: number, filters: any, allowedChannelCodes: string[] = []) => {
    const offset = (page - 1) * pageSize;
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`)
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('gc.user_id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.subuser_id) {
        whereConditions.push('gc.subuser_id = ?');
        values.push(filters.subuser_id);
    }
    
    if (filters.subuser_name) {
        whereConditions.push('su.username LIKE ?');
        values.push(`%${filters.subuser_name}%`);
    }
    
    if (filters.character_name) {
        whereConditions.push('gc.character_name LIKE ?');
        values.push(`%${filters.character_name}%`);
    }
    
    if (filters.uuid) {
        whereConditions.push('gc.uuid LIKE ?');
        values.push(`%${filters.uuid}%`);
    }
    
    if (filters.game_id) {
        whereConditions.push('gc.game_id = ?');
        values.push(filters.game_id);
    }
    
    if (filters.server_id) {
        whereConditions.push('gc.server_id = ?');
        values.push(filters.server_id);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(gc.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(gc.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = `
        SELECT 
            gc.*,
            u.username,
            u.channel_code,
            su.username as subuser_name,
            g.game_name
        FROM GameCharacters gc 
        LEFT JOIN Users u ON gc.user_id = u.id 
        LEFT JOIN SubUsers su ON gc.subuser_id = su.id
        LEFT JOIN Games g ON gc.game_id = g.id
    `;
    
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    query += ' ORDER BY gc.created_at DESC LIMIT ? OFFSET ?';
    
    values.push(pageSize, offset);
    
    const result = await sql({
        query: query,
        values: values,
    });
    
    return result;
};

// 获取角色总数
const getGameCharactersCount = async (filters: any, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`)
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('gc.user_id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.subuser_id) {
        whereConditions.push('gc.subuser_id = ?');
        values.push(filters.subuser_id);
    }
    
    if (filters.subuser_name) {
        whereConditions.push('su.username LIKE ?');
        values.push(`%${filters.subuser_name}%`);
    }
    
    if (filters.character_name) {
        whereConditions.push('gc.character_name LIKE ?');
        values.push(`%${filters.character_name}%`);
    }
    
    if (filters.uuid) {
        whereConditions.push('gc.uuid LIKE ?');
        values.push(`%${filters.uuid}%`);
    }
    
    if (filters.game_id) {
        whereConditions.push('gc.game_id = ?');
        values.push(filters.game_id);
    }
    
    if (filters.server_id) {
        whereConditions.push('gc.server_id = ?');
        values.push(filters.server_id);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(gc.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(gc.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    let query = `
        SELECT COUNT(*) as total 
        FROM GameCharacters gc 
        LEFT JOIN Users u ON gc.user_id = u.id 
        LEFT JOIN SubUsers su ON gc.subuser_id = su.id
        LEFT JOIN Games g ON gc.game_id = g.id
    `;
    
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    const result = await sql({
        query: query,
        values: values,
    }) as any;
    
    return result[0].total;
};

// 获取指定日期范围的角色统计
const getCharacterStatsForDateRange = async (startDate?: string, endDate?: string, allowedChannelCodes: string[] = []) => {
    const today = getChinaDateString();
    
    // 今日创建角色统计
    let todayQuery = `
        SELECT COUNT(*) as today_character_count
        FROM GameCharacters gc
        LEFT JOIN Users u ON gc.user_id = u.id
        WHERE DATE(gc.created_at) = ?
    `;
    let todayValues = [today];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        todayQuery += ` AND u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`;
        todayValues.push(...allowedChannelCodes);
    }
    
    const todayResult = await sql({
        query: todayQuery,
        values: todayValues,
    }) as any;
    
    // 总角色数
    let totalQuery = `
        SELECT COUNT(*) as total_characters 
        FROM GameCharacters gc
        LEFT JOIN Users u ON gc.user_id = u.id
    `;
    let totalValues: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        totalQuery += ` WHERE u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`;
        totalValues.push(...allowedChannelCodes);
    }
    
    const totalResult = await sql({
        query: totalQuery,
        values: totalValues,
    }) as any;
    
    return {
        today_character_count: todayResult[0].today_character_count,
        total_characters: totalResult[0].total_characters
    };
};

// 获取数据概览统计（按游戏分组）
export const getDataOverview = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const startDate = query.startDate as string || getPastDate(7); // 默认7天
        const endDate = query.endDate as string || getCurrentDate();
        const channelCode = query.channelCode as string || '';
        const adminId = query.adminId as string || '';
        const gameId = query.gameId as string || '';
        
        // 获取当前操作用户信息（用于权限判断）
        let currentUserInfo: { level: number, allowed_channel_codes: string[], allowed_game_ids: number[] } = { 
            level: 0, 
            allowed_channel_codes: [], 
            allowed_game_ids: [] 
        };
        
        if (adminId) {
            try {
                const adminResult = await AdminModel.getAdminWithPermissions(parseInt(adminId));
                if (adminResult) {
                    currentUserInfo = {
                        level: adminResult.level,
                        allowed_channel_codes: adminResult.allowed_channel_codes || [],
                        allowed_game_ids: adminResult.allowed_game_ids || []
                    };
                }
            } catch (error: any) {
                console.error('获取管理员信息失败:', error);
            }
        }

        // 确定要使用的权限（用于数据过滤）
        let allowedChannels: string[] = [];
        
        if (channelCode) {
            // 用户选择了具体渠道，查询该渠道及其所有下级渠道的数据
            const AgentRelationships = await import('../model/agentRelationships');
            const childChannels = await AgentRelationships.getAllChildChannelCodes(channelCode);
            allowedChannels = [channelCode, ...childChannels];
            
            console.log('[概述数据查询] 选择了具体渠道:', {
                selectedChannel: channelCode,
                allChannels: allowedChannels
            });
        } else {
            // 没选择具体渠道，使用当前用户的权限
            if (currentUserInfo.level === 0) {
                // 超级管理员：不过滤，查看全部数据
                allowedChannels = [];
                console.log('[概述数据查询] 超级管理员，不限制渠道');
            } else {
                // 普通代理：使用自己的权限
                allowedChannels = currentUserInfo.allowed_channel_codes;
                console.log('[概述数据查询] 使用用户权限:', {
                    allowedChannels
                });
            }
        }

        // 游戏权限处理
        let gameCodeFilter = '';
        if (gameId) {
            // 检查权限
            if (currentUserInfo.level > 0 && currentUserInfo.allowed_game_ids.length > 0 && 
                !currentUserInfo.allowed_game_ids.includes(parseInt(gameId))) {
                return {
                    success: false,
                    message: '无权限查看该游戏数据'
                };
            }
            
            // 获取游戏代码
            const gameResult = await sql({
                query: "SELECT game_code FROM Games WHERE id = ?",
                values: [parseInt(gameId)]
            }) as any;
            
            if (gameResult.length > 0) {
                gameCodeFilter = gameResult[0].game_code;
            }
        }

        // 构建查询条件
        let conditions = ['ds.stat_date BETWEEN ? AND ?'];
        let values = [startDate, endDate];

        // 渠道过滤
        if (allowedChannels.length > 0) {
            conditions.push(`ds.channel_code IN (${allowedChannels.map(() => '?').join(',')})`);
            values.push(...allowedChannels);
        }

        // 游戏过滤
        if (gameCodeFilter) {
            conditions.push('ds.game_code = ?');
            values.push(gameCodeFilter);
        } else if (currentUserInfo.level > 0 && currentUserInfo.allowed_game_ids.length > 0) {
            // 代理用户需要过滤游戏权限
            const gameCodesResult = await sql({
                query: `SELECT game_code FROM Games WHERE id IN (${currentUserInfo.allowed_game_ids.map(() => '?').join(',')})`,
                values: currentUserInfo.allowed_game_ids
            }) as any;
            
            if (gameCodesResult.length > 0) {
                const gameCodes = gameCodesResult.map((g: any) => g.game_code);
                conditions.push(`ds.game_code IN (${gameCodes.map(() => '?').join(',')})`);
                values.push(...gameCodes);
            }
        }

        // 从DailyStats表获取汇总数据
        const overviewQuery = `
            SELECT 
                COALESCE(SUM(ds.active_users), 0) as activeUsers,
                COALESCE(SUM(ds.new_users), 0) as newUsers,
                COALESCE(SUM(ds.pay_users), 0) as payUsers,
                COALESCE(SUM(ds.new_pay_users), 0) as newPayUsers,
                COALESCE(SUM(ds.pay_amount), 0) as payAmount,
                COALESCE(SUM(ds.new_pay_amount), 0) as newPayAmount,
                COALESCE(AVG(ds.pay_rate), 0) as payRate,
                COALESCE(AVG(ds.new_pay_rate), 0) as newPayRate,
                COALESCE(AVG(ds.pay_arpu), 0) as payArpu,
                COALESCE(AVG(ds.active_arpu), 0) as totalArpu,
                COALESCE(AVG(ds.new_arpu), 0) as newArpu,
                COALESCE(AVG(ds.new_pay_arpu), 0) as newPayArpu
            FROM DailyStats ds
            WHERE ${conditions.join(' AND ')}
        `;

        const overviewResult = await sql({
            query: overviewQuery,
            values
        }) as any;

        // 5. 获取游戏统计数据（也从DailyStats表聚合）
        let gameStatsConditions = ['ds.stat_date BETWEEN ? AND ?'];
        let gameStatsValues = [startDate, endDate];

        // 渠道过滤
        if (allowedChannels.length > 0) {
            gameStatsConditions.push(`ds.channel_code IN (${allowedChannels.map(() => '?').join(',')})`);
            gameStatsValues.push(...allowedChannels);
        }

        // 如果选择了特定游戏，只显示该游戏
        if (gameCodeFilter) {
            gameStatsConditions.push('ds.game_code = ?');
            gameStatsValues.push(gameCodeFilter);
        } else if (currentUserInfo.level > 0 && currentUserInfo.allowed_game_ids.length > 0) {
            // 代理用户需要过滤游戏权限
            const gameCodesResult = await sql({
                query: `SELECT game_code FROM Games WHERE id IN (${currentUserInfo.allowed_game_ids.map(() => '?').join(',')})`,
                values: currentUserInfo.allowed_game_ids
            }) as any;
            
            if (gameCodesResult.length > 0) {
                const gameCodes = gameCodesResult.map((g: any) => g.game_code);
                gameStatsConditions.push(`ds.game_code IN (${gameCodes.map(() => '?').join(',')})`);
                gameStatsValues.push(...gameCodes);
            }
        }

        const gameStatsQuery = `
            SELECT 
                g.id as game_id,
                g.game_name,
                COALESCE(SUM(ds.active_users), 0) as active_users,
                COALESCE(SUM(ds.register_users), 0) as register_users,
                COALESCE(SUM(ds.real_recharge_amount), 0) as recharge_amount,
                COALESCE(SUM(ds.pay_users), 0) as pay_users,
                COALESCE(AVG(ds.pay_rate), 0) as pay_rate,
                COALESCE(AVG(ds.active_arpu), 0) as arpu
            FROM DailyStats ds
            JOIN Games g ON ds.game_code = g.game_code
            WHERE g.is_active = 1 AND ${gameStatsConditions.join(' AND ')}
            GROUP BY g.id, g.game_name, ds.game_code
            ORDER BY recharge_amount DESC, g.game_name
        `;

        const gameStats = await sql({
            query: gameStatsQuery,
            values: gameStatsValues
        }) as any;

        // 获取统计结果
        const result = overviewResult[0] || {};
        const activeUsers = Number(result.activeUsers) || 0;
        const newUsers = Number(result.newUsers) || 0;
        const payUsers = Number(result.payUsers) || 0;
        const payAmount = Number(result.payAmount) || 0;
        const newPayUsers = Number(result.newPayUsers) || 0;
        const newPayAmount = Number(result.newPayAmount) || 0;
        const payRate = Number(result.payRate) || 0;
        const newPayRate = Number(result.newPayRate) || 0;
        const payArpu = Number(result.payArpu) || 0;
        const totalArpu = Number(result.totalArpu) || 0;
        const newArpu = Number(result.newArpu) || 0;
        const newPayArpu = Number(result.newPayArpu) || 0;

        return {
            success: true,
            data: {
                // 用户统计数据
                activeUsers,
                newUsers,
                payUsers,
                newPayUsers,
                payAmount: payAmount.toFixed(2),
                newPayAmount: newPayAmount.toFixed(2),
                payRate: payRate.toFixed(0),
                newPayRate: newPayRate.toFixed(0),
                payArpu: payArpu.toFixed(2),
                totalArpu: totalArpu.toFixed(2),
                newArpu: newArpu.toFixed(2),
                newPayArpu: newPayArpu.toFixed(2),
                
                // 游戏详细数据
                gameStats: gameStats.map((game: any) => ({
                    gameId: game.game_id,
                    gameName: game.game_name,
                    activeUsers: Number(game.active_users) || 0,
                    consumeAmount: Number(game.recharge_amount).toFixed(2),
                    rechargeAmount: Number(game.recharge_amount).toFixed(2),
                    registerUsers: Number(game.register_users) || 0,
                    todayAmount: '0.00', // 今日金额需要单独计算或从其他地方获取
                    payUsers: Number(game.pay_users) || 0,
                    payRate: Number(game.pay_rate).toFixed(0),
                    arpu: Number(game.arpu).toFixed(2)
                })),
                
                // 统计周期
                startDate,
                endDate,
                
                // 权限信息
                adminLevel: currentUserInfo.level,
                allowedChannels: currentUserInfo.level > 0 ? allowedChannels : null,
                allowedGameIds: currentUserInfo.level > 0 ? currentUserInfo.allowed_game_ids : null
            }
        };

    } catch (error: any) {
        console.error('获取数据概览失败:', error);
        return {
            success: false,
            message: '获取数据概览失败: ' + error.message
        };
    }
};

// 获取日报详细数据（按日期分组）
export const getDailyReportDetails = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const startDate = query.startDate as string || getPastDate(7);
        const endDate = query.endDate as string || getCurrentDate();
        const channelCode = query.channelCode as string || '';
        const adminId = query.adminId as string || '';
        const gameId = query.gameId as string || '';
        
        // 获取当前用户权限信息
        let currentUserInfo: { level: number, allowed_channel_codes: string[], allowed_game_ids: number[] } = { 
            level: 0, 
            allowed_channel_codes: [], 
            allowed_game_ids: [] 
        };
        
        if (adminId) {
            try {
                const adminResult = await AdminModel.getAdminWithPermissions(parseInt(adminId));
                if (adminResult) {
                    currentUserInfo = {
                        level: adminResult.level,
                        allowed_channel_codes: adminResult.allowed_channel_codes || [],
                        allowed_game_ids: adminResult.allowed_game_ids || []
                    };
                }
            } catch (error: any) {
                console.error('获取管理员信息失败:', error);
            }
        }

        // 确定要使用的权限（用于数据过滤）
        let allowedChannels: string[] = [];
        let allowedGameIds: number[] = [];
        
        if (channelCode) {
            // 用户选择了具体渠道
            allowedChannels = [channelCode];
        } else {
            // 没有选择具体渠道
            if (currentUserInfo.level === 0) {
                // 超级管理员：不过滤，查看全部数据
                allowedChannels = [];
            } else {
                // 普通代理：使用自己的权限
                allowedChannels = currentUserInfo.allowed_channel_codes;
            }
        }

        // 游戏权限处理
        let gameCodeFilter = '';
        if (gameId) {
            // 检查权限
            if (currentUserInfo.level > 0 && currentUserInfo.allowed_game_ids.length > 0 && 
                !currentUserInfo.allowed_game_ids.includes(parseInt(gameId))) {
                return {
                    success: false,
                    message: '无权限查看该游戏数据'
                };
            }
            
            // 获取游戏代码
            const gameResult = await sql({
                query: "SELECT game_code FROM Games WHERE id = ?",
                values: [parseInt(gameId)]
            }) as any;
            
            if (gameResult.length > 0) {
                gameCodeFilter = gameResult[0].game_code;
            }
        }

        // 构建查询条件
        let conditions = ['ds.stat_date BETWEEN ? AND ?'];
        let values = [startDate, endDate];

        // 渠道过滤
        if (allowedChannels.length > 0) {
            conditions.push(`ds.channel_code IN (${allowedChannels.map(() => '?').join(',')})`);
            values.push(...allowedChannels);
        }

        // 游戏过滤
        if (gameCodeFilter) {
            conditions.push('ds.game_code = ?');
            values.push(gameCodeFilter);
        } else if (currentUserInfo.level > 0 && currentUserInfo.allowed_game_ids.length > 0) {
            // 代理用户需要过滤游戏权限
            const gameCodesResult = await sql({
                query: `SELECT game_code FROM Games WHERE id IN (${currentUserInfo.allowed_game_ids.map(() => '?').join(',')})`,
                values: currentUserInfo.allowed_game_ids
            }) as any;
            
            if (gameCodesResult.length > 0) {
                const gameCodes = gameCodesResult.map((g: any) => g.game_code);
                conditions.push(`ds.game_code IN (${gameCodes.map(() => '?').join(',')})`);
                values.push(...gameCodes);
            }
        }

        // 从DailyStats表获取基础数据，并LEFT JOIN LTVStats获取LTV数据
        const dailyStatsQuery = `
            SELECT 
                ds.stat_date as date,
                COALESCE(SUM(ds.active_users), 0) as activeUsers,
                COALESCE(SUM(ds.register_users), 0) as registerUsers,
                COALESCE(SUM(ds.valid_register_users), 0) as validRegisterUsers,
                COALESCE(SUM(ds.new_users), 0) as newUsers,
                COALESCE(AVG(ds.yesterday_retention), 0) as yesterdayRetention,
                COALESCE(SUM(ds.pay_users), 0) as payUsers,
                COALESCE(SUM(ds.new_pay_users), 0) as newPayUsers,
                COALESCE(SUM(ds.recharge_times), 0) as rechargeTimes,
                COALESCE(SUM(ds.high_value_users), 0) as highValueUsers,
                COALESCE(SUM(ds.consume_amount), 0) as consumeAmount,
                COALESCE(SUM(ds.real_recharge_amount), 0) as realRechargeAmount,
                COALESCE(SUM(ds.new_user_recharge), 0) as newUserRecharge,
                COALESCE(AVG(ds.pay_rate), 0) as payRate,
                COALESCE(AVG(ds.new_pay_rate), 0) as newPayRate,
                COALESCE(AVG(ds.active_arpu), 0) as activeArpu,
                COALESCE(AVG(ds.pay_arpu), 0) as payArpu,
                COALESCE(AVG(ds.new_arpu), 0) as newArpu,
                COALESCE(AVG(ds.new_pay_arpu), 0) as newPayArpu,
                COALESCE(AVG(ltv.ltv2_arpu), 0) as ltv2,
                COALESCE(AVG(ltv.ltv3_arpu), 0) as ltv3,
                COALESCE(AVG(ltv.ltv5_arpu), 0) as ltv5,
                COALESCE(AVG(ltv.ltv7_arpu), 0) as ltv7
            FROM DailyStats ds
            LEFT JOIN LTVStats ltv ON ds.stat_date = ltv.stat_date 
                AND ds.channel_code = ltv.channel_code 
                AND ds.game_code = ltv.game_code
            WHERE ${conditions.join(' AND ')}
            GROUP BY ds.stat_date
            ORDER BY ds.stat_date DESC
        `;

        const dailyStatsResult = await sql({
            query: dailyStatsQuery,
            values
        }) as any;

        // 格式化结果
        const dailyStats = dailyStatsResult.map((row: any) => ({
            date: formatDateToString(row.date),
            activeUsers: Number(row.activeUsers) || 0,
            registerUsers: Number(row.registerUsers) || 0,
            validRegisterUsers: Number(row.validRegisterUsers) || 0,
            newUsers: Number(row.newUsers) || 0,
            yesterdayRetention: Number(row.yesterdayRetention).toFixed(1),
            payUsers: Number(row.payUsers) || 0,
            newPayUsers: Number(row.newPayUsers) || 0,
            rechargeTimes: Number(row.rechargeTimes) || 0,
            highValueUsers: Number(row.highValueUsers) || 0,
            consumeAmount: Number(row.consumeAmount).toFixed(2),
            realRechargeAmount: Number(row.realRechargeAmount).toFixed(2),
            newUserRecharge: Number(row.newUserRecharge).toFixed(2),
            payRate: Number(row.payRate).toFixed(1),
            newPayRate: Number(row.newPayRate).toFixed(1),
            activeArpu: Number(row.activeArpu).toFixed(2),
            payArpu: Number(row.payArpu).toFixed(2),
            newArpu: Number(row.newArpu).toFixed(2),
            newPayArpu: Number(row.newPayArpu).toFixed(2),
            ltv2: Number(row.ltv2).toFixed(2),
            ltv3: Number(row.ltv3).toFixed(2),
            ltv5: Number(row.ltv5).toFixed(2),
            ltv7: Number(row.ltv7).toFixed(2)
        }));

        return {
            success: true,
            data: {
                details: dailyStats,
                startDate,
                endDate
            }
        };

    } catch (error: any) {
        console.error('获取日报详细数据失败:', error);
        return {
            success: false,
            message: '获取日报详细数据失败: ' + error.message
        };
    }
};

// 获取详细的数据概览表格（按渠道或日期分组）
export const getDataOverviewDetails = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const startDate = query.startDate as string || getPastDate(7);
        const endDate = query.endDate as string || getCurrentDate();
        const groupBy = query.groupBy as string || 'date'; // date | channel
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const adminId = query.adminId as string || '';
        
        // 获取用户权限
        let adminInfo = { level: 0, allowed_channel_codes: [] as string[] };
        let allowedChannels: string[] = [];
        
        if (adminId) {
            try {
                const adminResult = await AdminModel.getAdminWithPermissions(parseInt(adminId));
                if (adminResult) {
                    adminInfo = {
                        level: adminResult.level,
                        allowed_channel_codes: adminResult.allowed_channel_codes || []
                    };
                }
            } catch (error: any) {
                console.error('获取管理员信息失败:', error);
            }
        }
        
        if (adminInfo.level > 0) {
            allowedChannels = adminInfo.allowed_channel_codes;
        }

        let channelFilter = '';
        let channelValues: string[] = [];
        
        if (adminInfo.level > 0 && allowedChannels.length > 0) {
            channelFilter = ` AND u.channel_code COLLATE utf8mb4_unicode_ci IN (${allowedChannels.map(() => '?').join(',')})`;
            channelValues = allowedChannels;
        }

        let groupField = '';
        let orderField = '';
        
        if (groupBy === 'channel') {
            groupField = 'u.channel_code';
            orderField = 'u.channel_code';
        } else {
            groupField = 'DATE(u.created_at)';
            orderField = 'DATE(u.created_at) DESC';
        }

        // 构建详细统计查询
        const detailsQuery = `
            WITH date_series AS (
                ${generateDateSeries(startDate, endDate)}
            ),
            user_stats AS (
                SELECT 
                    ${groupField} as group_key,
                    COUNT(*) as new_users,
                    COUNT(DISTINCT ul.username) as active_users
                FROM Users u
                LEFT JOIN UserLoginLogs ul ON u.username = ul.username 
                    AND DATE(ul.login_time) BETWEEN ? AND ?
                WHERE DATE(u.created_at) BETWEEN ? AND ?
                ${channelFilter}
                GROUP BY ${groupField}
            ),
            payment_stats AS (
                SELECT 
                    ${groupField} as group_key,
                    COUNT(DISTINCT pr.user_id) as pay_users,
                    SUM(pr.amount) as pay_amount,
                    COUNT(DISTINCT CASE WHEN first_pay.first_pay_date BETWEEN ? AND ? THEN pr.user_id END) as new_pay_users,
                    SUM(CASE WHEN first_pay.first_pay_date BETWEEN ? AND ? THEN pr.amount ELSE 0 END) as new_pay_amount
                FROM Users u
                LEFT JOIN PaymentRecords pr ON u.id = pr.user_id AND pr.payment_status = 3
                    AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')
                    AND DATE(pr.created_at) BETWEEN ? AND ?
                LEFT JOIN (
                    SELECT user_id, DATE(MIN(created_at)) as first_pay_date
                    FROM PaymentRecords 
                    WHERE payment_status = 3
                    AND (payment_way NOT LIKE '%平台币%' OR payment_way IS NULL OR payment_way = '')
                    GROUP BY user_id
                ) first_pay ON u.id = first_pay.user_id
                WHERE DATE(u.created_at) BETWEEN ? AND ?
                ${channelFilter}
                GROUP BY ${groupField}
            )
            SELECT 
                COALESCE(us.group_key, ps.group_key) as group_key,
                COALESCE(us.new_users, 0) as new_users,
                COALESCE(us.active_users, 0) as active_users,
                COALESCE(ps.pay_users, 0) as pay_users,
                COALESCE(ps.new_pay_users, 0) as new_pay_users,
                COALESCE(ps.pay_amount, 0) as pay_amount,
                COALESCE(ps.new_pay_amount, 0) as new_pay_amount,
                CASE WHEN ps.pay_users > 0 THEN ps.pay_amount / ps.pay_users ELSE 0 END as pay_arpu,
                CASE WHEN ps.new_pay_users > 0 THEN ps.new_pay_amount / ps.new_pay_users ELSE 0 END as new_pay_arpu
            FROM user_stats us
            FULL OUTER JOIN payment_stats ps ON us.group_key = ps.group_key
            WHERE COALESCE(us.group_key, ps.group_key) IS NOT NULL
            ORDER BY ${orderField}
            LIMIT ? OFFSET ?
        `;

        const values = [
            startDate, endDate, // UserLoginLogs date range
            startDate, endDate, // Users date range
            ...channelValues, // channel filter
            startDate, endDate, // first_pay_date range 1
            startDate, endDate, // first_pay_date range 2  
            startDate, endDate, // PaymentRecords date range
            startDate, endDate, // Users date range 2
            ...channelValues, // channel filter 2
            pageSize,
            (page - 1) * pageSize
        ];

        const details = await sql({
            query: detailsQuery,
            values
        }) as any;

        // 获取总数
        const countQuery = `
            SELECT COUNT(DISTINCT ${groupField}) as total
            FROM Users u
            WHERE DATE(u.created_at) BETWEEN ? AND ?
            ${channelFilter}
        `;
        
        const countResult = await sql({
            query: countQuery,
            values: [startDate, endDate, ...channelValues]
        }) as any;

        const total = countResult[0]?.total || 0;

        return {
            success: true,
            data: {
                details: details.map((row: any) => ({
                    groupKey: groupBy === 'date' ? formatDateToString(row.group_key) : row.group_key,
                    newUsers: row.new_users,
                    activeUsers: row.active_users,
                    payUsers: row.pay_users,
                    newPayUsers: row.new_pay_users,
                    payAmount: Number(row.pay_amount).toFixed(2),
                    newPayAmount: Number(row.new_pay_amount).toFixed(2),
                    payArpu: Number(row.pay_arpu).toFixed(2),
                    newPayArpu: Number(row.new_pay_arpu).toFixed(2)
                })),
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                },
                groupBy,
                startDate,
                endDate
            }
        };

    } catch (error: any) {
        console.error('获取数据概览详情失败:', error);
        return {
            success: false,
            message: '获取数据概览详情失败: ' + error.message
        };
    }
};

// 辅助函数：获取过去N天的日期 - 修复时区问题
const getPastDate = (days: number, baseDate?: string): string => {
    const date = baseDate ? new Date(baseDate) : new Date();
    date.setDate(date.getDate() - days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 辅助函数：获取当前日期 - 修复时区问题
const getCurrentDate = (): string => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 辅助函数：格式化日期为字符串 - 确保返回正确的日期格式
const formatDateToString = (dateValue: any): string => {
    if (!dateValue) return '';
    
    // 如果是字符串
    if (typeof dateValue === 'string') {
        // 如果包含时间部分，只取日期部分
        if (dateValue.includes('T')) {
            return dateValue.split('T')[0];
        }
        // 如果是纯日期格式 YYYY-MM-DD，直接返回
        if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateValue;
        }
    }
    
    // 如果是Date对象，使用本地时区的年月日
    if (dateValue instanceof Date) {
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // 尝试解析为Date对象
    try {
        const date = new Date(dateValue);
        if (date instanceof Date && !isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) {
        console.error('日期格式化失败:', dateValue, e);
    }
    
    return String(dateValue);
};

// 辅助函数：生成日期序列（用于补全缺失日期）
const generateDateSeries = (startDate: string, endDate: string): string => {
    // 这里返回MySQL的日期序列生成SQL
    // 由于不同数据库语法不同，这里提供一个通用的递归CTE方式
    return `
        SELECT DATE('${startDate}') as date_value
        UNION ALL
        SELECT DATE(date_value, '+1 day')
        FROM date_series
        WHERE date_value < '${endDate}'
    `;
};

// 辅助函数：生成日期范围数组
const generateDateRange = (startDate: string, endDate: string): Date[] => {
    const dates: Date[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const current = new Date(start);
    while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
};

// LTV数据获取接口
export const getLTVData = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const {
            startDate,
            endDate,
            channelCode,
            gameId,
            adminId,
            page = 1,
            pageSize = 20
        } = query;

        // 参数验证
        if (!startDate || !endDate) {
            throw createError({
                status: 400,
                message: '开始日期和结束日期为必填项',
            });
        }

        // 分页参数
        const currentPage = parseInt(page as string) || 1;
        const limit = parseInt(pageSize as string) || 20;
        const offset = (currentPage - 1) * limit;

        // 构建基础查询条件
        let whereConditions = ['ls.stat_date BETWEEN ? AND ?'];
        let queryParams = [startDate, endDate];

        // 管理员权限过滤
        if (adminId) {
            const adminPermissions = await AdminModel.getAdminWithPermissions(parseInt(adminId as string));
            
            if (adminPermissions && adminPermissions.level > 0) {
                // 非超级管理员，需要按权限过滤
                const allowedChannels = adminPermissions.allowed_channel_codes || [];
                const allowedGames = adminPermissions.allowed_game_ids || [];
                
                if (allowedChannels.length > 0) {
                    const channelPlaceholders = allowedChannels.map(() => '?').join(',');
                    whereConditions.push(`ls.channel_code IN (${channelPlaceholders})`);
                    queryParams.push(...allowedChannels);
                }
                
                if (allowedGames.length > 0) {
                    const gamePlaceholders = allowedGames.map(() => '?').join(',');
                    whereConditions.push(`(ls.game_code IN (${gamePlaceholders}) OR ls.game_code = '')`);
                    queryParams.push(...allowedGames.map(id => id.toString()));
                }
            }
        }

        // 渠道过滤
        if (channelCode) {
            whereConditions.push('ls.channel_code = ?');
            queryParams.push(channelCode);
        }

        // 游戏过滤
        if (gameId) {
            whereConditions.push('ls.game_code = ?');
            queryParams.push(gameId);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // 查询LTV数据 - 按日期分组汇总  
        const dataQuery = `
            SELECT 
                ls.stat_date,
                SUM(ls.new_users) as new_users,
                SUM(ls.ltv1_amount) as ltv1_amount,
                SUM(ls.ltv2_amount) as ltv2_amount,
                SUM(ls.ltv3_amount) as ltv3_amount,
                SUM(ls.ltv4_amount) as ltv4_amount,
                SUM(ls.ltv5_amount) as ltv5_amount,
                SUM(ls.ltv6_amount) as ltv6_amount,
                SUM(ls.ltv7_amount) as ltv7_amount,
                SUM(ls.ltv10_amount) as ltv10_amount,
                SUM(ls.ltv20_amount) as ltv20_amount,
                SUM(ls.ltv30_amount) as ltv30_amount,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv1_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv1_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv2_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv2_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv3_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv3_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv4_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv4_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv5_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv5_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv6_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv6_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv7_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv7_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv10_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv10_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv20_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv20_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv30_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv30_arpu,
                '汇总数据' as channel_name,
                '汇总数据' as game_display_name
            FROM LTVStats ls
            ${whereClause}
            GROUP BY ls.stat_date
            ORDER BY ls.stat_date DESC
            LIMIT ? OFFSET ?
        `;

        // 查询总数 - 按日期分组后的记录数
        const countQuery = `
            SELECT COUNT(DISTINCT ls.stat_date) as total
            FROM LTVStats ls
            ${whereClause}
        `;

        const [dataResult, countResult] = await Promise.all([
            sql({
                query: dataQuery,
                values: [...queryParams, limit, offset]
            }),
            sql({
                query: countQuery,
                values: queryParams
            })
        ]);

        // 格式化LTV数据，修复时区问题
        const ltvData = (dataResult as any[]).map(row => ({
            ...row,
            stat_date: formatDateToString(row.stat_date)
        }));
        const total = ((countResult as any)?.[0]?.total) || 0;

        // 计算汇总数据
        const summaryQuery = `
            SELECT 
                SUM(ls.new_users) as total_new_users,
                SUM(ls.ltv1_amount) as total_ltv1_amount,
                SUM(ls.ltv3_amount) as total_ltv3_amount,
                SUM(ls.ltv7_amount) as total_ltv7_amount,
                SUM(ls.ltv30_amount) as total_ltv30_amount
            FROM LTVStats ls
            ${whereClause}
        `;

        const summaryResult = await sql({
            query: summaryQuery,
            values: queryParams
        });
        const summary = (summaryResult as any)?.[0] || {};

        // 计算平均ARPU
        const avgArpu = {
            ltv1: summary.total_new_users > 0 ? (summary.total_ltv1_amount / summary.total_new_users).toFixed(2) : '0.00',
            ltv3: summary.total_new_users > 0 ? (summary.total_ltv3_amount / summary.total_new_users).toFixed(2) : '0.00',
            ltv7: summary.total_new_users > 0 ? (summary.total_ltv7_amount / summary.total_new_users).toFixed(2) : '0.00',
            ltv30: summary.total_new_users > 0 ? (summary.total_ltv30_amount / summary.total_new_users).toFixed(2) : '0.00'
        };

        return {
            success: true,
            data: {
                list: ltvData,
                pagination: {
                    page: currentPage,
                    pageSize: limit,
                    total: total,
                    totalPages: Math.ceil(total / limit)
                },
                summary: {
                    total_new_users: summary.total_new_users || 0,
                    total_ltv1_amount: parseFloat(summary.total_ltv1_amount || 0).toFixed(2),
                    total_ltv3_amount: parseFloat(summary.total_ltv3_amount || 0).toFixed(2),
                    total_ltv7_amount: parseFloat(summary.total_ltv7_amount || 0).toFixed(2),
                    total_ltv30_amount: parseFloat(summary.total_ltv30_amount || 0).toFixed(2),
                    avg_arpu: avgArpu
                }
            }
        };

    } catch (e: any) {
        console.error('获取LTV数据失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取LTV数据失败',
        });
    }
}

// 获取LTV趋势图数据
export const getLTVTrendData = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const {
            startDate,
            endDate,
            channelCode,
            gameId,
            adminId
        } = query;

        // 参数验证
        if (!startDate || !endDate) {
            throw createError({
                status: 400,
                message: '开始日期和结束日期为必填项',
            });
        }

        // 构建基础查询条件
        let whereConditions = ['ls.stat_date BETWEEN ? AND ?'];
        let queryParams = [startDate, endDate];

        // 管理员权限过滤
        if (adminId) {
            const adminPermissions = await AdminModel.getAdminWithPermissions(parseInt(adminId as string));
            
            if (adminPermissions && adminPermissions.level > 0) {
                const allowedChannels = adminPermissions.allowed_channel_codes || [];
                const allowedGames = adminPermissions.allowed_game_ids || [];
                
                if (allowedChannels.length > 0) {
                    const channelPlaceholders = allowedChannels.map(() => '?').join(',');
                    whereConditions.push(`ls.channel_code IN (${channelPlaceholders})`);
                    queryParams.push(...allowedChannels);
                }
                
                if (allowedGames.length > 0) {
                    const gamePlaceholders = allowedGames.map(() => '?').join(',');
                    whereConditions.push(`(ls.game_code IN (${gamePlaceholders}) OR ls.game_code = '')`);
                    queryParams.push(...allowedGames.map(id => id.toString()));
                }
            }
        }

        // 渠道过滤
        if (channelCode) {
            whereConditions.push('ls.channel_code = ?');
            queryParams.push(channelCode);
        }

        // 游戏过滤
        if (gameId) {
            whereConditions.push('ls.game_code = ?');
            queryParams.push(gameId);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // 查询LTV趋势数据
        const trendQuery = `
            SELECT 
                ls.stat_date,
                SUM(ls.new_users) as total_new_users,
                SUM(ls.ltv1_amount) as ltv1_amount,
                SUM(ls.ltv3_amount) as ltv3_amount,
                SUM(ls.ltv7_amount) as ltv7_amount,
                SUM(ls.ltv30_amount) as ltv30_amount,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv1_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv1_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv3_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv3_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv7_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv7_arpu,
                CASE 
                    WHEN SUM(ls.new_users) > 0 
                    THEN ROUND(SUM(ls.ltv30_amount) / SUM(ls.new_users), 2)
                    ELSE 0 
                END as ltv30_arpu
            FROM LTVStats ls
            ${whereClause}
            GROUP BY ls.stat_date
            ORDER BY ls.stat_date
        `;

        const trendResult = await sql({
            query: trendQuery,
            values: queryParams
        });

        const trendData = (trendResult as any) || [];

        return {
            success: true,
            data: {
                trend: trendData,
                startDate,
                endDate
            }
        };

    } catch (e: any) {
        console.error('获取LTV趋势数据失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取LTV趋势数据失败',
        });
    }
}

// 获取渠道数据
// ==================== 平台币相关API ====================

// 代理间转账
export const adminTransferPlatformCoins = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { from_channel_code, to_channel_code, amount, remark, operator_channel_code } = body;
        
        if (!from_channel_code || !to_channel_code || !amount) {
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        if (amount === 0) {
            throw createError({
                status: 400,
                message: '转账金额不能为0',
            });
        }
        
        const result = await PlatformCoinsModel.transferBetweenAdmins(
            from_channel_code,
            to_channel_code,
            parseFloat(amount),
            remark || '',
            operator_channel_code || ''
        );
        
        return {
            success: true,
            message: result.message,
            data: result
        };
    } catch (e: any) {
        console.error('代理间转账失败:', e);
        throw createError({
            status: 500,
            message: e.message || '转账失败',
        });
    }
}

// 代理给玩家转账
export const adminTransferToPlayer = async(evt: H3Event) => {
    try {
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        if (!token) {
            throw createError({ statusCode: 401, message: '未提供认证token' });
        }
        const currentAdmin = await AdminModel.getAdminWithPermissions(token);
        if (!currentAdmin || currentAdmin.level > 0) {
            throw createError({ statusCode: 403, message: '只有超级管理员可以给玩家发放平台币' });
        }

        const body = await readBody(evt);
        const { admin_channel_code, user_id, amount, remark, operator_channel_code } = body;
        
        if (!admin_channel_code || !user_id || !amount) {
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        // 验证user_id是否为有效数字
        const parsedUserId = parseInt(user_id.toString());
        if (isNaN(parsedUserId) || parsedUserId <= 0) {
            throw createError({
                status: 400,
                message: '用户ID必须是有效的正整数',
            });
        }
        
        if (amount === 0) {
            throw createError({
                status: 400,
                message: '转账金额不能为0',
            });
        }
        
        const result = await PlatformCoinsModel.transferToPlayer(
            admin_channel_code,
            parsedUserId.toString(),
            parseFloat(amount),
            remark || '',
            operator_channel_code || ''
        );
        
        return {
            success: true,
            message: result.message,
            data: result
        };
    } catch (e: any) {
        console.error('代理给玩家转账失败:', e);
        throw createError({
            status: 500,
            message: e.message || '转账失败',
        });
    }
}

// 管理员分配平台币（现在受余额限制）
export const allocatePlatformCoins = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { from_channel_code, to_channel_code, amount, remark, operator_channel_code } = body;
        
        if (!from_channel_code || !to_channel_code || !amount) {
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        if (amount <= 0) {
            throw createError({
                status: 400,
                message: '分配金额必须大于0',
            });
        }
        
        const result = await PlatformCoinsModel.allocatePlatformCoins(
            from_channel_code,
            to_channel_code,
            parseFloat(amount),
            remark || '',
            operator_channel_code || ''
        );
        
        return {
            success: true,
            message: result.message,
            data: result
        };
    } catch (e: any) {
        console.error('分配平台币失败:', e);
        throw createError({
            status: 500,
            message: e.message || '分配失败',
        });
    }
}

// 获取代理间转账记录
export const getAdminPlatformCoinTransactions = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { channel_code, page = 1, page_size = 20 } = body;
        
        if (!channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码',
            });
        }
        
        // 安全处理分页参数
        const parsedPage = Math.max(1, parseInt(page.toString()) || 1);
        const parsedPageSize = Math.max(1, Math.min(100, parseInt(page_size.toString()) || 20));
        
        const result = await PlatformCoinsModel.getAdminTransactions(
            channel_code,
            parsedPage,
            parsedPageSize
        );
        
        return {
            success: true,
            data: result
        };
    } catch (e: any) {
        console.error('获取代理转账记录失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取记录失败',
        });
    }
}

// 获取代理给玩家转账记录
export const getAdminToPlayerTransactions = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { channel_code, page = 1, page_size = 20 } = body;
        
        if (!channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码',
            });
        }
        
        // 安全处理分页参数
        const parsedPage = Math.max(1, parseInt(page.toString()) || 1);
        const parsedPageSize = Math.max(1, Math.min(100, parseInt(page_size.toString()) || 20));
        
        const result = await PlatformCoinsModel.getAdminToPlayerTransactions(
            channel_code,
            parsedPage,
            parsedPageSize
        );
        
        return {
            success: true,
            data: result
        };
    } catch (e: any) {
        console.error('获取代理给玩家转账记录失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取记录失败',
        });
    }
}

// 获取代理余额
export const getAdminPlatformCoinBalance = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { channel_code } = body;
        
        if (!channel_code) {
            throw createError({
                status: 400,
                message: '缺少渠道代码',
            });
        }
        
        const result = await PlatformCoinsModel.getAdminBalance(channel_code);
        
        return {
            success: true,
            data: result
        };
    } catch (e: any) {
        console.error('获取代理余额失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取余额失败',
        });
    }
}

// 检查玩家是否属于指定代理渠道
export const checkUserChannel = async(evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { user_id, admin_channel_code } = body;
        
        if (!user_id || !admin_channel_code) {
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        // 验证user_id是否为有效数字
        const parsedUserId = parseInt(user_id.toString());
        if (isNaN(parsedUserId) || parsedUserId <= 0) {
            throw createError({
                status: 400,
                message: '用户ID必须是有效的正整数',
            });
        }
        
        // 获取管理员信息
        const adminResult = await sql({
            query: 'SELECT level, allowed_channel_codes FROM Admins WHERE channel_code = ? AND is_active = 1',
            values: [admin_channel_code]
        }) as any[];
        
        if (adminResult.length === 0) {
            throw createError({
                status: 404,
                message: '代理不存在',
            });
        }
        
        const adminLevel = adminResult[0].level || 0;
        const allowedChannels = adminResult[0].allowed_channel_codes || [];
        
        // 超级管理员可以发放给任何玩家
        if (adminLevel === 0) {
            // 仍需要验证玩家是否存在
            const userResult = await sql({
                query: 'SELECT channel_code FROM Users WHERE id = ?',
                values: [parsedUserId]
            }) as any[];
            
            if (userResult.length === 0) {
                throw createError({
                    status: 404,
                    message: '玩家不存在',
                });
            }
            
            return {
                success: true,
                message: '超级管理员权限验证通过',
                data: {
                    user_channel_code: userResult[0].channel_code
                }
            };
        }
        
        // 普通代理需要验证渠道权限
        const userResult = await sql({
            query: 'SELECT channel_code FROM Users WHERE id = ?',
            values: [parsedUserId]
        }) as any[];
        
        if (userResult.length === 0) {
            throw createError({
                status: 404,
                message: '玩家不存在',
            });
        }
        
        const userChannelCode = userResult[0].channel_code;
        
        // 检查玩家的渠道是否在代理的allowed_channel_codes中
        if (!allowedChannels.includes(userChannelCode)) {
            return {
                success: false,
                message: '该玩家不属于您的管理渠道范围'
            };
        }
        
        return {
            success: true,
            message: '玩家渠道验证通过',
            data: {
                user_channel_code: userChannelCode
            }
        };
    } catch (e: any) {
        console.error('检查玩家渠道失败:', e);
        throw createError({
            status: 500,
            message: e.message || '检查玩家渠道失败',
        });
    }
}


export const getChannelData = async(evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const {
            startDate,
            endDate,
            channelCode,
            gameId,
            adminId,
            page = 1,
            pageSize = 20
        } = query;

        // 参数验证
        if (!startDate || !endDate) {
            throw createError({
                status: 400,
                message: '开始日期和结束日期为必填项',
            });
        }

        // 分页参数
        const currentPage = parseInt(page as string) || 1;
        const limit = parseInt(pageSize as string) || 20;
        const offset = (currentPage - 1) * limit;

        // 获取管理员权限信息
        let adminPermissions = null;
        let allowedChannels: string[] = [];
        
        if (adminId) {
            adminPermissions = await AdminModel.getAdminWithPermissions(parseInt(adminId as string));
            
            if (adminPermissions) {
                if (adminPermissions.level === 0) {
                    // 超级管理员，无限制
                    allowedChannels = [];
                } else {
                    // 普通管理员
                    allowedChannels = adminPermissions.allowed_channel_codes || [];
                }
            }
        }

        // 构建查询条件
        let conditions = ['stat_date BETWEEN ? AND ?'];
        let params = [startDate, endDate];
        
        // 渠道过滤
        if (channelCode) {
            // 用户选择了具体渠道，查询该渠道及其所有下级渠道的数据
            const AgentRelationships = await import('../model/agentRelationships');
            const childChannels = await AgentRelationships.getAllChildChannelCodes(channelCode.toString());
            const targetChannels = [channelCode.toString(), ...childChannels];
            
            const channelPlaceholders = targetChannels.map(() => '?').join(',');
            conditions.push(`channel_code IN (${channelPlaceholders})`);
            params.push(...targetChannels);
            
            console.log('[渠道数据查询] 选择了具体渠道:', {
                selectedChannel: channelCode,
                allChannels: targetChannels
            });
        } else if (allowedChannels.length > 0) {
            // 没选择具体渠道，使用管理员权限范围
            const channelPlaceholders = allowedChannels.map(() => '?').join(',');
            conditions.push(`channel_code IN (${channelPlaceholders})`);
            params.push(...allowedChannels);
            
            console.log('[渠道数据查询] 使用管理员权限:', {
                allowedChannels
            });
        } else {
            // 超级管理员，不限制渠道
            console.log('[渠道数据查询] 超级管理员，不限制渠道');
        }
        
        // 游戏过滤
        if (gameId) {
            conditions.push('game_code = ?');
            params.push(gameId.toString());
        }

        // 从DailyStats表读取数据并按日期分组汇总
        const dataQuery = `
            SELECT 
                stat_date,
                SUM(register_users) as register_users,
                SUM(valid_register_users) as valid_register_users,
                SUM(character_count) as character_count,
                SUM(high_value_users_200) as high_value_users_200,
                SUM(recharge_times) as recharge_times,
                SUM(recharge_users) as recharge_users,
                SUM(real_recharge_amount) as real_recharge_amount,
                SUM(high_value_recharge_amount) as high_value_recharge_amount
            FROM DailyStats
            WHERE ${conditions.join(' AND ')}
            GROUP BY stat_date
            ORDER BY stat_date DESC
            LIMIT ? OFFSET ?
        `;
        
        // 计算总数 - 按日期分组后的记录数
        const countQuery = `
            SELECT COUNT(DISTINCT stat_date) as total
            FROM DailyStats
            WHERE ${conditions.join(' AND ')}
        `;

        // 执行查询
        const [dataResult, countResult] = await Promise.all([
            sql({
                query: dataQuery,
                values: [...params, limit, offset]
            }),
            sql({
                query: countQuery,
                values: params
            })
        ]);

        // 格式化渠道数据，修复时区问题
        const channelData = (dataResult as any[]).map(row => ({
            stat_date: formatDateToString(row.stat_date),
            register_users: row.register_users || 0,
            valid_register_users: row.valid_register_users || 0,
            character_count: row.character_count || 0,
            high_value_users_200: row.high_value_users_200 || 0,
            recharge_times: row.recharge_times || 0,
            recharge_users: row.recharge_users || 0,
            real_recharge_amount: parseFloat(row.real_recharge_amount || '0'),
            high_value_recharge_amount: parseFloat(row.high_value_recharge_amount || '0')
        }));

        const total = ((countResult as any[])?.[0]?.total) || 0;

        return {
            success: true,
            data: {
                list: channelData,
                pagination: {
                    page: currentPage,
                    pageSize: limit,
                    total: total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        };

    } catch (e: any) {
        console.error('获取渠道数据失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取渠道数据失败',
        });
    }
}

// 获取渠道结算数据
export const getChannelSettlementData = defineEventHandler(async (evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const adminId = parseInt(query.admin_id as string) || null;
        
        if (!adminId) {
            throw createError({
                status: 400,
                message: '缺少管理员ID'
            });
        }

        // 获取当前管理员信息
        const currentAdmin = await AdminModel.getAdminWithPermissions(adminId);
        if (!currentAdmin) {
            throw createError({
                status: 404,
                message: '管理员不存在'
            });
        }

        let childAgents = [];

        if (currentAdmin.level === 0) {
            // 超级管理员：显示所有1级代理
            const result = await sql({
                query: `SELECT * FROM Admins 
                       WHERE level = 1 AND is_active = 1 
                       ORDER BY name`,
                values: []
            });
            childAgents = result as any[];
        } else {
            // 其他代理：只显示直接下级代理（下一级别的代理）
            const targetLevel = currentAdmin.level + 1; // 目标级别：当前级别+1
            
            console.log(`[渠道结算数据] 当前管理员: ${currentAdmin.name} (级别${currentAdmin.level})`);
            console.log(`[渠道结算数据] 查找直接下级代理 (级别${targetLevel})`);
            
            const allowedChannelCodes = currentAdmin.allowed_channel_codes || [];
            
            if (allowedChannelCodes.length > 0) {
                // 清理空格并排除自己的渠道代码
                const cleanedChannelCodes = allowedChannelCodes
                    .map((code: any) => typeof code === 'string' ? code.trim() : code)
                    .filter((code: any) => code && code !== '');
                    
                const childChannelCodes = cleanedChannelCodes.filter(code => code !== currentAdmin.channel_code);
                
                if (childChannelCodes.length > 0) {
                    const placeholders = childChannelCodes.map(() => '?').join(',');
                    
                    // 只查找指定级别的直接下级代理
                    const result = await sql({
                        query: `SELECT * FROM Admins 
                               WHERE channel_code IN (${placeholders}) 
                               AND is_active = 1 
                               AND level = ?
                               ORDER BY name`,
                        values: [...childChannelCodes, targetLevel]
                    });
                    childAgents = result as any[];
                    
                    console.log(`[渠道结算数据] 找到 ${childAgents.length} 个级别${targetLevel}的直接下级代理:`);
                    childAgents.forEach(agent => {
                        console.log(`  - ${agent.name} (${agent.channel_code}) 级别${agent.level}`);
                    });
                } else {
                    console.log(`[渠道结算数据] 没有找到下级渠道代码`);
                }
            } else {
                console.log(`[渠道结算数据] 当前管理员没有允许的渠道代码`);
            }
        }

        // 获取昨日和今日的日期（使用东8区时间）
        const todayStr = getChinaDateString();
        const yesterdayStr = getChinaYesterdayString();

        const settlementData = [];

        console.log(`[渠道结算数据] 开始处理 ${childAgents.length} 个下级代理的数据`);

        for (const agent of childAgents) {
            console.log(`[渠道结算数据] 处理代理: ${agent.name} (${agent.channel_code})`);
            
            // 获取该代理管辖的所有渠道代码（使用allowed_channel_codes）
            let allChannelCodes = [];
            try {
                if (agent.allowed_channel_codes) {
                    // 解析 allowed_channel_codes 字段
                    if (typeof agent.allowed_channel_codes === 'string') {
                        allChannelCodes = JSON.parse(agent.allowed_channel_codes);
                    } else {
                        allChannelCodes = agent.allowed_channel_codes;
                    }
                } else {
                    // 如果没有allowed_channel_codes，至少包含自己的渠道代码
                    allChannelCodes = [agent.channel_code];
                }
                
                // 清理空格并去重
                allChannelCodes = allChannelCodes
                    .map((code: any) => typeof code === 'string' ? code.trim() : code)
                    .filter((code: any) => code && code !== '')
                    .filter((code: any, index: number, arr: any[]) => arr.indexOf(code) === index);
                
                // 确保包含代理自己的渠道代码
                if (!allChannelCodes.includes(agent.channel_code)) {
                    allChannelCodes.unshift(agent.channel_code);
                }
                
                console.log(`[渠道结算数据] 代理 ${agent.name} 管辖的渠道:`, allChannelCodes);
            } catch (e) {
                console.warn(`解析代理 ${agent.name} 的 allowed_channel_codes 失败，使用默认渠道代码`);
                allChannelCodes = [agent.channel_code];
            }

            // 构建 IN 查询的占位符
            const placeholders = allChannelCodes.map(() => '?').join(',');

            // 昨日流水
            const yesterdayPayments = await sql({
                query: `SELECT COALESCE(SUM(amount), 0) as total
                       FROM PaymentRecords pr
                       LEFT JOIN Users u ON pr.user_id = u.id
                       WHERE u.channel_code IN (${placeholders})
                       AND DATE(pr.created_at) = ?
                       AND pr.payment_status = 3
                       AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
                values: [...allChannelCodes, yesterdayStr]
            }) as any[];

            // 今日流水
            const todayPayments = await sql({
                query: `SELECT COALESCE(SUM(amount), 0) as total
                       FROM PaymentRecords pr
                       LEFT JOIN Users u ON pr.user_id = u.id
                       WHERE u.channel_code IN (${placeholders})
                       AND DATE(pr.created_at) = ?
                       AND pr.payment_status = 3
                       AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
                values: [...allChannelCodes, todayStr]
            }) as any[];

            // 总流水
            const totalPayments = await sql({
                query: `SELECT COALESCE(SUM(amount), 0) as total
                       FROM PaymentRecords pr
                       LEFT JOIN Users u ON pr.user_id = u.id
                       WHERE u.channel_code IN (${placeholders})
                       AND pr.payment_status = 3
                       AND (pr.payment_way NOT LIKE '%平台币%' OR pr.payment_way IS NULL OR pr.payment_way = '')`,
                values: allChannelCodes
            }) as any[];

            const yesterdayAmount = parseFloat(yesterdayPayments[0]?.total || 0);
            const todayAmount = parseFloat(todayPayments[0]?.total || 0);
            const totalAmount = parseFloat(totalPayments[0]?.total || 0);
            
            // 计算结算金额 (流水 * 分成比例 / 100)
            const divideRate = (agent.divide_rate || 0) / 100;
            const yesterdaySettlement = yesterdayAmount * divideRate;
            const todaySettlement = todayAmount * divideRate;
            const totalSettlement = totalAmount * divideRate;

            console.log(`[渠道结算数据] 代理 ${agent.name} 的收入统计:`);
            console.log(`  - 管辖渠道数量: ${allChannelCodes.length}`);
            console.log(`  - 昨日流水: ¥${yesterdayAmount}`);
            console.log(`  - 今日流水: ¥${todayAmount}`);
            console.log(`  - 总流水: ¥${totalAmount}`);
            console.log(`  - 分成比例: ${agent.divide_rate}%`);
            console.log(`  - 昨日结算: ¥${yesterdaySettlement.toFixed(2)}`);

            settlementData.push({
                agent_id: agent.id,
                agent_name: agent.name,
                channel_code: agent.channel_code,
                divide_rate: agent.divide_rate,
                channel_count: allChannelCodes.length, // 该代理管辖的渠道数量
                covered_channels: allChannelCodes, // 该代理管辖的所有渠道列表
                yesterday_amount: yesterdayAmount,
                yesterday_settlement: yesterdaySettlement,
                today_amount: todayAmount,
                today_settlement: todaySettlement,
                total_amount: totalAmount,
                total_settlement: totalSettlement
            });
        }

        return {
            success: true,
            data: {
                settlement_data: settlementData,
                current_admin: {
                    name: currentAdmin.name,
                    level: currentAdmin.level,
                    divide_rate: currentAdmin.divide_rate
                }
            }
        };

    } catch (e: any) {
        console.error('获取渠道结算数据失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取渠道结算数据失败',
        });
    }
})

// 获取礼包发放记录（管理员权限）
export const getGiftPackageRecords = async (evt: H3Event) => {
    try {
        const query = getQuery(evt);
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        
        // 权限检查 - 获取当前登录管理员的权限
        const authorizationHeader = getHeader(evt, 'authorization');
        const token = authorizationHeader ? parseInt(authorizationHeader) : null;
        
        let adminPermissions = null;
        let allowedChannelCodes: string[] = [];
        
        if (token) {
            try {
                const adminWithPermissions = await AdminModel.getAdminWithPermissions(token);
                
                if (!adminWithPermissions) {
                    throw createError({
                        status: 403,
                        message: '管理员不存在',
                    });
                }

                adminPermissions = adminWithPermissions;
                
                // 超级管理员(level 0)可以查看所有数据
                if (adminWithPermissions.level === 0) {
                    allowedChannelCodes = []; // 空数组表示无限制
                } else {
                    // 普通管理员使用 allowed_channel_codes 权限
                    allowedChannelCodes = adminWithPermissions.allowed_channel_codes || [];
                }
                
                console.log(`管理员 ${adminWithPermissions.name} 的礼包数据权限:`, {
                    level: adminWithPermissions.level,
                    allowedChannelCodes: allowedChannelCodes
                });
            } catch (error) {
                console.error('礼包数据权限检查失败:', error);
                throw createError({
                    status: 403,
                    message: '权限验证失败',
                });
            }
        } else {
            throw createError({
                status: 401,
                message: '未提供认证token',
            });
        }
        
        const filters: any = {};
        if (query.user_id) filters.user_id = parseInt(query.user_id as string);
        if (query.thirdparty_uid) filters.thirdparty_uid = query.thirdparty_uid as string;
        if (query.mch_order_id) filters.mch_order_id = query.mch_order_id as string;
        if (query.packageType && query.packageType !== 'all') filters.packageType = query.packageType as string;
        if (query.status && query.status !== 'all') filters.status = query.status as string;
        if (query.game_delivery_status && query.game_delivery_status !== 'all') filters.game_delivery_status = query.game_delivery_status as string;
        if (query.startDate) filters.startDate = query.startDate as string;
        if (query.endDate) filters.endDate = query.endDate as string;
        if (query.package_name) filters.package_name = query.package_name as string;
        
        // 获取礼包记录数据
        const [records, total, stats] = await Promise.all([
            getGiftPackageRecordsWithFilters(page, pageSize, filters, allowedChannelCodes),
            getGiftPackageRecordsCount(filters, allowedChannelCodes),
            getGiftPackageRecordsStats(filters, allowedChannelCodes)
        ]);
        
        return {
            success: true,
            data: {
                records,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                },
                stats,
                filters
            }
        };
    } catch (e: any) {
        console.error('获取礼包发放记录失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取礼包发放记录失败',
        });
    }
};

// 获取礼包记录列表（带筛选和分页）
const getGiftPackageRecordsWithFilters = async (page: number, pageSize: number, filters: any, allowedChannelCodes: string[] = []) => {
    const offset = (page - 1) * pageSize;
    
    console.log('getGiftPackageRecordsWithFilters 参数:', { page, pageSize, filters, allowedChannelCodes });
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('gpr.user_id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.thirdparty_uid) {
        whereConditions.push('gpr.thirdparty_uid LIKE ?');
        values.push(`%${filters.thirdparty_uid}%`);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('gpr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.package_name) {
        whereConditions.push('gpr.package_name LIKE ?');
        values.push(`%${filters.package_name}%`);
    }
    
    if (filters.status) {
        whereConditions.push('gpr.status = ?');
        values.push(filters.status);
    }
    
    if (filters.game_delivery_status) {
        whereConditions.push('gpr.game_delivery_status = ?');
        values.push(filters.game_delivery_status);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(gpr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(gpr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    // 礼包类型过滤（基于礼包表的category字段）
    if (filters.packageType && filters.packageType !== 'all') {
        whereConditions.push('egp.category = ?');
        values.push(filters.packageType);
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

// 获取礼包记录总数
const getGiftPackageRecordsCount = async (filters: any, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('gpr.user_id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.thirdparty_uid) {
        whereConditions.push('gpr.thirdparty_uid LIKE ?');
        values.push(`%${filters.thirdparty_uid}%`);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('gpr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.package_name) {
        whereConditions.push('gpr.package_name LIKE ?');
        values.push(`%${filters.package_name}%`);
    }
    
    if (filters.status) {
        whereConditions.push('gpr.status = ?');
        values.push(filters.status);
    }
    
    if (filters.game_delivery_status) {
        whereConditions.push('gpr.game_delivery_status = ?');
        values.push(filters.game_delivery_status);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(gpr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(gpr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    // 礼包类型过滤（基于礼包表的category字段）
    if (filters.packageType && filters.packageType !== 'all') {
        whereConditions.push('egp.category = ?');
        values.push(filters.packageType);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const query = `
        SELECT COUNT(*) as total 
        FROM GiftPackagePurchaseRecords gpr
        LEFT JOIN Users u ON gpr.user_id = u.id
        LEFT JOIN ExternalGiftPackages egp ON gpr.package_id = egp.id
        ${whereClause}
    `;
    
    const result = await sql({
        query,
        values,
    }) as any[];
    
    return result[0]?.total || 0;
};

// 获取礼包记录统计数据
const getGiftPackageRecordsStats = async (filters: any, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`u.channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`);
        values.push(...allowedChannelCodes);
    }
    
    if (filters.user_id) {
        whereConditions.push('gpr.user_id = ?');
        values.push(filters.user_id);
    }
    
    if (filters.thirdparty_uid) {
        whereConditions.push('gpr.thirdparty_uid LIKE ?');
        values.push(`%${filters.thirdparty_uid}%`);
    }
    
    if (filters.mch_order_id) {
        whereConditions.push('gpr.mch_order_id LIKE ?');
        values.push(`%${filters.mch_order_id}%`);
    }
    
    if (filters.package_name) {
        whereConditions.push('gpr.package_name LIKE ?');
        values.push(`%${filters.package_name}%`);
    }
    
    if (filters.status) {
        whereConditions.push('gpr.status = ?');
        values.push(filters.status);
    }
    
    if (filters.game_delivery_status) {
        whereConditions.push('gpr.game_delivery_status = ?');
        values.push(filters.game_delivery_status);
    }
    
    if (filters.startDate) {
        whereConditions.push('DATE(gpr.created_at) >= ?');
        values.push(filters.startDate);
    }
    
    if (filters.endDate) {
        whereConditions.push('DATE(gpr.created_at) <= ?');
        values.push(filters.endDate);
    }
    
    // 礼包类型过滤（通过remark字段分析）
    if (filters.packageType) {
        if (filters.packageType === 'purchased') {
            whereConditions.push("(gpr.remark = '发放成功' OR (gpr.remark IS NOT NULL AND gpr.remark NOT LIKE '%自动发放%' AND gpr.remark != ''))");
        } else if (filters.packageType === 'daily') {
            whereConditions.push("gpr.remark LIKE '%当日消费达到%'");
        } else if (filters.packageType === 'cumulative') {
            whereConditions.push("gpr.remark LIKE '%累计消费达到%'");
        }
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const query = `
        SELECT 
            COUNT(*) as totalRecords,
            COALESCE(SUM(gpr.total_amount), 0) as totalAmount,
            COUNT(CASE WHEN gpr.status = 'delivered' THEN 1 END) as deliveredCount,
            COUNT(DISTINCT gpr.user_id) as uniqueUsers
        FROM GiftPackagePurchaseRecords gpr
        LEFT JOIN Users u ON gpr.user_id = u.id
        ${whereClause}
    `;
    
    const result = await sql({
        query,
        values,
    }) as any[];
    
    return result[0] || {
        totalRecords: 0,
        totalAmount: 0,
        deliveredCount: 0,
        uniqueUsers: 0
    };
};

