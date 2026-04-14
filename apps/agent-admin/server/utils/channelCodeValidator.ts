/**
 * 渠道代码验证工具
 */

import { sql } from '../db';

/**
 * 验证渠道代码格式
 * @param channelCode 渠道代码
 * @returns 验证结果
 */
export const validateChannelCodeFormat = (channelCode: string): { valid: boolean; message: string } => {
    // 基本验证
    if (!channelCode || typeof channelCode !== 'string') {
        return { valid: false, message: '渠道代码不能为空' };
    }

    // 去除首尾空格
    const trimmedCode = channelCode.trim();
    if (trimmedCode.length === 0) {
        return { valid: false, message: '渠道代码不能为空' };
    }

    // 长度验证 (3-20个字符)
    if (trimmedCode.length < 3) {
        return { valid: false, message: '渠道代码至少需要3个字符' };
    }
    if (trimmedCode.length > 20) {
        return { valid: false, message: '渠道代码不能超过20个字符' };
    }

    // 不能包含空格
    if (/\s/.test(trimmedCode)) {
        return { valid: false, message: '渠道代码不能包含空格' };
    }

    // 字符验证 - 只允许字母、数字、下划线、连字符
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(trimmedCode)) {
        return { 
            valid: false, 
            message: '渠道代码只能包含字母、数字、下划线(_)和连字符(-)' 
        };
    }

    return { valid: true, message: '渠道代码格式正确' };
};

/**
 * 检查渠道代码是否已存在
 * @param channelCode 渠道代码
 * @param excludeId 排除的ID（用于编辑时排除自己）
 * @returns 检查结果
 */
export const checkChannelCodeExists = async (channelCode: string, excludeId?: number): Promise<{ exists: boolean; message: string; existingAdmin?: any }> => {
    try {
        const trimmedCode = channelCode.trim();
        
        let query = 'SELECT id, name, channel_code FROM Admins WHERE channel_code = ? AND is_active = 1';
        let values: any[] = [trimmedCode];

        if (excludeId) {
            query += ' AND id != ?';
            values.push(excludeId);
        }

        const result = await sql({ query, values }) as any[];
        
        if (result.length > 0) {
            const existingAdmin = result[0];
            return { 
                exists: true, 
                message: `渠道代码已被代理 "${existingAdmin.name}" 使用，请选择其他代码`,
                existingAdmin
            };
        }

        return { exists: false, message: '渠道代码可用' };
    } catch (error) {
        console.error('检查渠道代码存在性失败:', error);
        return { exists: true, message: '检查渠道代码时发生错误，请稍后重试' };
    }
};

/**
 * 完整的渠道代码验证（格式+查重）
 * @param channelCode 渠道代码
 * @param excludeId 排除的ID（用于编辑时排除自己）
 * @returns 验证结果
 */
export const validateChannelCode = async (channelCode: string, excludeId?: number): Promise<{ valid: boolean; message: string; cleanCode?: string }> => {
    // 格式验证
    const formatValidation = validateChannelCodeFormat(channelCode);
    if (!formatValidation.valid) {
        return formatValidation;
    }

    const cleanCode = channelCode.trim();

    // 存在性验证
    const existenceCheck = await checkChannelCodeExists(cleanCode, excludeId);
    if (existenceCheck.exists) {
        return { valid: false, message: existenceCheck.message };
    }

    return { valid: true, message: '渠道代码验证通过', cleanCode };
}; 