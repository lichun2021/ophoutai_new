import {sql} from '../db';
import { getChinaDateString } from '../utils/timezone';

export type UserLoginLog = {
    id?: number;
    username: string;
    sub_user_id?: number;
    sub_user_name?: string;
    game_code?: string;
    login_time: string;
    imei?: string;
    ip_address?: string;
    device?: string;
    channel_code?: string;
};

// 格式化日期为MySQL DATETIME格式
const formatDateForMySQL = (dateString: string): string => {
    try {
        // 如果是ISO格式，转换为MySQL格式
        if (dateString.includes('T') && dateString.includes('Z')) {
            return dateString.replace('T', ' ').replace('Z', '').substring(0, 19);
        }
        // 如果已经是MySQL格式，直接返回
        return dateString.substring(0, 19);
    } catch (error) {
        // 如果转换失败，使用当前时间
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
};

// 识别和格式化设备信息
const formatDeviceInfo = (userAgent: string): string => {
    if (!userAgent) {
        return 'Unknown';
    }
    
    const ua = userAgent.toLowerCase();
    
    // 移动设备检测
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
        if (ua.includes('android')) {
            return 'Mobile-Android';
        } else if (ua.includes('iphone')) {
            return 'Mobile-iPhone';
        } else if (ua.includes('ipad')) {
            return 'Mobile-iPad';
        } else {
            return 'Mobile';
        }
    }
    
    // 桌面系统检测
    if (ua.includes('windows')) {
        return 'PC-Windows';
    } else if (ua.includes('mac') && !ua.includes('iphone') && !ua.includes('ipad')) {
        return 'PC-Mac';
    } else if (ua.includes('linux')) {
        return 'PC-Linux';
    }
    
    // 浏览器检测（如果无法识别操作系统）
    if (ua.includes('chrome')) {
        return 'PC-Chrome';
    } else if (ua.includes('firefox')) {
        return 'PC-Firefox';
    } else if (ua.includes('safari')) {
        return 'PC-Safari';
    } else if (ua.includes('edge')) {
        return 'PC-Edge';
    }
    
    // 如果都无法识别，截断原始User-Agent到90字符以确保安全
    return userAgent.substring(0, 90);
};

// 规整IP地址为IPv4优先格式（支持 XFF 多值、::ffff:、::1、[::1]、带端口等）
const normalizeIPAddress = (raw: string): string => {
    if (!raw) return '127.0.0.1';
    let ip = String(raw).split(',')[0].trim();
    ip = ip.replace(/^\[/, '').replace(/\]$/, '');
    if (ip.toLowerCase() === 'unknown') return '127.0.0.1';
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') return '127.0.0.1';
    const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (ipv4WithPort) return ipv4WithPort[1];
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) return ip;
    return '127.0.0.1';
};

// 记录用户登录
export const recordLogin = async (loginData: Omit<UserLoginLog, 'id'>) => {
    const mysqlDateTime = formatDateForMySQL(loginData.login_time);
    const formattedDevice = formatDeviceInfo(loginData.device || '');
    // 不记录登录IP，统一置空
    const normalizedIp = '';
    
    const result = await sql({
        query: `INSERT INTO userloginlogs 
                (username, sub_user_id, sub_user_name, game_code, login_time, imei, ip_address, device, channel_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
            loginData.username,
            loginData.sub_user_id || null,
            loginData.sub_user_name || '',
            loginData.game_code || '',
            mysqlDateTime,
            loginData.imei || '',
            normalizedIp,
            formattedDevice,
            loginData.channel_code || ''
        ],
    });
    return result;
};

// 获取登录记录列表（分页）
export const getLoginLogs = async (page: number = 1, pageSize: number = 20, filters?: {
    username?: string;
    sub_user_name?: string;
    game_code?: string;
    imei?: string;
    channel_code?: string;
    startDate?: string;
    endDate?: string;
}, allowedChannelCodes: string[] = []) => {
    const offset = (page - 1) * pageSize;
    
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`)
        values.push(...allowedChannelCodes);
    }
    
    if (filters?.username) {
        whereConditions.push('username LIKE ?');
        values.push(`%${filters.username}%`);
    }
    
    if (filters?.sub_user_name) {
        whereConditions.push('sub_user_name LIKE ?');
        values.push(`%${filters.sub_user_name}%`);
    }
    
    if (filters?.game_code) {
        whereConditions.push('game_code LIKE ?');
        values.push(`%${filters.game_code}%`);
    }
    
    if (filters?.imei) {
        whereConditions.push('imei LIKE ?');
        values.push(`%${filters.imei}%`);
    }
    
    if (filters?.channel_code) {
        whereConditions.push('channel_code LIKE ?');
        values.push(`%${filters.channel_code}%`);
    }
    
    if (filters?.startDate) {
        whereConditions.push('login_time >= ?');
        values.push(filters.startDate);
    }
    
    if (filters?.endDate) {
        whereConditions.push('login_time <= ?');
        values.push(filters.endDate + ' 23:59:59');
    }
    
    let query = 'SELECT * FROM userloginlogs';
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    query += ' ORDER BY login_time DESC LIMIT ? OFFSET ?';
    
    values.push(pageSize, offset);
    
    const result = await sql({
        query: query,
        values: values,
    });
    
    return result as UserLoginLog[];
};

// 获取登录记录总数
export const getLoginLogsCount = async (filters?: {
    username?: string;
    sub_user_name?: string;
    game_code?: string;
    imei?: string;
    channel_code?: string;
    startDate?: string;
    endDate?: string;
}, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`)
        values.push(...allowedChannelCodes);
    }
    
    if (filters?.username) {
        whereConditions.push('username LIKE ?');
        values.push(`%${filters.username}%`);
    }
    
    if (filters?.sub_user_name) {
        whereConditions.push('sub_user_name LIKE ?');
        values.push(`%${filters.sub_user_name}%`);
    }
    
    if (filters?.game_code) {
        whereConditions.push('game_code LIKE ?');
        values.push(`%${filters.game_code}%`);
    }
    
    if (filters?.imei) {
        whereConditions.push('imei LIKE ?');
        values.push(`%${filters.imei}%`);
    }
    
    if (filters?.channel_code) {
        whereConditions.push('channel_code LIKE ?');
        values.push(`%${filters.channel_code}%`);
    }
    
    if (filters?.startDate) {
        whereConditions.push('login_time >= ?');
        values.push(filters.startDate);
    }
    
    if (filters?.endDate) {
        whereConditions.push('login_time <= ?');
        values.push(filters.endDate + ' 23:59:59');
    }
    
    let query = 'SELECT COUNT(*) as total FROM userloginlogs';
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    const result = await sql({
        query: query,
        values: values,
    }) as any;
    
    return result[0].total;
};

// 获取今日登录统计
export const getTodayLoginStats = async () => {
    const today = getChinaDateString();
    
    const result = await sql({
        query: `SELECT 
                    COUNT(*) as total_logins,
                    COUNT(DISTINCT username) as unique_users
                FROM userloginlogs 
                WHERE DATE(login_time) = ?`,
        values: [today],
    }) as any;
    
    return result[0];
};

// 获取指定日期范围的登录统计
export const getLoginStatsForDateRange = async (startDate?: string, endDate?: string, allowedChannelCodes: string[] = []) => {
    let whereConditions = [];
    let values: any[] = [];
    
    // 权限过滤：非超级管理员需要按照allowed_channel_codes过滤
    if (allowedChannelCodes.length > 0) {
        whereConditions.push(`channel_code IN (${allowedChannelCodes.map(() => '?').join(',')})`)
        values.push(...allowedChannelCodes);
    }
    
    if (startDate) {
        whereConditions.push('login_time >= ?');
        values.push(startDate);
    }
    
    if (endDate) {
        whereConditions.push('login_time <= ?');
        values.push(endDate + ' 23:59:59');
    }
    
    let query = `SELECT 
                    COUNT(*) as total_logins,
                    COUNT(DISTINCT username) as unique_users
                FROM userloginlogs`;
    
    if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    const result = await sql({
        query: query,
        values: values,
    }) as any;
    
    return result[0];
}; 