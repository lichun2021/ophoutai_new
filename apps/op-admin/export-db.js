#!/usr/bin/env node
/**
 * quantum_db 数据库导出脚本
 * 导出完整结构 + 按规则过滤数据：
 *   - Admins         : 只导出超级管理员 (level = 0)
 *   - Users          : 只导出结构，不导出数据
 *   - 日志类表        : 只导出结构，不导出数据
 *   - 支付记录类表    : 只导出结构，不导出数据
 *   - 其余所有表      : 完整数据
 *
 * 用法:
 *   node scripts/export-db.js
 *   node scripts/export-db.js --output ./backup.sql
 *   DB_HOST=1.2.3.4 node scripts/export-db.js
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 数据库配置（与 config.js 保持一致）──────────────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'A1q2w3e4r!@#1234',
    database: process.env.DB_NAME || 'quantum_db',
    charset: 'utf8mb4',
    timezone: '+08:00',
    multipleStatements: true,
};

// ── 过滤规则 ─────────────────────────────────────────────────────────
/**
 * 这些表只导出结构，不导出任何数据。
 * 表名不区分大小写（统一转小写比较）。
 */
const NO_DATA_TABLES = new Set([
    // 用户表
    'users',
    // 日志类
    'userloginlogs',
    'gmoperationlogs',
    'dailystats',
    'ltvstats',
    'recharge_daily',
    // 支付记录类
    'paymentrecords',
    'platformcoinrecharge',

    'admintoplayerplatformcointransactions',
    'agentrelationships',
    'cdkcodes',

    'cdkredemptions',
    'giftpackagepurchaserecords',
    'gamecharacters',
    'subusers',

    'logs',
    'gm_operation_logs',


]);

/**
 * 特殊过滤：只导出部分行
 * key   = 表名小写
 * value = WHERE 条件字符串
 */
const PARTIAL_DATA_TABLES = {
    admins: 'level = 0',   // 只导出超级管理员
};

// ── 输出文件 ─────────────────────────────────────────────────────────
const outputArg = process.argv.indexOf('--output');
const outputFile = outputArg !== -1
    ? process.argv[outputArg + 1]
    : path.join(__dirname, `quantum_db_export_${dateTag()}.sql`);

// ── 工具函数 ─────────────────────────────────────────────────────────
function dateTag() {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function log(msg) { console.log(`[${new Date().toISOString()}] INFO: ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] WARN: ${msg}`); }
function err(msg) { console.error(`[${new Date().toISOString()}] ERROR: ${msg}`); }

/**
 * 把一行数据转成 SQL 值列表，处理 null / Buffer / Date / JSON对象 / 字符串转义
 * 注意：mysql2 会把 JSON 列自动解析为 JS 对象，需要先 JSON.stringify 再转义
 */
function rowToValues(row, columns) {
    return columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return 'NULL';
        if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
        if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
        if (typeof val === 'number' || typeof val === 'bigint') return String(val);
        // mysql2 把 JSON 列自动解析为对象/数组，先序列化回字符串
        const str = (typeof val === 'object') ? JSON.stringify(val) : String(val);
        // 转义单引号、反斜杠、换行
        return `'${str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\0/g, '\\0')}'`;
    });
}

// ── 主流程 ────────────────────────────────────────────────────────────
async function main() {
    log(`连接数据库 ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} ...`);
    const conn = await mysql.createConnection(DB_CONFIG);
    log('数据库连接成功');

    const lines = [];

    // 文件头
    lines.push(`-- ============================================================`);
    lines.push(`-- quantum_db 数据库导出`);
    lines.push(`-- 导出时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    lines.push(`-- 主机: ${DB_CONFIG.host}`);
    lines.push(`-- 过滤规则:`);
    lines.push(`--   不含数据: ${[...NO_DATA_TABLES].join(', ')}`);
    lines.push(`--   admins 只含超级管理员 (level=0)`);
    lines.push(`-- ============================================================`);
    lines.push('');
    lines.push('SET NAMES utf8mb4;');
    lines.push('SET FOREIGN_KEY_CHECKS = 0;');
    lines.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
    lines.push('SET time_zone = "+08:00";');
    lines.push('');

    // 获取所有表
    const [tableRows] = await conn.execute('SHOW TABLES');
    const dbKey = `Tables_in_${DB_CONFIG.database}`;
    const tables = tableRows.map(r => r[dbKey] || Object.values(r)[0]);
    log(`共发现 ${tables.length} 张表: ${tables.join(', ')}`);

    let tableCount = 0, rowsTotal = 0;

    for (const table of tables) {
        const tableLower = table.toLowerCase();
        log(`处理表: ${table}`);

        // 1. 获取建表语句
        const [[createRow]] = await conn.execute(`SHOW CREATE TABLE \`${table}\``);
        const createSql = createRow['Create Table'] || createRow[Object.keys(createRow)[1]];

        lines.push(`-- ──────────────────────────────────────────────────────────`);
        lines.push(`-- 表: ${table}`);
        lines.push(`-- ──────────────────────────────────────────────────────────`);
        lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
        lines.push(`${createSql};`);
        lines.push('');

        // 2. 判断是否导出数据
        if (NO_DATA_TABLES.has(tableLower)) {
            warn(`  → 跳过数据 (规则: 不导出)`);
            lines.push(`-- 数据已跳过（规则：该表不导出数据）`);
            lines.push('');
            tableCount++;
            continue;
        }

        // 3. 查询数据
        const where = PARTIAL_DATA_TABLES[tableLower]
            ? `WHERE ${PARTIAL_DATA_TABLES[tableLower]}`
            : '';

        if (where) {
            log(`  → 部分导出，条件: ${where}`);
        }

        const [rows] = await conn.execute(`SELECT * FROM \`${table}\` ${where}`);

        if (rows.length === 0) {
            lines.push(`-- 暂无符合条件的数据`);
            lines.push('');
            tableCount++;
            continue;
        }

        const columns = Object.keys(rows[0]);
        const colList = columns.map(c => `\`${c}\``).join(', ');

        // 每 500 行一个 INSERT
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            const valuesList = batch.map(row => `(${rowToValues(row, columns).join(', ')})`).join(',\n  ');
            lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);
            lines.push(`  ${valuesList};`);
        }

        lines.push('');
        rowsTotal += rows.length;
        log(`  → 导出 ${rows.length} 行`);
        tableCount++;
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('');
    lines.push(`-- 导出完成，共 ${tableCount} 张表，${rowsTotal} 行数据`);

    await conn.end();
    log('数据库连接已关闭');

    // 写文件
    const content = lines.join('\n');
    fs.writeFileSync(outputFile, content, 'utf8');
    log(`✅ 导出完成！文件: ${outputFile}`);
    log(`   大小: ${(Buffer.byteLength(content, 'utf8') / 1024 / 1024).toFixed(2)} MB`);
    log(`   表数: ${tableCount}，数据行数: ${rowsTotal}`);
}

main().catch(e => {
    err(`导出失败: ${e.message}`);
    process.exit(1);
});
