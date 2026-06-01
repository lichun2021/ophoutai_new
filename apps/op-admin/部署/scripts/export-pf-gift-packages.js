#!/usr/bin/env node
/**
 * 导出旧后台 externalgiftpackages 表中 package_code 含 "pf" 的礼包
 * 同时输出：
 *   ① CSV  —— 供人工核对礼包内容
 *   ② SQL  —— 可直接在新后台数据库执行 INSERT（自动去重）
 *
 * 用法:
 *   node export-pf-gift-packages.js
 *   DB_HOST=旧库IP node export-pf-gift-packages.js
 *   DB_HOST=旧库IP node export-pf-gift-packages.js --keyword=pf
 *   DB_HOST=旧库IP node export-pf-gift-packages.js --keyword=pf --game-code=hzwqh
 *
 * 可选参数:
 *   --keyword=pf       匹配关键词（默认 pf，不区分大小写，匹配 package_code 或 package_name）
 *   --game-code=xxx    只导出指定 game_code 的礼包（默认全部）
 *   --all              导出全部礼包（忽略关键词过滤）
 *   --excel-bom        CSV 带 UTF-8 BOM（Excel 打开中文更友好）
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ── 参数解析 ──────────────────────────────────────────────────────────────
const parseArgs = () => {
    const args = process.argv.slice(2);
    const opts = {
        keyword:  'pf',
        gameCode: null,
        all:      false,
        excelBom: process.env.PTB_CSV_EXCEL_BOM === '1',
    };
    for (const arg of args) {
        if (arg.startsWith('--keyword='))    opts.keyword   = arg.split('=')[1] || 'pf';
        if (arg.startsWith('--game-code='))  opts.gameCode  = arg.split('=')[1] || null;
        if (arg === '--all')                 opts.all       = true;
        if (arg === '--excel-bom')           opts.excelBom  = true;
    }
    return opts;
};

// ── CSV 工具 ───────────────────────────────────────────────────────────────
const csvText  = (s) => `"${String(s ?? '').replace(/"/g, '""').trim()}"`;
const csvMoney = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00'; };
const csvInt   = (v) => { const n = Number(v); return Number.isFinite(n) ? String(Math.trunc(n)) : '0'; };

// ── SQL 转义 ───────────────────────────────────────────────────────────────
const sqlStr = (s) => {
    if (s === null || s === undefined) return 'NULL';
    return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
};
const sqlNum  = (v) => (v === null || v === undefined) ? 'NULL' : String(Number(v));
const sqlJson = (v) => {
    if (v === null || v === undefined) return 'NULL';
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};
const sqlTs = (v) => {
    if (!v) return 'NULL';
    if (v instanceof Date) {
        const p = (x) => String(x).padStart(2, '0');
        return `'${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}'`;
    }
    return `'${String(v).slice(0, 19)}'`;
};

// ── 主流程 ────────────────────────────────────────────────────────────────
async function run() {
    const opts = parseArgs();
    const keyword  = opts.keyword.toLowerCase();
    const dateTag  = (() => {
        const d = new Date();
        const p = (x) => String(x).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    })();
    const outDir   = process.cwd();
    const csvFile  = path.join(outDir, `pf_gift_packages_${dateTag}.csv`);
    const sqlFile  = path.join(outDir, `pf_gift_packages_${dateTag}.sql`);

    logInfo(`连接数据库 ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} ...`);
    let conn;
    try {
        conn = await mysql.createConnection({ ...DB_CONFIG, multipleStatements: false });
        logInfo('数据库连接成功');

        // ── 构建查询条件 ────────────────────────────────────────────────────
        const where  = [];
        const params = [];

        if (!opts.all) {
            // package_code 或 package_name 包含关键词（不区分大小写）
            where.push(`(LOWER(package_code) LIKE ? OR LOWER(package_name) LIKE ?)`);
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        if (opts.gameCode) {
            where.push(`game_code = ?`);
            params.push(opts.gameCode);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        // ── 执行查询 ────────────────────────────────────────────────────────
        const [rows] = await conn.execute(
            `SELECT * FROM externalgiftpackages ${whereSql} ORDER BY game_code, sort_order, id`,
            params
        );

        logInfo(`共找到 ${rows.length} 个${opts.all ? '' : ' 含 "' + opts.keyword + '" 的'}礼包`);

        if (rows.length === 0) {
            logWarn('没有找到符合条件的礼包，请确认 --keyword 参数或用 --all 导出全部。');
            return;
        }

        // ── 输出 CSV（人工核对用）──────────────────────────────────────────
        const csvHeader = [
            'id', 'package_code', 'package_name', 'description',
            'price_platform_coins', 'price_real_money',
            'gift_items', 'category', 'icon_url',
            'is_active', 'is_limited', 'total_quantity', 'sold_quantity', 'max_per_user',
            'start_time', 'end_time', 'available_weekdays', 'sort_order',
            'game_code', 'created_at', 'updated_at',
        ];
        const csvLines = [csvHeader.join(',')];

        for (const r of rows) {
            const items = typeof r.gift_items === 'object' ? JSON.stringify(r.gift_items) : (r.gift_items || '[]');
            csvLines.push([
                csvInt(r.id),
                csvText(r.package_code),
                csvText(r.package_name),
                csvText(r.description),
                csvMoney(r.price_platform_coins),
                csvMoney(r.price_real_money),
                csvText(items),
                csvText(r.category),
                csvText(r.icon_url),
                csvInt(r.is_active),
                csvInt(r.is_limited),
                csvInt(r.total_quantity),
                csvInt(r.sold_quantity),
                csvInt(r.max_per_user),
                csvText(r.start_time  ? String(r.start_time).slice(0, 19)  : ''),
                csvText(r.end_time    ? String(r.end_time).slice(0, 19)    : ''),
                csvText(r.available_weekdays),
                csvInt(r.sort_order),
                csvText(r.game_code),
                csvText(r.created_at  ? String(r.created_at).slice(0, 19)  : ''),
                csvText(r.updated_at  ? String(r.updated_at).slice(0, 19)  : ''),
            ].join(','));
        }

        const csvBody = csvLines.join('\r\n');
        fs.writeFileSync(csvFile, (opts.excelBom ? '\uFEFF' : '') + csvBody, 'utf8');
        logInfo(`CSV 导出: ${csvFile}  (${rows.length} 行)`);

        // ── 输出 SQL（新后台直接 INSERT，INSERT IGNORE 自动去重）──────────
        const sqlLines = [
            `-- ============================================================`,
            `-- pf 礼包迁移 SQL`,
            `-- 导出时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
            `-- 来源库: ${DB_CONFIG.host}/${DB_CONFIG.database}`,
            `-- 礼包数: ${rows.length}`,
            `-- 说明: 使用 INSERT IGNORE，package_code 重复时自动跳过`,
            `-- ============================================================`,
            '',
            `SET NAMES utf8mb4;`,
            `SET FOREIGN_KEY_CHECKS = 0;`,
            '',
        ];

        for (const r of rows) {
            const items = typeof r.gift_items === 'object'
                ? JSON.stringify(r.gift_items)
                : (r.gift_items || '[]');

            sqlLines.push(
                `-- [${r.game_code}] ${r.package_name} (${r.package_code})`,
                `INSERT IGNORE INTO \`externalgiftpackages\` (`,
                `  \`package_code\`, \`package_name\`, \`description\`,`,
                `  \`price_platform_coins\`, \`price_real_money\`,`,
                `  \`gift_items\`, \`category\`, \`icon_url\`,`,
                `  \`is_active\`, \`is_limited\`, \`total_quantity\`, \`sold_quantity\`, \`max_per_user\`,`,
                `  \`start_time\`, \`end_time\`, \`available_weekdays\`,`,
                `  \`sort_order\`, \`game_code\``,
                `) VALUES (`,
                `  ${sqlStr(r.package_code)}, ${sqlStr(r.package_name)}, ${sqlStr(r.description || '')},`,
                `  ${sqlNum(r.price_platform_coins)}, ${sqlNum(r.price_real_money || 0)},`,
                `  ${sqlJson(items)}, ${sqlStr(r.category || 'general')}, ${sqlStr(r.icon_url || '')},`,
                `  ${sqlNum(r.is_active ?? 1)}, ${sqlNum(r.is_limited ?? 0)}, ${sqlNum(r.total_quantity ?? 0)}, 0, ${sqlNum(r.max_per_user ?? 0)},`,
                `  ${sqlTs(r.start_time)}, ${sqlTs(r.end_time)}, ${sqlStr(r.available_weekdays || null)},`,
                `  ${sqlNum(r.sort_order ?? 0)}, ${sqlStr(r.game_code)}`,
                `);`,
                '',
            );
        }

        sqlLines.push(`SET FOREIGN_KEY_CHECKS = 1;`);
        sqlLines.push(`-- 迁移完成，共 ${rows.length} 个礼包`);

        fs.writeFileSync(sqlFile, sqlLines.join('\n'), 'utf8');
        logInfo(`SQL 导出: ${sqlFile}`);

        // ── 打印汇总 ────────────────────────────────────────────────────────
        logInfo('─'.repeat(60));
        logInfo(`导出汇总:`);
        logInfo(`  关键词: "${opts.keyword}"${opts.all ? ' (--all 已忽略关键词)' : ''}`);
        logInfo(`  礼包数: ${rows.length}`);

        // 按 game_code 分组
        const byGame = {};
        for (const r of rows) {
            byGame[r.game_code] = (byGame[r.game_code] || 0) + 1;
        }
        for (const [gc, cnt] of Object.entries(byGame)) {
            logInfo(`    game_code=${gc}: ${cnt} 个`);
        }

        logInfo('─'.repeat(60));
        logInfo(`在新后台数据库执行: mysql -u root -p quantum_db < ${path.basename(sqlFile)}`);

    } catch (e) {
        logError(`执行失败: ${e.message}`);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

run();
