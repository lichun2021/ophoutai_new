import { H3Event, readBody, createError } from 'h3';
import * as SettlementsModel from '../model/settlements';
import * as AdminModel from '../model/admin';

// 计算代理可提现金额
export const calculateWithdrawableAmount = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { admin_id } = body;
        
        if (!admin_id) {
            console.error('[calculateWithdrawableAmount] 缺少管理员ID');
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        const result = await SettlementsModel.calculateWithdrawableAmount(parseInt(admin_id));
        return result;
    } catch (e: any) {
        console.error('[calculateWithdrawableAmount] 计算可提现金额失败:', e);
        throw createError({
            status: 500,
            message: e.message || '计算可提现金额失败',
        });
    }
};

// 提交结算申请
export const submitSettlementRequest = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { 
            admin_id, 
            settlement_amount, 
            u_address, 
            settlement_method = 'U', 
            remark = '' 
        } = body;
        
        if (!admin_id || !settlement_amount || !u_address) {
            console.error('[submitSettlementRequest] 缺少必要参数');
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        // 获取管理员信息
        const admin = await AdminModel.getAdminWithPermissions(parseInt(admin_id));
        if (!admin) {
            console.error('[submitSettlementRequest] 管理员不存在');
            throw createError({
                status: 404,
                message: '管理员不存在',
            });
        }
        
        // 检查U地址
        let addressWarning = '';
        if (admin.u_address) {
            if (admin.u_address !== u_address) {
                addressWarning = '提交的U地址与账户绑定地址不一致';
            }
        } else {
            addressWarning = '账户未绑定U地址';
        }
        
        // 计算可提现金额
        console.log(`[submitSettlementRequest] 计算管理员ID ${admin_id} 的可提现金额`);
        const withdrawableResult = await SettlementsModel.calculateWithdrawableAmount(parseInt(admin_id));
        if (!withdrawableResult.success) {
            console.error('[submitSettlementRequest] 计算可提现金额失败');
            throw createError({
                status: 400,
                message: withdrawableResult.message || '计算可提现金额失败',
            });
        }
        
        const maxWithdrawable = withdrawableResult.data.withdrawable_amount;
        const availableAmount = withdrawableResult.data.available_amount || 0;
        
        if (availableAmount <= 0) {
            console.error('[submitSettlementRequest] 暂无可结算流水');
            throw createError({
                status: 400,
                message: '暂无可结算流水',
            });
        }
        
        if (parseFloat(settlement_amount) > maxWithdrawable) {
            console.error('[submitSettlementRequest] 申请金额超过可提现金额');
            throw createError({
                status: 400,
                message: `申请金额不能超过可提现金额 ¥${maxWithdrawable.toFixed(2)}`,
            });
        }
        
        // 创建结算记录
        console.log(`[submitSettlementRequest] 创建结算记录，管理员ID: ${admin_id}`);
        const settlementData = {
            admin_id: parseInt(admin_id),
            admin_name: admin.name,
            admin_level: admin.level,
            total_amount: availableAmount, // 使用可结算流水而不是总流水
            divide_rate: admin.divide_rate || 0,
            settlement_amount: parseFloat(settlement_amount),
            status: 0, // 待结算
            u_address,
            settlement_method,
            channel_code: admin.channel_code || '',
            remark
        };
        
        const result = await SettlementsModel.insert(settlementData);
        
        console.log('[submitSettlementRequest] 结算申请提交成功');
        return {
            success: true,
            message: '结算申请提交成功',
            data: result,
            warning: addressWarning
        };
    } catch (e: any) {
        console.error('[submitSettlementRequest] 提交结算申请失败:', e);
        throw createError({
            status: 500,
            message: e.message || '提交结算申请失败',
        });
    }
};

// 获取结算记录
export const getSettlementRecords = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { admin_id, page = 1, page_size = 20 } = body;
        
        console.log('[getSettlementRecords] 请求参数:', body);
        
        if (!admin_id) {
            console.error('[getSettlementRecords] 缺少管理员ID');
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const result = await SettlementsModel.getAdminRelatedSettlements(
            parseInt(admin_id),
            parseInt(page),
            parseInt(page_size)
        );
        
        console.log('[getSettlementRecords] 获取结算记录成功');
        return {
            success: true,
            data: result
        };
    } catch (e: any) {
        console.error('[getSettlementRecords] 获取结算记录失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取结算记录失败',
        });
    }
};

// 获取管理员U地址
export const getAdminUAddress = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { admin_id } = body;
        
        console.log('[getAdminUAddress] 请求参数:', body);
        
        if (!admin_id) {
            console.error('[getAdminUAddress] 缺少管理员ID');
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        const admin = await AdminModel.getAdminWithPermissions(parseInt(admin_id));
        if (!admin) {
            console.error('[getAdminUAddress] 管理员不存在');
            throw createError({
                status: 404,
                message: '管理员不存在',
            });
        }
        
        console.log('[getAdminUAddress] 获取管理员U地址成功');
        return {
            success: true,
            data: {
                u_address: admin.u_address || '',
                has_u_address: !!admin.u_address
            }
        };
    } catch (e: any) {
        console.error('[getAdminUAddress] 获取管理员U地址失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取管理员U地址失败',
        });
    }
};

// 更新管理员U地址
export const updateAdminUAddress = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { admin_id, u_address } = body;
        
        console.log('[updateAdminUAddress] 请求参数:', body);
        
        if (!admin_id || !u_address) {
            console.error('[updateAdminUAddress] 缺少必要参数');
            throw createError({
                status: 400,
                message: '缺少必要参数',
            });
        }
        
        // 验证U地址格式（简单验证）
        if (u_address.length < 10 || u_address.length > 100) {
            console.error('[updateAdminUAddress] U地址格式不正确');
            throw createError({
                status: 400,
                message: 'U地址格式不正确',
            });
        }
        
        console.log(`[updateAdminUAddress] 更新管理员ID ${admin_id} 的U地址`);
        await AdminModel.updateAdmin(parseInt(admin_id), { u_address });
        
        console.log('[updateAdminUAddress] U地址更新成功');
        return {
            success: true,
            message: 'U地址更新成功'
        };
    } catch (e: any) {
        console.error('[updateAdminUAddress] 更新管理员U地址失败:', e);
        throw createError({
            status: 500,
            message: e.message || '更新管理员U地址失败',
        });
    }
};

// 获取下级代理的结算申请
export const getChildSettlementRequests = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { 
            admin_id, 
            page = 1, 
            page_size = 20,
            selected_agent = '',
            status = ''
        } = body;
        
        console.log('[getChildSettlementRequests] 请求参数:', body);
        
        if (!admin_id) {
            console.error('[getChildSettlementRequests] 缺少管理员ID');
            throw createError({
                status: 400,
                message: '缺少管理员ID',
            });
        }
        
        console.log('结算管理筛选参数:', {
            admin_id,
            selected_agent,
            status,
            page,
            page_size
        });
        
        const result = await SettlementsModel.getChildAdminSettlements(
            parseInt(admin_id),
            parseInt(page),
            parseInt(page_size),
            selected_agent || null,
            status !== '' ? parseInt(status) : null
        );
        
        console.log('[getChildSettlementRequests] 获取下级结算申请成功');
        return {
            success: true,
            data: result
        };
    } catch (e: any) {
        console.error('获取下级结算申请失败:', e);
        throw createError({
            status: 500,
            message: e.message || '获取下级结算申请失败',
        });
    }
};

// 审核结算申请（通过/拒绝）
export const reviewSettlementRequest = async (evt: H3Event) => {
    try {
        const body = await readBody(evt);
        const { settlement_id, status, remark = '' } = body;
        
        console.log('[reviewSettlementRequest] 请求参数:', body);
        
        if (!settlement_id || (status !== 1 && status !== 2)) {
            console.error('[reviewSettlementRequest] 缺少必要参数或状态无效');
            throw createError({
                status: 400,
                message: '缺少必要参数或状态无效',
            });
        }
        
        // 更新结算状态
        console.log(`[reviewSettlementRequest] 审核结算申请，结算ID: ${settlement_id}, 状态: ${status}`);
        await SettlementsModel.updateStatus(parseInt(settlement_id), status, remark);
        
        const statusText = status === 1 ? '通过' : '拒绝';
        
        console.log(`[reviewSettlementRequest] 结算申请${statusText}成功`);
        return {
            success: true,
            message: `结算申请${statusText}成功`
        };
    } catch (e: any) {
        console.error('[reviewSettlementRequest] 审核结算申请失败:', e);
        throw createError({
            status: 500,
            message: e.message || '审核结算申请失败',
        });
    }
}; 