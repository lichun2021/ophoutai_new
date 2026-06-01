#!/usr/bin/env node
/**
 * Daily statistics collection script
 * Usage:
 * node scripts/daily-stats.js [date]
 * 
 * Examples:
 * node scripts/daily-stats.js                   # Run today's data
 * node scripts/daily-stats.js 2025-06-24       # Run specific date data
 */

import StatsCollector from './stats-collector.js';
import { logInfo, logError } from './config.js';

async function runDailyStats() {
    const collector = new StatsCollector();
    
    try {
        // Get target date
        const targetDate = process.argv[2] || null;
        
        if (targetDate) {
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(targetDate)) {
                throw new Error('Invalid date format, please use YYYY-MM-DD');
            }
            logInfo(`Running daily stats for specific date: ${targetDate}`);
        } else {
            logInfo('Running daily stats for today');
        }

        // Connect to database
        await collector.connectDB();

        // Collect daily stats
        await collector.collectDailyStats(targetDate);

        logInfo('Daily stats collection task completed');

    } catch (error) {
        logError(`Daily stats collection failed: ${error.message}`);
        process.exit(1);
    } finally {
        // Close database connection
        await collector.close();
    }
}

// Run script
runDailyStats(); 