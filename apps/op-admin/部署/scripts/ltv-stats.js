#!/usr/bin/env node
/**
 * LTV统计数据收集脚本
 * 使用方法:
 * node scripts/ltv-stats.js [日期]
 * 
 * 示例:
 * node scripts/ltv-stats.js                     # 运行今日数据
 * node scripts/ltv-stats.js 2025-06-24         # 运行指定日期数据
 */

import StatsCollector from './stats-collector.js';
import { logInfo, logError } from './config.js';

async function runLtvStats() {
    const collector = new StatsCollector();
    
    try {
        // 获取目标日期
        const targetDate = process.argv[2] || null;
        
        if (targetDate) {
            // 验证日期格式
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(targetDate)) {
                throw new Error('日期格式错误，请使用 YYYY-MM-DD 格式');
            }
            logInfo(`运行指定日期的LTV统计: ${targetDate}`);
        } else {
            logInfo('运行今日的LTV统计数据收集');
        }

        // 连接数据库
        await collector.connectDB();

        // 收集LTV统计数据
        await collector.collectLtvStats(targetDate);

        logInfo('LTV统计数据收集任务完成');

    } catch (error) {
        logError(`LTV统计数据收集失败: ${error.message}`);
        process.exit(1);
    } finally {
        // 关闭数据库连接
        await collector.close();
    }
}

// 运行脚本
runLtvStats(); 