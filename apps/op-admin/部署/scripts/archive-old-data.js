#!/usr/bin/env node
/**
 * archive-old-data.js
 *
 * 归档并删除 1 个月（可配置）前的支付数据与日志数据。
 *
 * 流程（每张表）：
 *   1. CREATE TABLE IF NOT EXISTS <归档表> LIKE <原表>  （复制结构与索引，不含外键）
 *   2. ALTER TABLE <归档表> ADD COLUMN archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   3. 按 id 游标分批（每批 BATCH_SIZE 条）：
 *        a. INSERT IGNORE INTO <归档表> SELECT *, NULL FROM <原表> WHERE id 在本批范围 AND 时间列 < 阈值
 *           （INSERT IGNORE 靠主键 id 去重，脚本可安全重跑，幂等）
 *        b. DELETE FROM <原表> WHERE 同范围 同条件 LIMIT BATCH_SIZE
 *   4. 对账：原表中符合条件者应为 0；打印归档/删除条数。
 *
 * 处理的表：
 *   PaymentRecords   -> PaymentRecords_archive   （created_at，全部归档，含已完成订单）
 *   logs             -> logs_archive             （created_at）
 *   userloginlogs    -> userloginlogs_archive    （login_time）
 *   gm_operation_logs-> gm_operation_logs_archive（created_at）
 *   AdminLoginLogs   -> AdminLoginLogs_archive   （login_time）
 *
 * 用法：
 *   node scripts/archive-old-data.js                       # dry-run 预览（默认 30 天）
 *   node scripts/archive-old-data.js --confirm             # 真实归档+删除，30 天前
 *   node scripts/archive-old-data.js --confirm --days=60   # 自定义阈值
 *   node scripts/archive-old-data.js --only=PaymentRecords # 只处理某张表
 *
 * 安全特性：
 *   - dry-run 默认开启，不加 --confirm 只预览数量，不写不删。
 *   - INSERT IGNORE 幂等，重复运行不会因主键冲突报错。
 *   - 每批先归档后删，范围完全一致，不会出现「删了但没归档」。
 *   - 分批 + 200ms 停顿，避免长事务与锁线上。
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
// CLI 参数解析
// ------------------------------------------------------------------
function parseArgs(argv) {
    const args = { confirm: false, days: 30, only: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--confirm') {
            args.confirm = true;
        } else if (a.startsWith('--days=')) {
            const v = parseInt(a.slice('--days='.length), 10);
            if (Number.isFinite(v) && v >= 0) args.days = v;
        } else if (a.startsWith('--only=')) {
            args.only = a.slice('--only='.length);
        }
    }
    return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
// 确保归档表存在
// ------------------------------------------------------------------
async function ensureArchiveTable(conn, { src, archive }) {
    await conn.query(`CREATE TABLE IF NOT EXISTS \`${archive}\` LIKE \`${src}\``);
    // 归档时刻列：已存在则忽略错误（兼容重复运行）
    try {
        await conn.query(
            `ALTER TABLE \`${archive}\` ADD COLUMN archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
        );
        logInfo(`归档表 ${archive} 新增 archived_at 列`);
    } catch (e) {
        // 1060 = Duplicate column name（列已存在），属预期；其他错误抛出
        if (e && e.errno !== 1060) throw e;
    }
}

// ------------------------------------------------------------------
// 归档并删除一张表
// ------------------------------------------------------------------
async function archiveTable(conn, { src, archive, timeCol }, days, isConfirm) {
    const thresholdExpr = `DATE_SUB(NOW(), INTERVAL ? DAY)`;

    // 1. 统计待归档数量
    const [cntRows] = await conn.query(
        `SELECT COUNT(*) AS cnt, MIN(\`${timeCol}\`) AS earliest, MAX(\`${timeCol}\`) AS latest
         FROM \`${src}\`
         WHERE \`${timeCol}\` < ${thresholdExpr}`,
        [days]
    );
    const total = Number(cntRows[0]?.cnt || 0);
    const earliest = cntRows[0]?.earliest || null;
    const latest = cntRows[0]?.latest || null;

    console.log('');
    console.log(`===== ${src} -> ${archive} (${timeCol} < ${days}天前) =====`);
    console.log(`  待归档: ${total} 条`);
    if (earliest) console.log(`  最早:   ${earliest}`);
    if (latest)   console.log(`  最近:   ${latest}`);

    if (total === 0) {
        console.log(`  ✅ 没有符合条件的记录`);
        return { src, archive, pending: 0, archived: 0, deleted: 0, remaining: 0 };
    }

    // 2. dry-run 直接返回
    if (!isConfirm) {
        console.log(`  👆 DRY-RUN 预览。加 --confirm 执行真实归档+删除。`);
        return { src, archive, pending: total, archived: 0, deleted: 0, remaining: total };
    }

    // 3. 确保归档表存在
    await ensureArchiveTable(conn, { src, archive });

    // 4. 按 id 游标分批：先归档后删除
    logWarn(`开始归档+删除，每批 ${BATCH_SIZE} 条...`);
    let lastId = 0;
    let archived = 0;
    let deleted = 0;

    while (true) {
        // 取本批 id 上界：在「时间列 < 阈值 且 id > lastId」的行里取下 BATCH_SIZE 条的最大 id
        const [maxRows] = await conn.query(
            `SELECT MAX(id) AS max_id FROM (
                SELECT id FROM \`${src}\`
                WHERE \`${timeCol}\` < ${thresholdExpr} AND id > ?
                ORDER BY id ASC
                LIMIT ${BATCH_SIZE}
            ) t`,
            [days, lastId]
        );
        const maxId = Number(maxRows[0]?.max_id || 0);
        if (maxId === 0) break; // 本批无数据，结束

        // a. 归档（INSERT IGNORE 幂等；SELECT *, NULL 对齐归档表末尾的 archived_at 列）
        const [insRes] = await conn.query(
            `INSERT IGNORE INTO \`${archive}\`
             SELECT *, NULL FROM \`${src}\`
             WHERE id > ? AND id <= ? AND \`${timeCol}\` < ${thresholdExpr}`,
            [lastId, maxId, days]
        );
        archived += Number(insRes.affectedRows || 0);

        // b. 删除（同范围、同条件）
        const [delRes] = await conn.query(
            `DELETE FROM \`${src}\`
             WHERE id > ? AND id <= ? AND \`${timeCol}\` < ${thresholdExpr}
             LIMIT ${BATCH_SIZE}`,
            [lastId, maxId, days]
        );
        deleted += Number(delRes.affectedRows || 0);

        lastId = maxId;
        logInfo(`${src}: 已归档 ${archived} / 已删除 ${deleted} 条...`);
        await sleep(SLEEP_MS);
    }

    // 5. 对账：原表中符合条件者应为 0
    const [remainRows] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM \`${src}\` WHERE \`${timeCol}\` < ${thresholdExpr}`,
        [days]
    );
    const remaining = Number(remainRows[0]?.cnt || 0);

    console.log(`  ✅ 归档 ${archived} 条，删除 ${deleted} 条，原表剩余符合条件 ${remaining} 条`);
    if (archived !== deleted) {
        logWarn(`${src}: 归档(${archived}) 与 删除(${deleted}) 条数不一致 —— 若为重跑属正常（已归档的被 INSERT IGNORE 跳过）`);
    }
    return { src, archive, pending: total, archived, deleted, remaining };
}

// ------------------------------------------------------------------
// 主流程
// ------------------------------------------------------------------
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const isConfirm = args.confirm;

    console.log('========================================');
    console.log('  数据归档脚本 (archive-old-data.js)');
    console.log('========================================');
    console.log(`  模式:      ${isConfirm ? '🟢 真实归档+删除' : '🟡 DRY-RUN 预览（不写不删）'}`);
    console.log(`  时间阈值:  ${args.days} 天前`);
    console.log(`  每批:      ${BATCH_SIZE} 条，间隔 ${SLEEP_MS}ms`);
    if (args.only) console.log(`  仅处理:    ${args.only}`);
    console.log('');

    let targets = TABLES;
    if (args.only) {
        targets = TABLES.filter((t) => t.src.toLowerCase() === args.only.toLowerCase());
        if (targets.length === 0) {
            logError(`--only=${args.only} 未匹配到任何表。可选: ${TABLES.map((t) => t.src).join(', ')}`);
            process.exit(1);
        }
    }

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo('数据库连接成功');

        const results = [];
        for (const t of targets) {
            const r = await archiveTable(conn, t, args.days, isConfirm);
            results.push(r);
        }

        // 汇总
        console.log('');
        console.log('========================================');
        console.log('  汇总');
        console.log('========================================');
        console.table(
            results.map((r) => ({
                表: r.src,
                待归档: r.pending,
                已归档: r.archived,
                已删除: r.deleted,
                原表剩余: r.remaining,
            }))
        );

        if (!isConfirm) {
            console.log('👆 以上为 DRY-RUN 预览。确认无误后加 --confirm 执行：');
            console.log('  node scripts/archive-old-data.js --confirm');
            if (args.days !== 30) {
                console.log(`  node scripts/archive-old-data.js --confirm --days=${args.days}`);
            }
        } else {
            logInfo('全部完成 ✅');
        }
    } catch (err) {
        logError(`执行失败: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    } finally {
        if (conn) {
            try {
                await conn.end();
            } catch (_) {}
        }
    }
}

main();
