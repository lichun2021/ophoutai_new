#!/usr/bin/env node
/**
 * 后台重开：预览 -> 完整备份 -> 返还平台币实际消费 -> 清角色/日志 -> 每账号保留一个小号。
 * 默认只读 preview；backup/refund/clean/reset-subusers/reset-servers 每次只执行一步，status 查询进度。
 * 详细口径、执行和恢复方式见 reopen-server.README.md。
 * 不连接或修改游戏服，不自动清 Redis，不自动操作 PM2/crontab。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { DB_CONFIG, logInfo, logError } from './config.js';

const RUNS = 'server_reopen_runs';
const REFUNDS = 'server_reopen_refunds';
const CLEAN = ['giftpackagepurchaserecords', 'gamecharacters', 'logs', 'userloginlogs', 'gm_operation_logs', 'dailystats', 'ltvstats'];
const PTB = "(payment_way LIKE '%平台币%' OR LOWER(payment_way) IN ('ptb','platform_coin','platform_coins'))";
const SPEND = `${PTB} AND payment_status IN (3,4) AND ptb_change < 0`;
const UNPAID = 'payment_status IN (0,1,2) AND COALESCE(ptb_change,0)=0';
const MAX_BALANCE = 999999999999999n; // DECIMAL(15,2), cents
const ident = value => '`' + value.replace(/`/g, '``') + '`';

export function cents(value) {
    const m = String(value ?? '0').match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
    if (!m) throw new Error(`非法金额: ${value}`);
    return (BigInt(m[2]) * 100n + BigInt((m[3] || '').padEnd(2, '0'))) * (m[1] ? -1n : 1n);
}
export function money(n) { return `${n < 0n ? '-' : ''}${(n < 0n ? -n : n) / 100n}.${String((n < 0n ? -n : n) % 100n).padStart(2, '0')}`; }
export function refundPlan(users, spending) {
    const totals = new Map(spending.map(r => [String(r.user_id), r]));
    const ids = new Set(users.map(u => String(u.id)));
    for (const r of spending) if (!ids.has(String(r.user_id))) throw new Error(`扣款关联不存在的账号 ${r.user_id}`);
    return users.filter(u => totals.has(String(u.id))).map(u => {
        const s = totals.get(String(u.id));
        const before = cents(u.platform_coins), refund = cents(s.refund), after = before + refund;
        if (refund <= 0n || after > MAX_BALANCE || after < -MAX_BALANCE) throw new Error(`账号 ${u.id} 金额异常或溢出`);
        return { user_id: u.id, username: u.username, before: money(before), refund: money(refund), after: money(after), records: Number(s.records) };
    });
}
export function subuserPlan(users, subs) {
    const keep = new Map(), remove = [];
    const ids = new Set(users.map(u => String(u.id)));
    for (const s of subs) {
        const uid = String(s.parent_user_id);
        if (!ids.has(uid)) throw new Error(`小号 ${s.id} 的主账号不存在`);
        // subs 从数据库按 id ASC 排序，保留最小ID。
        if (!keep.has(uid)) keep.set(uid, s.id); else remove.push(s.id);
    }
    return { keep: [...keep.values()], remove, create: users.filter(u => !keep.has(String(u.id))).map(u => u.id) };
}
export function parseArgs(args) {
    const options = { mode: args[0] || 'preview' };
    if (!['preview', 'backup', 'refund', 'clean', 'reset-subusers', 'reset-servers', 'status'].includes(options.mode)) throw new Error('用法: reopen-server.js preview|backup|refund|clean|reset-subusers|reset-servers|status [选项]');
    for (const a of args.slice(1)) {
        if (a === '--maintenance-confirmed') options.maintenance = true;
        else {
            const m = a.match(/^--(run-id|confirm-db|backup-dir|report-dir|mysqldump)=(.+)$/);
            if (!m) throw new Error(`未知参数 ${a}`);
            options[m[1]] = m[2];
        }
    }
    if (options.mode !== 'preview' && !/^[a-zA-Z0-9_-]{1,64}$/.test(options['run-id'] || '')) throw new Error('必须指定合法的 --run-id');
    if (!['preview','status'].includes(options.mode) && (!options.maintenance || !options['confirm-db'])) {
        throw new Error('执行单步必须指定 --maintenance-confirmed --confirm-db=数据库名 --run-id=同一批次');
    }
    if (options.mode === 'backup' && !options['backup-dir']) throw new Error('备份步骤必须指定 --backup-dir');
    return options;
}

async function schema(conn, database) {
    const [tables] = await conn.execute('SELECT TABLE_NAME name, ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\'', [database]);
    const map = new Map();
    for (const t of tables) {
        const key = t.name.toLowerCase();
        if (map.has(key)) throw new Error(`大小写重名表: ${key}`);
        map.set(key, t);
    }
    for (const key of ['users', 'subusers', 'paymentrecords', 'gamecharacters']) if (!map.has(key)) throw new Error(`缺少表 ${key}`);
    const name = key => ident(map.get(key)?.name || key);
    const clean = CLEAN.filter(k => map.has(k));
    // 禁止外键级联悄悄删除保留表的数据；内部清理顺序也交由外键检查保护。
    const [refs] = await conn.execute('SELECT TABLE_NAME child, REFERENCED_TABLE_NAME parent FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=?', [database]);
    for (const r of refs) if ([...clean, 'subusers', 'paymentrecords'].includes(r.parent.toLowerCase()) && !clean.includes(r.child.toLowerCase())) throw new Error(`保留表 ${r.child} 引用了待清理表 ${r.parent}，需人工制定迁移方案`);
    // 清理表按外键子表在前排序。
    const ordered = [], pending = new Set(clean);
    while (pending.size) {
        const next = [...pending].find(k => !refs.some(r => r.parent.toLowerCase() === k && pending.has(r.child.toLowerCase())));
        if (!next) throw new Error('清理表存在循环外键，拒绝自动处理');
        ordered.push(next); pending.delete(next);
    }
    const [triggers] = await conn.execute('SELECT TRIGGER_NAME name, EVENT_OBJECT_TABLE tbl FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?', [database]);
    const touched = ['users', 'subusers', 'paymentrecords', ...clean];
    if (triggers.some(t => touched.includes(t.tbl.toLowerCase()))) throw new Error('目标表存在触发器，需审查其副作用后再执行');
    for (const t of tables) if (t.engine !== 'InnoDB') throw new Error(`表 ${t.name} 不是 InnoDB，无法保证本脚本全库一致备份/事务回滚`);
    return { name, clean: ordered, map };
}
async function inspect(conn, s, lock = false) {
    const { name } = s;
    const [users] = await conn.query(`SELECT id, username, platform_coins, channel_code, game_code FROM ${name('users')} ORDER BY id ${lock ? 'FOR UPDATE' : ''}`);
    const [subs] = await conn.query(`SELECT id, parent_user_id, username, wuid FROM ${name('subusers')} ORDER BY id ${lock ? 'FOR UPDATE' : ''}`);
    if (lock) await conn.query(`SELECT id FROM ${name('paymentrecords')} WHERE ${PTB} FOR UPDATE`);
    const [sourceRows] = await conn.query(`SELECT id,user_id,ptb_change,payment_status FROM ${name('paymentrecords')} WHERE ${SPEND} ORDER BY id`);
    const [spending] = await conn.query(`SELECT user_id, SUM(-ptb_change) refund, COUNT(*) records FROM ${name('paymentrecords')} WHERE ${SPEND} GROUP BY user_id ORDER BY user_id`);
    const [issues] = await conn.query(`SELECT
        SUM(CASE WHEN ${PTB} AND payment_status IN (3,4) AND amount>0 AND COALESCE(ptb_change,0)=0 THEN 1 ELSE 0 END) missing_deductions,
        SUM(CASE WHEN ptb_change<0 AND (NOT (${SPEND}) OR payment_way IS NULL OR payment_status IS NULL) THEN 1 ELSE 0 END) unresolved_deductions,
        SUM(CASE WHEN payment_status IN (0,1) THEN 1 ELSE 0 END) pending_orders
        FROM ${name('paymentrecords')}`);
    const [unpaidRows] = await conn.query(`SELECT id,user_id,payment_status FROM ${name('paymentrecords')} WHERE ${UNPAID} ORDER BY id`);
    const counts = {};
    for (const k of s.clean) counts[k] = Number((await conn.query(`SELECT COUNT(*) n FROM ${name(k)}`))[0][0].n);
    return { users, subs, sourceRows, unpaidRows, refunds: refundPlan(users, spending), subusers: subuserPlan(users, subs), issues: issues[0], deleteCounts: counts };
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });

async function backup(config, options, dir) {
    const credentialsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reopen-db-'));
    fs.chmodSync(credentialsDir, 0o700);
    const credentials = path.join(credentialsDir, 'client.cnf');
    const escape = v => '"' + String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    fs.writeFileSync(credentials, `[client]\nhost=${escape(config.host)}\nport=${Number(config.port || 3306)}\nuser=${escape(config.user)}\npassword=${escape(config.password)}\n${config.socketPath ? `socket=${escape(config.socketPath)}\n` : ''}`, { mode: 0o600 });
    const file = path.join(dir, 'database.sql');
    try {
        const child = spawn(options.mysqldump || 'mysqldump', [`--defaults-extra-file=${credentials}`, '--single-transaction', '--quick', '--routines', '--events', '--triggers', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF', '--databases', config.database], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-4000); });
        const done = new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('close', code => code === 0 ? resolve() : reject(new Error(`mysqldump 失败(${code})，未执行退款清理；请检查备份权限/客户端兼容性`)));
        });
        const output = pipeline(child.stdout, fs.createWriteStream(file, { mode: 0o600, flags: 'wx' }));
        await Promise.all([done, output]);
        const size = fs.statSync(file).size;
        if (size < 100) throw new Error('备份文件异常过小');
        const fd = fs.openSync(file, 'r'), tail = Buffer.alloc(Math.min(size, 4096));
        fs.readSync(fd, tail, 0, tail.length, size - tail.length); fs.closeSync(fd);
        if (!tail.toString().includes('-- Dump completed')) throw new Error('备份缺少完成标记');
        const digest = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
        save(path.join(dir, 'backup-manifest.json'), { database: config.database, host: config.host, size, sha256: digest.digest('hex'), file, createdAt: new Date().toISOString(), hasWarnings: Boolean(stderr) });
        return file;
    } finally { fs.rmSync(credentialsDir, { recursive: true, force: true }); }
}

export async function run(options) {
    // 与同目录统计/补偿脚本共用 config.js；未传环境变量时使用其默认连接。
    const config = {
        ...DB_CONFIG,
        // 支持显式空密码（config.js 的 || 默认值不能表达这种情况）。
        ...(process.env.DB_PASSWORD !== undefined ? { password: process.env.DB_PASSWORD } : {}),
        ...(process.env.DB_SOCKET_PATH ? { socketPath: process.env.DB_SOCKET_PATH } : {}),
        supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, multipleStatements: false,
    };
    if (!['preview','status'].includes(options.mode) && options['confirm-db'] !== config.database) throw new Error('--confirm-db 与实际数据库不一致');
    const { default: mysql } = await import('mysql2/promise');
    const conn = await mysql.createConnection(config);
    logInfo(`已连接数据库 ${config.host}:${config.port}/${config.database}`);
    const lockKey = 'server-reopen:' + crypto.createHash('sha256').update(config.database).digest('hex').slice(0, 40);
    let locked = false, inTransaction = false, committed = false;
    try {
        const s = await schema(conn, config.database);
        if (options.mode === 'status') {
            if (!s.map.has(RUNS)) throw new Error('尚未创建重开批次');
            const [rows] = await conn.execute(`SELECT run_id,stage,updated_at,backup_path,summary FROM ${ident(RUNS)} WHERE run_id=?`,[options['run-id']]);
            if (!rows.length) throw new Error('批次不存在');
            logInfo(JSON.stringify(rows[0],null,2)); return rows[0];
        }
        const currentPlan = options.mode === 'reset-servers' ? null : await inspect(conn, s);
        const summary = currentPlan ? { host: config.host, database: config.database, accountCount: currentPlan.users.length, refundAccounts: currentPlan.refunds.length,
            refundTotal: money(currentPlan.refunds.reduce((n, r) => n + cents(r.refund), 0n)), deleteCounts: currentPlan.deleteCounts,
            removeSubusers: currentPlan.subusers.remove.length, createSubusers: currentPlan.subusers.create.length, issues: currentPlan.issues, unpaidOrdersToDelete: currentPlan.unpaidRows.length } : null;
        if (options.mode === 'preview') {
            logInfo(JSON.stringify(summary, null, 2));
            if (options['report-dir']) {
                const dir = path.resolve(options['report-dir']); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
                save(path.join(dir, `reopen-preview-${Date.now()}.json`), { summary, plan: currentPlan });
            }
            logInfo('预览完成，未修改数据库。'); return summary;
        }
        const [lock] = await conn.execute('SELECT GET_LOCK(?,0) acquired', [lockKey]);
        if (Number(lock[0].acquired) !== 1) throw new Error('已有重开任务在运行'); locked = true;
        if (options.mode === 'backup') {
            logInfo(`待支付订单不阻止备份；清理步骤将删除 ${currentPlan.unpaidRows.length} 笔未成功且无平台币资金变动的订单。`);
            if (s.map.has(RUNS)) {
                const [old] = await conn.execute(`SELECT run_id FROM ${ident(RUNS)} WHERE run_id=? OR stage NOT IN ('complete','servers_reset') LIMIT 1`, [options['run-id']]);
                if (old.length) throw new Error('该批次已存在或有未完成批次，请先查询 status；禁止另起批次重复退款');
            }
            const dir = path.resolve(options['backup-dir'], options['run-id']);
            fs.mkdirSync(dir, { mode: 0o700 });
            save(path.join(dir, 'plan.json'), { summary, plan: currentPlan });
            const backupFile = await backup(config, options, dir);
            await conn.query(`CREATE TABLE IF NOT EXISTS ${ident(RUNS)} (run_id VARCHAR(64) PRIMARY KEY, stage VARCHAR(24) NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, backup_path TEXT NOT NULL, plan_hash CHAR(64) NOT NULL, checkpoint_hash CHAR(64) NOT NULL, summary JSON NOT NULL) ENGINE=InnoDB`);
            await conn.query(`CREATE TABLE IF NOT EXISTS ${ident(REFUNDS)} (run_id VARCHAR(64) NOT NULL, user_id BIGINT NOT NULL, balance_before DECIMAL(15,2) NOT NULL, refund_amount DECIMAL(15,2) NOT NULL, balance_after DECIMAL(15,2) NOT NULL, source_records BIGINT NOT NULL, PRIMARY KEY(run_id,user_id)) ENGINE=InnoDB`);
            await conn.beginTransaction(); inTransaction=true;
            const check=await inspect(conn,s,true);
            if(hash(check)!==hash(currentPlan)) throw new Error('备份前后数据变化，请保持停服');
            await conn.execute(`INSERT INTO ${ident(RUNS)} (run_id,stage,backup_path,plan_hash,checkpoint_hash,summary) VALUES (?,'backed_up',?,?,?,?)`,[options['run-id'],backupFile,hash(currentPlan),hash(currentPlan),JSON.stringify(summary)]);
            await conn.commit(); committed=true; inTransaction=false;
            logInfo(`仅备份步骤完成：${backupFile}。未退款、未清理，下一步由你执行 refund。`);
            return summary;
        }
        if (!s.map.has(RUNS)) throw new Error('请先执行 backup');
        await conn.beginTransaction(); inTransaction=true;
        const [runs]=await conn.execute(`SELECT * FROM ${ident(RUNS)} WHERE run_id=? FOR UPDATE`,[options['run-id']]);
        const batch=runs[0]; if(!batch) throw new Error('批次不存在，请先 backup');
        const stages={refund:['backed_up','refunded'],clean:['refunded','cleaned'],'reset-subusers':['cleaned','subusers_reset'],'reset-servers':['subusers_reset','servers_reset']};
        const [expected,next]=stages[options.mode];
        if(batch.stage!==expected && !(options.mode==='reset-servers' && batch.stage==='complete')) throw new Error(`当前阶段 ${batch.stage}，${options.mode} 需要 ${expected}；不能跳步或重复执行`);
        const dir=path.dirname(batch.backup_path);
        if(!fs.existsSync(batch.backup_path)) throw new Error('备份文件不存在，停止执行');
        const {plan}=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8'));
        if(hash(plan)!==batch.plan_hash) throw new Error('原始计划文件被修改');
        // 第五步独立锁定并备份服务器表，不沿用钱包/日志等旧检查点。
        const current=options.mode==='reset-servers' ? null : await inspect(conn,s,true);
        if(current && hash(current)!==batch.checkpoint_hash) throw new Error('步骤间业务数据发生变化，暂停处理；勿重新备份或重复退款');
        if (options.mode === 'refund') {
        if (Number(current.issues.missing_deductions)>0 || Number(current.issues.unresolved_deductions)>0) {
            throw new Error(`备份已完成，但退款需核实扣款：缺少扣款依据 ${Number(current.issues.missing_deductions)||0} 笔，状态/方式异常的实际扣款 ${Number(current.issues.unresolved_deductions)||0} 笔；普通未支付订单不影响退款。`);
        }
        for (const r of plan.refunds) {
            await conn.execute(`UPDATE ${s.name('users')} SET platform_coins = COALESCE(platform_coins,0) + ? WHERE id=?`, [r.refund, r.user_id]);
            await conn.execute(`INSERT INTO ${ident(REFUNDS)} VALUES (?,?,?,?,?,?)`, [options['run-id'], r.user_id, r.before, r.refund, r.after, r.records]);
        }
        // 每个获得返还的账号保留一条可查询的平台币流水；正向变动不会参与下一次消费退款。
        const usersById = new Map(plan.users.map(u => [String(u.id), u]));
        for (const r of plan.refunds) {
            const user = usersById.get(String(r.user_id));
            const transactionId = `reopen:${options['run-id']}:${r.user_id}`;
            await conn.execute(`INSERT INTO ${s.name('paymentrecords')}
                (user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, payment_id,
                 world_id, product_name, product_des, amount, mch_order_id, msg, server_url,
                 device, channel_code, game_code, payment_status, ptb_before, ptb_change, ptb_after)
                VALUES (?,NULL,'',?,'','平台币退款',0,0,'重开平台币返还',?,?,?,?,'','server_reopen',?,?,3,?,?,?)`,
                [r.user_id, transactionId, `重开批次 ${options['run-id']}`, r.refund, transactionId,
                 `返还历史成功消费 ${r.records} 笔；批次 ${options['run-id']}`,
                 user.channel_code || '', user.game_code || '', r.before, r.refund, r.after]);
        }
        }
        if (options.mode === 'clean') {
        // 先清依赖记录，再删已返还消费；现金/赠送/转账等账务记录保留。
        for (const key of s.clean) await conn.query(`DELETE FROM ${s.name(key)}`);
        const [deleted] = await conn.query(`DELETE FROM ${s.name('paymentrecords')} WHERE ${SPEND}`);
        if (Number(deleted.affectedRows) !== plan.refunds.reduce((n,r) => n+r.records,0)) throw new Error('删除消费笔数与返还明细不一致');
        const [unpaidDeleted] = await conn.query(`DELETE FROM ${s.name('paymentrecords')} WHERE ${UNPAID}`);
        if (Number(unpaidDeleted.affectedRows) !== plan.unpaidRows.length) throw new Error('未支付订单清理笔数与备份计划不一致');
        logInfo(`本步删除未支付/失败且无平台币变动的订单 ${unpaidDeleted.affectedRows} 笔`);
        }
        if (options.mode === 'reset-subusers') {
        for (let i=0;i<plan.subusers.remove.length;i+=500) {
            const batch=plan.subusers.remove.slice(i,i+500);
            await conn.execute(`DELETE FROM ${s.name('subusers')} WHERE id IN (${batch.map(()=>'?').join(',')})`,batch);
        }
        await conn.query(`UPDATE ${s.name('subusers')} SET wuid=''`);
        for (const id of plan.subusers.create) await conn.execute(`INSERT INTO ${s.name('subusers')} (parent_user_id,username,wuid) VALUES (?,?,'')`, [id, `小号1_${id}`]);
        const [invalid] = await conn.query(`SELECT u.id FROM ${s.name('users')} u LEFT JOIN ${s.name('subusers')} s ON s.parent_user_id=u.id GROUP BY u.id HAVING COUNT(s.id)<>1 LIMIT 1`);
        if (invalid.length) throw new Error('小号数量校验失败');
        }
        if (options.mode === 'reset-servers') {
            if (!s.map.has('gameservers')) throw new Error('未找到游戏服务器表 gameservers');
            const table = s.map.get('gameservers').name;
            // 不关闭外键，不允许 CASCADE 误删历史现金订单等保留记录。
            const [references] = await conn.execute(`SELECT TABLE_NAME child FROM information_schema.KEY_COLUMN_USAGE
                WHERE REFERENCED_TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME=?`, [config.database, table]);
            if (references.length) throw new Error(`服务器表被外键引用（${references.map(r=>r.child).join(',')}），需先审查关联，禁止级联删除`);
            const [triggers] = await conn.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND EVENT_OBJECT_TABLE=?',[config.database,table]);
            if (triggers.length) throw new Error('服务器表存在触发器，需先审查');
            const [servers] = await conn.query(`SELECT * FROM ${s.name('gameservers')} ORDER BY id ASC FOR UPDATE`);
            if (!servers.length) throw new Error('服务器表为空，无法保留第一条');
            const first = servers[0];
            // 独立补充快照，兼容已经完成旧版四步的批次；含连接配置，权限600。
            const snapshot = path.join(dir,`servers-before-reset-${Date.now()}.json`);
            save(snapshot, servers);
            const [removed] = await conn.execute(`DELETE FROM ${s.name('gameservers')} WHERE id<>?`,[first.id]);
            const [remaining] = await conn.query(`SELECT id FROM ${s.name('gameservers')}`);
            if (remaining.length!==1 || String(remaining[0].id)!==String(first.id) || Number(removed.affectedRows)!==servers.length-1) throw new Error('服务器保留数量校验失败');
            const savedSummary = typeof batch.summary==='string' ? JSON.parse(batch.summary) : batch.summary;
            savedSummary.serverReset={keptId:first.id,serverId:first.server_id,name:first.name,removed:Number(removed.affectedRows),snapshot};
            await conn.execute(`UPDATE ${ident(RUNS)} SET summary=? WHERE run_id=?`,[JSON.stringify(savedSummary),options['run-id']]);
            logInfo(`服务器配置只保留 id=${first.id}、server_id=${first.server_id}、名称=${first.name}；删除 ${removed.affectedRows} 条。未修改保留服务器配置及现金订单。`);
        }
        if (options.mode === 'reset-servers') {
            // 保留原四步检查点，明确只推进服务器清理阶段。
            await conn.execute(`UPDATE ${ident(RUNS)} SET stage=? WHERE run_id=?`,[next,options['run-id']]);
        } else {
            const [balances] = await conn.execute(`SELECT r.user_id FROM ${ident(REFUNDS)} r JOIN ${s.name('users')} u ON u.id=r.user_id WHERE r.run_id=? AND u.platform_coins<>r.balance_after LIMIT 1`, [options['run-id']]);
            if (balances.length) throw new Error('返还余额校验失败');
            const after=await inspect(conn,s);
            await conn.execute(`UPDATE ${ident(RUNS)} SET stage=?,checkpoint_hash=? WHERE run_id=?`,[next,hash(after),options['run-id']]);
        }
        await conn.commit(); committed=true; inTransaction=false;
        save(path.join(dir,`${options.mode}-completed.json`),{runId:options['run-id'],stage:next,completedAt:new Date().toISOString()});
        logInfo(`仅 ${options.mode} 步骤已完成，当前阶段 ${next}；不会自动执行下一步。`);
        return {stage:next};
    } catch(error) {
        if(inTransaction) await conn.rollback();
        if(committed) logError('数据库已提交，后续文件写入失败；执行 status 核对当前阶段，勿重复退款。');
        throw error;
    } finally {
        if(locked) await conn.execute('SELECT RELEASE_LOCK(?)',[lockKey]);
        await conn.end();
    }
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
    Promise.resolve().then(()=>run(parseArgs(process.argv.slice(2)))).catch(e=>{logError(e.message);process.exitCode=1;});
}
