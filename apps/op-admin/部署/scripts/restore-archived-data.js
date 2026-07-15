#!/usr/bin/env node
/**
 * restore-archived-data.js
 *
 * 把归档表的数据恢复回原表（archive-old-data.js 的逆操作）。
 *
 * 流程（每张表）：
 *   1. 检查归档表是否存在
 *   2. 按 id 游标分批：
 *        a. INSERT IGNORE INTO <原表> SELECT（除 archived_at 外的所有列）FROM <归档表> WHERE id 范围
 *        b. 不删除归档表数据（保留备份，确认无误后可手动清）
 *   3. 对账：原表恢复后数量
 *
 * 用法：
 *   node restore-archived-data.js                          # dry-run 预览全部
 *   node restore-archived-data.js --confirm                # 真实恢复全部
 *   node restore-archived-data.js --confirm --only=PaymentRecords   # 只恢复 PaymentRecords
 *   node restore-archived-data.js --confirm --days=30      # 只恢复 30 天前的归档（按 archived_at）
 *   node restore-archived-data.js --confirm --purge        # 恢复后清空归档表（慎用）
 *
 * 安全特性：
 *   - 默认 dry-run，不加 --confirm 只预览。
 *   - INSERT IGNORE 幂等，重复运行不会因主键冲突报错。
 *   - 默认不删归档表，保留备份；确认无误后可加 --purge 清空或手动 DROP。
 *   - 分批 + 200ms 停顿，避免长事务锁线上。
 */
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// ------------------------------------------------------------------
// 配置
// ------------------------------------------------------------------
const BATCH_SIZE = 5000;
const SLEEP_MS = 200;

const TABLES = [
    { src: 'PaymentRecords',    archive: 'PaymentRecords_archive',    timeCol: 'created_at' },
    { src: 'logs',              archive: 'logs_archive',              timeCol: 'created_at' },
    { src: 'userloginlogs',     archive: 'userloginlogs_archive',     timeCol: 'login_time'  },
    { src: 'gm_operation_logs', archive: 'gm_operation_logs_archive', timeCol: 'created_at' },
    { src: 'AdminLoginLogs',    archive: 'AdminLoginLogs_archive',    timeCol: 'login_time'  },
];

// ------------------------------------------------------------------
// CLI 参数
// ------------------------------------------------------------------
function parseArgs(argv) {
    const args = { confirm: false, days: null, only: null, purge: false };
    for (const a of argv) {
        if (a === '--confirm') args.confirm = true;
        else if (a.startsWith('--days=')) {
            const v = parseInt(a.slice('--days='.length), 10);
            if (Number.isFinite(v) && v >= 0) args.days = v;
        } else if (a.startsWith('--only=')) {
            args.only = a.slice('--only='.length);
        } else if (a === '--purge') {
            args.purge = true;
        }
    }
    return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 获取原表的列名（排除 archived_at）
async function getSourceColumns(conn, srcTable) {
    const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [srcTable]
    );
    return cols.map(c => `\`${c.COLUMN_NAME}\``);
}

// ------------------------------------------------------------------
// 恢复一张表
// ------------------------------------------------------------------
async function restoreTable(conn, { src, archive }, days, isConfirm, purge) {
    // 0. 检查归档表是否存在
    const [tblRows] = await conn.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [archive]
    );
    if (tblRows.length === 0) {
        console.log(`\n===== ${archive} =====`);
        console.log(`  ⏭️  归档表不存在，跳过`);
        return { src, archive, pending: 0, restored: 0, purged: 0 };
    }

    // 1. 统计待恢复数量
    let countSql = `SELECT COUNT(*) AS cnt, MIN(id) AS min_id, MAX(id) AS max_id FROM \`${archive}\``;
    let countParams = [];
    if (days !== null) {
        countSql += ` WHERE archived_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
        countParams = [days];
    }
    const [cntRows] = await conn.query(countSql, countParams);
    const total = Number(cntRows[0]?.cnt || 0);
    const minId = Number(cntRows[0]?.min_id || 0);
    const maxId = Number(cntRows[0]?.max_id || 0);

    // 原表现有数量
    const [srcCnt] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${src}\``);
    const srcBefore = Number(srcCnt[0]?.cnt || 0);

    console.log(`\n===== ${archive} → ${src} =====`);
    console.log(`  归档表待恢复: ${total} 条`);
    console.log(`  原表现在:     ${srcBefore} 条`);
    if (total > 0) {
        console.log(`  归档 id 范围: ${minId} ~ ${maxId}`);
    }

    if (total === 0) {
        console.log(`  ✅ 归档表没有数据，无需恢复`);
        return { src, archive, pending: 0, restored: 0, purged: 0, srcBefore, srcAfter: srcBefore };
    }

    if (!isConfirm) {
        console.log(`  👆 DRY-RUN 预览。加 --confirm 执行真实恢复。`);
        return { src, archive, pending: total, restored: 0, purged: 0, srcBefore, srcAfter: srcBefore };
    }

    // 2. 获取原表列名（排除 archived_at）
    const srcColumns = await getSourceColumns(conn, src);
    const colList = srcColumns.join(', ');
    logInfo(`原表列: ${colList}`);

    // 3. 分批 INSERT IGNORE 回原表
    logWarn(`开始恢复，每批 ${BATCH_SIZE} 条...`);
    let lastId = minId - 1;
    let restored = 0;

    while (true) {
        // 取本批 id 上界
        let batchSql = `SELECT MAX(id) AS max_id FROM (
            SELECT id FROM \`${archive}\` WHERE id > ?`;
        let batchParams = [lastId];
        if (days !== null) {
            batchSql += ` AND archived_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
            batchParams.push(days);
        }
        batchSql += ` ORDER BY id ASC LIMIT ${BATCH_SIZE}) t`;
        const [maxRows] = await conn.query(batchSql, batchParams);
        const maxId = Number(maxRows[0]?.max_id || 0);
        if (maxId === 0) break;

        // INSERT IGNORE 回原表（只选原表拥有的列，排除 archived_at）
        let insSql = `INSERT IGNORE INTO \`${src}\` (${colList})
                      SELECT ${colList} FROM \`${archive}\`
                      WHERE id > ? AND id <= ?`;
        let insParams = [lastId, maxId];
        if (days !== null) {
            insSql += ` AND archived_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
            insParams.push(days);
        }
        const [insRes] = await conn.query(insSql, insParams);
        restored += Number(insRes.affectedRows || 0);

        lastId = maxId;
        logInfo(`${archive}: 已恢复 ${restored} 条...`);
        await sleep(SLEEP_MS);
    }

    // 4. 对账
    const [srcCnt2] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${src}\``);
    const srcAfter = Number(srcCnt2[0]?.cnt || 0);

    console.log(`  ✅ 恢复 ${restored} 条到 ${src}`);
    console.log(`  原表: ${srcBefore} → ${srcAfter} 条`);

    // 5. 可选：清空归档表
    let purged = 0;
    if (purge) {
        logWarn(`--purge: 清空归档表 ${archive}...`);
        const [delRes] = await conn.query(`DELETE FROM \`${archive}\``);
        purged = Number(delRes.affectedRows || 0);
        console.log(`  🗑️  已清空归档表 ${purged} 条`);
    } else {
        console.log(`  💾 归档表数据保留（确认无误后可加 --purge 清空，或手动 DROP）`);
    }

    return { src, archive, pending: total, restored, purged, srcBefore, srcAfter };
}

// ------------------------------------------------------------------
// 主流程
// ------------------------------------------------------------------
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const isConfirm = args.confirm;

    console.log('========================================');
    console.log('  数据恢复脚本 (restore-archived-data.js)');
    console.log('========================================');
    console.log(`  模式:      ${isConfirm ? '🟢 真实恢复' : '🟡 DRY-RUN 预览（不写）'}`);
    if (args.days !== null) console.log(`  恢复范围:  最近 ${args.days} 天的归档（按 archived_at）`);
    if (args.only) console.log(`  仅恢复:    ${args.only}`);
    if (args.purge) console.log(`  恢复后清空归档表: 是`);
    console.log(`  每批:      ${BATCH_SIZE} 条，间隔 ${SLEEP_MS}ms`);
    console.log('');

    let targets = TABLES;
    if (args.only) {
        targets = TABLES.filter(t => t.src.toLowerCase() === args.only.toLowerCase());
        if (targets.length === 0) {
            logError(`--only=${args.only} 未匹配到任何表。可选: ${TABLES.map(t => t.src).join(', ')}`);
            process.exit(1);
        }
    }

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo('数据库连接成功');

        const results = [];
        for (const t of targets) {
            const r = await restoreTable(conn, t, args.days, isConfirm, args.purge);
            results.push(r);
        }

        console.log('\n========================================');
        console.log('  汇总');
        console.log('========================================');
        console.table(
            results.map(r => ({
                表: r.src,
                归档待恢复: r.pending,
                已恢复: r.restored,
                原表恢复前: r.srcBefore ?? '-',
                原表恢复后: r.srcAfter ?? '-',
                清空归档: r.purged || 0,
            }))
        );

        if (!isConfirm) {
            console.log('👆 以上为 DRY-RUN 预览。确认后加 --confirm 执行：');
            console.log('  node restore-archived-data.js --confirm');
            if (args.only) console.log(`  node restore-archived-data.js --confirm --only=${args.only}`);
        } else {
            logInfo('恢复完成 ✅');
            if (!args.purge) {
                console.log('归档表数据仍保留。确认无误后可清空：');
                console.log('  node restore-archived-data.js --confirm --purge');
                console.log('或直接 DROP：');
                console.log('  DROP TABLE PaymentRecords_archive;');
            }
        }
    } catch (err) {
        logError(`执行失败: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    } finally {
        if (conn) {
            try { await conn.end(); } catch {}
        }
    }
}

main();
