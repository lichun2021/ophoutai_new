import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cents, money, refundPlan, subuserPlan, parseArgs } from './reopen-server.js';

test('余额保留、实际消费精确返还、孤立扣款拒绝', () => {
    assert.equal(money(cents('0.10') + cents('0.20')), '0.30');
    assert.equal(money(cents('-0.01')), '-0.01');
    const p = refundPlan([{id:1,username:'a',platform_coins:'15.00'}], [{user_id:1,refund:'20.10',records:2}]);
    assert.deepEqual(p[0], {user_id:1,username:'a',before:'15.00',refund:'20.10',after:'35.10',records:2});
    assert.throws(() => refundPlan([], [{user_id:1,refund:'1',records:1}]));
    assert.throws(() => refundPlan([{id:1,platform_coins:'9999999999999.99'}], [{user_id:1,refund:'1',records:1}]));
});
test('最小小号ID保留，无小号创建，孤立小号拒绝', () => {
    assert.deepEqual(subuserPlan([{id:1},{id:2}], [{id:5,parent_user_id:1},{id:9,parent_user_id:1}]), {keep:[5],remove:[9],create:[2]});
    assert.throws(() => subuserPlan([], [{id:5,parent_user_id:1}]));
});
test('默认预览，执行必须显式限定库/维护/批次/备份', () => {
    assert.equal(parseArgs([]).mode,'preview');
    assert.throws(()=>parseArgs(['backup']));
    assert.throws(()=>parseArgs(['backup','--run-id=../../bad','--maintenance-confirmed','--confirm-db=x','--backup-dir=/tmp']));
    assert.equal(parseArgs(['backup','--run-id=test','--maintenance-confirmed','--confirm-db=x','--backup-dir=/tmp']).mode,'backup');
});

test('隔离 MySQL：完整备份、返还流水、清理、单小号、幂等与回滚', {skip:process.env.REOPEN_MYSQL_INTEGRATION !== '1', timeout:120000}, async () => {
    const {default:mysql} = await import('mysql2/promise');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reopen-test-'));
    const datadir=path.join(dir,'data'),socket=path.join(dir,'mysql.sock');
    const bin=process.env.MYSQLD_BIN || 'mysqld';
    const init=spawnSync(bin,['--no-defaults','--initialize-insecure',`--datadir=${datadir}`],{encoding:'utf8'});
    assert.equal(init.status,0,init.stderr);
    const server=spawn(bin,['--no-defaults',`--datadir=${datadir}`,`--socket=${socket}`,'--skip-networking',`--pid-file=${dir}/mysql.pid`,`--log-error=${dir}/mysql.log`],{stdio:'ignore'});
    let c;
    const cli=fileURLToPath(new URL('./reopen-server.js',import.meta.url));
    const env={...process.env,DB_HOST:'localhost',DB_USER:'root',DB_PASSWORD:'',DB_NAME:'reopen_test',DB_SOCKET_PATH:socket};
    const invoke=(args)=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:30000});
    try {
        for(let i=0;i<100;i++) {
            try { c=await mysql.createConnection({socketPath:socket,user:'root',multipleStatements:true}); break; }
            catch { await new Promise(r=>setTimeout(r,100)); }
        }
        assert.ok(c,'isolated mysql did not start');
        await c.query(`CREATE DATABASE reopen_test; USE reopen_test;
          CREATE TABLE users(id INT PRIMARY KEY,username VARCHAR(100),platform_coins DECIMAL(15,2),channel_code VARCHAR(50),game_code VARCHAR(50)) ENGINE=InnoDB;
          CREATE TABLE subusers(id INT AUTO_INCREMENT PRIMARY KEY,parent_user_id INT,username VARCHAR(100),wuid VARCHAR(100),FOREIGN KEY(parent_user_id) REFERENCES users(id)) ENGINE=InnoDB;
          CREATE TABLE paymentrecords(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,sub_user_id INT,role_id VARCHAR(36) DEFAULT '',transaction_id VARCHAR(100) UNIQUE,wuid VARCHAR(100),payment_way VARCHAR(50),payment_id INT,world_id INT,product_name VARCHAR(100),product_des VARCHAR(255),amount DECIMAL(10,2),mch_order_id VARCHAR(100) UNIQUE,msg VARCHAR(255),server_url TEXT,device VARCHAR(100),channel_code VARCHAR(50),game_code VARCHAR(50),payment_status INT,ptb_before DECIMAL(15,2),ptb_change DECIMAL(15,2),ptb_after DECIMAL(15,2)) ENGINE=InnoDB;
          CREATE TABLE gamecharacters(id INT PRIMARY KEY) ENGINE=InnoDB;
          CREATE TABLE logs(id INT PRIMARY KEY) ENGINE=InnoDB;
          CREATE TABLE GameServers(id INT PRIMARY KEY,server_id INT,name VARCHAR(100),is_active INT) ENGINE=InnoDB;
          INSERT INTO GameServers VALUES(8,10001,'first',1),(20,10002,'second',1);
          INSERT INTO users VALUES(1,'a',15,'wao','rd123'),(2,'b',3,'wao','rd123');
          INSERT INTO subusers VALUES(5,1,'first','old'),(9,1,'second','old2');
          INSERT INTO gamecharacters VALUES(1); INSERT INTO logs VALUES(1);
          INSERT INTO paymentrecords(user_id,transaction_id,mch_order_id,payment_way,payment_status,amount,ptb_change) VALUES
          (1,'spend1','s1','平台币',3,12.50,-12.50),(1,'spend2','s2','平台币',4,7.50,-7.50),
          (1,'cash','c1','Steam',3,500,0),(1,'grant','g1','平台币',3,100,100),
          (1,'unpaid','p0','微信',0,500,0),(1,'pending','p1','Steam',1,600,0),(1,'failed','p2','平台币',2,10,0);`);
        fs.mkdirSync(path.join(dir,'backups'));
        const common=['--run-id=fixture','--confirm-db=reopen_test','--maintenance-confirmed'];
        const backupArgs=['backup',...common,`--backup-dir=${dir}/backups`];
        let r=invoke(['preview']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/20.00/);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'15.00');
        r=invoke(['clean',...common]);assert.notEqual(r.status,0); // 未备份禁止跳步
        // 预置唯一键冲突以模拟退款写流水失败，验证本步事务回滚。
        await c.query("INSERT INTO paymentrecords(user_id,transaction_id,mch_order_id,payment_way,payment_status,amount,ptb_change) VALUES(1,'reopen:fixture:1','collision','平台币退款',3,1,1)");
        r=invoke(backupArgs);assert.equal(r.status,0,r.stderr);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'15.00');
        assert.equal((await c.query('SELECT COUNT(*) n FROM gamecharacters'))[0][0].n,1);
        r=invoke(['clean',...common]);assert.notEqual(r.status,0);assert.match(r.stderr,/不能跳步/);
        r=invoke(['refund',...common]);assert.notEqual(r.status,0);assert.match(r.stderr,/Duplicate entry/);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'15.00');
        assert.equal((await c.query('SELECT stage FROM server_reopen_runs'))[0][0].stage,'backed_up');
        await c.query("DELETE FROM paymentrecords WHERE transaction_id='reopen:fixture:1'");
        r=invoke(['refund',...common]);assert.equal(r.status,0,r.stderr);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'35.00');
        assert.equal((await c.query('SELECT COUNT(*) n FROM gamecharacters'))[0][0].n,1); // 退款不顺带清理
        const [refunds]=await c.query("SELECT * FROM paymentrecords WHERE transaction_id='reopen:fixture:1'");
        assert.equal(refunds.length,1);assert.equal(refunds[0].ptb_before,'15.00');assert.equal(refunds[0].ptb_change,'20.00');assert.equal(refunds[0].ptb_after,'35.00');
        r=invoke(['refund',...common]);assert.notEqual(r.status,0);assert.match(r.stderr,/不能跳步或重复/);
        r=invoke(['backup','--run-id=another','--confirm-db=reopen_test','--maintenance-confirmed',`--backup-dir=${dir}/backups`]);assert.notEqual(r.status,0);assert.match(r.stderr,/未完成批次/);
        await c.query('UPDATE users SET platform_coins=36 WHERE id=1');
        r=invoke(['clean',...common]);assert.notEqual(r.status,0);assert.match(r.stderr,/步骤间业务数据发生变化/);
        await c.query('UPDATE users SET platform_coins=35 WHERE id=1');
        r=invoke(['clean',...common]);assert.equal(r.status,0,r.stderr);
        assert.equal((await c.query('SELECT COUNT(*) n FROM paymentrecords'))[0][0].n,3);
        assert.equal((await c.query('SELECT COUNT(*) n FROM gamecharacters'))[0][0].n,0);
        assert.equal((await c.query('SELECT COUNT(*) n FROM subusers WHERE id=9'))[0][0].n,1); // 清理不重置小号
        r=invoke(['reset-subusers',...common]);assert.equal(r.status,0,r.stderr);
        const [subs]=await c.query('SELECT id,parent_user_id,wuid FROM subusers ORDER BY id');assert.equal(subs.length,2);assert.equal(subs[0].id,5);assert.ok(subs.every(x=>x.wuid===''));
        assert.equal((await c.query('SELECT COUNT(*) n FROM server_reopen_refunds'))[0][0].n,1);
        assert.equal((await c.query('SELECT stage FROM server_reopen_runs'))[0][0].stage,'subusers_reset');
        r=invoke(['status','--run-id=fixture']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/subusers_reset/);
        r=invoke(['reset-subusers',...common]);assert.notEqual(r.status,0);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'35.00');
        assert.equal((await c.query('SELECT COUNT(*) n FROM GameServers'))[0][0].n,2);
        // 兼容线上旧四步 complete 批次：余额/日志变化不应阻止独立服务器步骤。
        await c.query("UPDATE server_reopen_runs SET stage='complete',checkpoint_hash=REPEAT('0',64) WHERE run_id='fixture'");
        await c.query('UPDATE users SET platform_coins=36 WHERE id=1');
        await c.query('INSERT INTO logs VALUES(2)');
        r=invoke(['reset-servers',...common]);assert.equal(r.status,0,r.stderr);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'36.00');
        assert.equal((await c.query('SELECT COUNT(*) n FROM logs'))[0][0].n,1);
        assert.deepEqual((await c.query('SELECT id,server_id FROM GameServers'))[0],[{id:8,server_id:10001}]);
        assert.equal((await c.query('SELECT COUNT(*) n FROM paymentrecords'))[0][0].n,3);
        assert.equal((await c.query('SELECT stage FROM server_reopen_runs'))[0][0].stage,'servers_reset');
        r=invoke(['reset-servers',...common]);assert.notEqual(r.status,0);
        // 异常扣款也允许备份，但不能不返还就按未支付单删掉。
        await c.query("INSERT INTO paymentrecords(user_id,transaction_id,mch_order_id,payment_way,payment_status,amount,ptb_change) VALUES(1,'abnormal','ab1','平台币',1,10,-10)");
        r=invoke(['backup','--run-id=abnormal','--confirm-db=reopen_test','--maintenance-confirmed',`--backup-dir=${dir}/backups`]);assert.equal(r.status,0,r.stderr);
        r=invoke(['refund','--run-id=abnormal','--confirm-db=reopen_test','--maintenance-confirmed']);assert.notEqual(r.status,0);assert.match(r.stderr,/状态\/方式异常的实际扣款 1 笔/);
        const backupFile=path.join(dir,'backups','fixture','database.sql');
        assert.ok(fs.statSync(backupFile).size>100);
        // 实际恢复首次备份，旧余额、角色、小号和原始扣款全部还原。
        const restore=spawnSync(process.env.MYSQL_BIN || 'mysql', ['--no-defaults',`--socket=${socket}`,'--user=root','--default-character-set=utf8mb4'], {
            input:fs.readFileSync(backupFile),encoding:'utf8',timeout:30000,
        });
        assert.equal(restore.status,0,restore.stderr);
        assert.equal((await c.query('SELECT platform_coins FROM users WHERE id=1'))[0][0].platform_coins,'15.00');
        assert.equal((await c.query('SELECT COUNT(*) n FROM gamecharacters'))[0][0].n,1);
        assert.equal((await c.query('SELECT COUNT(*) n FROM paymentrecords'))[0][0].n,8);
        assert.equal((await c.query('SELECT COUNT(*) n FROM subusers WHERE id=9'))[0][0].n,1);
    } finally {
        if(c){await c.query('SHUTDOWN').catch(()=>{});await c.end();}
        server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
        fs.rmSync(dir,{recursive:true,force:true});
    }
});
