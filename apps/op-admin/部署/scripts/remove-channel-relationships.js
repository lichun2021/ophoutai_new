#!/usr/bin/env node
/**
 * remove-channel-relationships.js
 *
 * 删除指定渠道号的「所有上级渠道归属」——即从 AgentRelationships 表中删除
 * 该渠道作为 child_channel_code 的全部记录，让它变成无上级的独立渠道。
 *
 * 注意：只删「上级归属」，不删该渠道作为 parent 的下级关系。
 *       如果想连同下级一起清，用 --include-children。
 *
 * 用法：
 *   node remove-channel-relationships.js --channel=360          # dry-run 预览
 *   node remove-channel-relationships.js --channel=360 --confirm # 真实删除
 *   node remove-channel-relationships.js --channel=360 --confirm --include-children  # 连下级归属一起删
 *
 * 安全特性：
 *   1. 默认 dry-run，不加 --confirm 只预览。
 *   2. 删除前自动备份到 AgentRelationships_backup 表（INSERT IGNORE 幂等，可重跑）。
 *   3. 备份表带 deleted_at 时间戳和 reason 备注，方便事后恢复。
 *   4. 删除后打印对账，确认原表里该渠道的归属已清零。
 *
 * 恢复方法（见脚本末尾输出）：
 *   重新 INSERT 回 AgentRelationships 即可，字段都在备份表里。
 */
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const BACKUP_TABLE = 'AgentRelationships_backup';

function parseArgs(argv) {
    const args = { channel: '', confirm: false, includeChildren: false };
    for (const a of argv) {
        if (a.startsWith('--channel=')) args.channel = a.slice('--channel='.length).trim();
        else if (a === '--confirm') args.confirm = true;
        else if (a === '--include-children') args.includeChildren = true;
    }
    return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureBackupTable(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS \`${BACKUP_TABLE}\` LIKE \`AgentRelationships\``);
    try {
        await conn.query(
            `ALTER TABLE \`${BACKUP_TABLE}\`
             ADD COLUMN deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
             ADD COLUMN reason VARCHAR(255) NOT NULL DEFAULT ''`
        );
        logInfo(`备份表 ${BACKUP_TABLE} 新增 deleted_at / reason 列`);
    } catch (e) {
        if (e && e.errno !== 1060) throw e; // 1060 = 列已存在
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.channel) {
        logError('缺少 --channel 参数');
        console.log('用法: node remove-channel-relationships.js --channel=360 [--confirm] [--include-children]');
        process.exit(1);
    }

    const channel = args.channel;
    const reason = `remove-channel-relationships ${channel}${args.includeChildren ? ' (含下级)' : ''}`;

    console.log('========================================');
    console.log('  删除渠道上级归属脚本');
    console.log('========================================');
    console.log(`  渠道号:        ${channel}`);
    console.log(`  模式:          ${args.confirm ? '🔴 真实删除' : '🟡 DRY-RUN 预览（不删）'}`);
    console.log(`  含下级归属:    ${args.includeChildren ? '是' : '否'}`);
    console.log(`  备份表:        ${BACKUP_TABLE}`);
    console.log('');

    let conn;
    try {
        conn = await mysql.createConnection(DB_CONFIG);
        logInfo('数据库连接成功');

        // 1. 预览：该渠道作为 child 的记录（上级归属）
        const [parentRows] = await conn.query(
            `SELECT id, parent_channel_code, child_channel_code, created_at
             FROM AgentRelationships
             WHERE child_channel_code = ?
             ORDER BY id ASC`,
            [channel]
        );
        console.log(`\n===== 上级归属（child_channel_code = ${channel}）=====`);
        console.log(`  共 ${parentRows.length} 条`);
        if (parentRows.length > 0) console.table(parentRows.slice(0, 20));

        let childRows = [];
        if (args.includeChildren) {
            // 该渠道作为 parent 的记录（下级归属）
            const [rows] = await conn.query(
                `SELECT id, parent_channel_code, child_channel_code, created_at
                 FROM AgentRelationships
                 WHERE parent_channel_code = ?
                 ORDER BY id ASC`,
                [channel]
            );
            childRows = rows;
            console.log(`\n===== 下级归属（parent_channel_code = ${channel}）=====`);
            console.log(`  共 ${childRows.length} 条`);
            if (childRows.length > 0) console.table(childRows.slice(0, 20));
        }

        const allRows = [...parentRows, ...childRows];
        const total = allRows.length;
        console.log(`\n===== 汇总 =====`);
        console.log(`  待删除: ${total} 条`);

        if (total === 0) {
            console.log('  ✅ 没有需要删除的记录');
            return;
        }

        if (!args.confirm) {
            console.log('\n  👆 DRY-RUN 预览。确认后加 --confirm 执行：');
            console.log(`  node remove-channel-relationships.js --channel=${channel} --confirm${args.includeChildren ? ' --include-children' : ''}`);
            return;
        }

        // 2. 确保备份表存在
        await ensureBackupTable(conn);

        // 3. 备份待删除的记录（INSERT IGNORE 幂等）
        logWarn('开始备份待删除记录到备份表...');
        const idsToDelete = allRows.map(r => r.id);

        // 分批备份 + 删除
        const BATCH = 500;
        let backedUp = 0;
        let deleted = 0;
        for (let i = 0; i < idsToDelete.length; i += BATCH) {
            const batchIds = idsToDelete.slice(i, i + BATCH);
            const placeholders = batchIds.map(() => '?').join(',');

            // 备份
            const [insRes] = await conn.query(
                `INSERT IGNORE INTO \`${BACKUP_TABLE}\`
                    (id, parent_channel_code, child_channel_code, created_at, deleted_at, reason)
                 SELECT id, parent_channel_code, child_channel_code, created_at, NOW(), ?
                 FROM AgentRelationships
                 WHERE id IN (${placeholders})`,
                [reason, ...batchIds]
            );
            backedUp += Number(insRes.affectedRows || 0);

            // 删除
            const [delRes] = await conn.query(
                `DELETE FROM AgentRelationships WHERE id IN (${placeholders})`,
                batchIds
            );
            deleted += Number(delRes.affectedRows || 0);

            logInfo(`已备份 ${backedUp} / 已删除 ${deleted} 条...`);
            await sleep(100);
        }

        // 4. 对账
        const [remainParent] = await conn.query(
            `SELECT COUNT(*) AS cnt FROM AgentRelationships WHERE child_channel_code = ?`,
            [channel]
        );
        let remainChild = 0;
        if (args.includeChildren) {
            const [r] = await conn.query(
                `SELECT COUNT(*) AS cnt FROM AgentRelationships WHERE parent_channel_code = ?`,
                [channel]
            );
            remainChild = Number(r[0]?.cnt || 0);
        }

        console.log('\n===== 完成 =====');
        console.log(`  备份: ${backedUp} 条 → ${BACKUP_TABLE}`);
        console.log(`  删除: ${deleted} 条`);
        console.log(`  原表剩余上级归属: ${Number(remainParent[0]?.cnt || 0)} 条`);
        if (args.includeChildren) {
            console.log(`  原表剩余下级归属: ${remainChild} 条`);
        }

        console.log('\n========================================');
        console.log('  恢复方法');
        console.log('========================================');
        console.log(`  备份表 ${BACKUP_TABLE} 保留了原始 id / parent / child / created_at。`);
        console.log(`  如需恢复，执行以下 SQL（会因主键冲突而跳过已存在的）：`);
        console.log('');
        console.log(`  INSERT IGNORE INTO AgentRelationships (id, parent_channel_code, child_channel_code, created_at)`);
        console.log(`  SELECT id, parent_channel_code, child_channel_code, created_at`);
        console.log(`  FROM ${BACKUP_TABLE}`);
        console.log(`  WHERE reason = '${reason}' AND child_channel_code = '${channel}'${args.includeChildren ? ` OR parent_channel_code = '${channel}'` : ''};`);
        console.log('');
        logInfo('完成 ✅');

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
