/**
 * 时区工具函数 - 统一使用东8区时间
 */

/**
 * 获取东8区的当前日期字符串 (YYYY-MM-DD)
 * @returns {string} 格式: 2023-12-25
 */
export function getChinaDateString(): string {
    const now = new Date();
    // 转换为东8区时间 (UTC+8)
    const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = chinaTime.getUTCFullYear();
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(chinaTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取东8区的昨天日期字符串 (YYYY-MM-DD)
 * @returns {string} 格式: 2023-12-24
 */
export function getChinaYesterdayString(): string {
    const now = new Date();
    // 转换为东8区时间 (UTC+8)
    const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    // 减去一天
    const yesterday = new Date(chinaTime.getTime() - (24 * 60 * 60 * 1000));
    const year = yesterday.getUTCFullYear();
    const month = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取东8区的指定天数前的日期字符串 (YYYY-MM-DD)
 * @param {number} daysAgo 天数前，例如 7 表示7天前
 * @returns {string} 格式: 2023-12-18
 */
export function getChinaDateStringDaysAgo(daysAgo: number): string {
    const now = new Date();
    // 转换为东8区时间 (UTC+8)
    const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    // 减去指定天数
    const targetDate = new Date(chinaTime.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    const year = targetDate.getUTCFullYear();
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取东8区的当前时间对象
 * @returns {Date} 东8区时间的Date对象
 */
export function getChinaTime(): Date {
    const now = new Date();
    // 转换为东8区时间 (UTC+8)
    return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

/**
 * 获取东8区的完整日期时间字符串 (YYYY-MM-DD HH:mm:ss)
 * @returns {string} 格式: 2023-12-25 14:30:45
 */
export function getChinaDateTimeString(): string {
    const chinaTime = getChinaTime();
    const year = chinaTime.getUTCFullYear();
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(chinaTime.getUTCDate()).padStart(2, '0');
    const hours = String(chinaTime.getUTCHours()).padStart(2, '0');
    const minutes = String(chinaTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(chinaTime.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 将任意Date对象转换为东8区的日期字符串
 * @param {Date} date 要转换的日期对象
 * @returns {string} 格式: 2023-12-25
 */
export function convertToChinaDateString(date: Date): string {
    // 转换为东8区时间 (UTC+8)
    const chinaTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    const year = chinaTime.getUTCFullYear();
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(chinaTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 检查日期字符串是否为今天（东8区）
 * @param {string} dateString 日期字符串 (YYYY-MM-DD)
 * @returns {boolean} 是否为今天
 */
export function isTodayInChina(dateString: string): boolean {
    return dateString === getChinaDateString();
}

/**
 * 检查日期字符串是否为昨天（东8区）
 * @param {string} dateString 日期字符串 (YYYY-MM-DD)
 * @returns {boolean} 是否为昨天
 */
export function isYesterdayInChina(dateString: string): boolean {
    return dateString === getChinaYesterdayString();
}