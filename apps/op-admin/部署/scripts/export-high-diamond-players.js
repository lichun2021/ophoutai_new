/**
 * 导出各游戏服金条（diamonds）超过 10 万角色的账号充值总额
 * 步骤：
 * 1) 连接主库（quantum_db）读取 GameServers 配置
 * 2) 逐个连接游戏服数据库，查询 player_base 表金条超过 10 万的角色
 * 3) 关联 player 表获取战力、姓名等信息
 * 4) 通过角色找到对应 user_id，统计账号下成功充值金额（payment_status=3）
 * 5) 输出 CSV 文件 export_high_diamond_players.csv
 *
 * 运行：node export-high-diamond-players.js
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

const OUTPUT_FILE = path.join(process.cwd(), 'export_high_diamond_players.csv');
const MIN_DIAMONDS = 100000;

async function queryHighDiamondPlayers(gameConn) {
    // 逻辑：从 player_base 表获取金条超过阈值的角色，关联 player 表获取战力和基础信息
    const sqlWithName = `
        SELECT pb.playerId AS id, pb.diamonds, p.battlePoint, p.name, p.serverId
        FROM player_base pb
        LEFT JOIN player p ON pb.playerId = p.id
        WHERE pb.diamonds > ?
        ORDER BY pb.diamonds DESC
    `;
    const sqlWithoutName = `
        SELECT pb.playerId AS id, pb.diamonds, p.battlePoint, p.serverId
        FROM player_base pb
        LEFT JOIN player p ON pb.playerId = p.id
        WHERE pb.diamonds > ?
        ORDER BY pb.diamonds DESC
    `;

    try {
        const [rows] = await gameConn.execute(sqlWithName, [MIN_DIAMONDS]);
        return rows.map(r => ({
            id: r.id,
            diamonds: r.diamonds || 0,
            battlePoint: r.battlePoint || 0,
            name: r.name || '',
            serverId: r.serverId || ''
        }));
    } catch (err) {
        logWarn(`player_base 关联 player 查询失败 (尝试无 name 版本): ${err.message}`);
        try {
            const [rows] = await gameConn.execute(sqlWithoutName, [MIN_DIAMONDS]);
            return rows.map(r => ({
                id: r.id,
                diamonds: r.diamonds || 0,
                battlePoint: r.battlePoint || 0,
                name: '',
                serverId: r.serverId || ''
            }));
        } catch (err2) {
            logError(`查询彻底失败: ${err2.message}`);
            return [];
        }
    }
}

const PAYMENT_WAYS = [
    '支付宝', '微信',
    '支付宝支付', '微信支付',
    'alipay', 'ali', 'zfb',
    'wx', 'wechat', 'weixin'
];

async function queryRecharge(mainConn, roleId) {
    // 1. 先通过角色 roleId (uuid) 找到对应的账号 userId
    const [charRows] = await mainConn.execute(
        'SELECT user_id FROM gamecharacters WHERE uuid = ? LIMIT 1',
        [roleId]
    );

    const userId = charRows[0]?.user_id;
    if (!userId) {
        logWarn(`  [未找到账号] 角色 ID: ${roleId} 未在 GameCharacters 表中找到对应账号`);
        return { userId: null, totalRecharge: 0 };
    }

    // 2. 根据 userId 统计所有成功充值记录 (现金)
    const placeholders = PAYMENT_WAYS.map(() => '?').join(',');
    const sql = `
        SELECT IFNULL(SUM(amount),0) AS total
        FROM paymentrecords
        WHERE user_id = ?
          AND payment_status = 3
          AND payment_way IN (${placeholders})
    `;
    const params = [userId, ...PAYMENT_WAYS];
    const [rows] = await mainConn.execute(sql, params);
    return { userId, totalRecharge: rows[0]?.total || 0 };
}

async function run() {
    let mainConn;
    const results = [];
    try {
        mainConn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接主库 ${DB_CONFIG.database}`);

        const [servers] = await mainConn.execute(
            `SELECT id, name, bname, dbip, dbuser, dbpass, is_active
             FROM gameservers`
        );

        if (servers.length === 0) {
            logWarn('GameServers 为空，退出。');
            return;
        }

        for (const s of servers) {
            if (s.is_active === 0) {
                logInfo(`跳过未启用服务器: ${s.name || s.id}`);
                continue;
            }
            const [host, port] = String(s.dbip || '').split(':');
            logInfo(`连接游戏服 ${s.name || s.id} (${s.dbip}) ...`);
            let gameConn;
            try {
                gameConn = await mysql.createConnection({
                    host: host || '127.0.0.1',
                    port: port ? parseInt(port, 10) : 3306,
                    user: s.dbuser,
                    password: s.dbpass,
                    database: s.bname,
                    connectTimeout: 5000
                });

                const targetPlayers = await queryHighDiamondPlayers(gameConn);
                logInfo(`服 ${s.name || s.id} 取到 ${targetPlayers.length} 条金条 > ${MIN_DIAMONDS} 的角色记录`);

                for (const p of targetPlayers) {
                    const { userId, totalRecharge } = await queryRecharge(mainConn, p.id);
                    results.push({
                        server_id: s.id,
                        server_name: s.name || '',
                        player_server_id: p.serverId || '',
                        player_id: p.id,
                        player_name: p.name || '',
                        user_id: userId || '未知',
                        diamonds: p.diamonds,
                        battle_point: p.battlePoint || 0,
                        recharge_amount: totalRecharge
                    });
                }
            } catch (err) {
                logError(`连接或查询游戏服 ${s.name || s.id} 失败: ${err.message}`);
            } finally {
                if (gameConn) await gameConn.end();
            }
        }

        // 写出 CSV
        const header = [
            'server_id',
            'server_name',
            'player_server_id',
            'player_id',
            'player_name',
            'user_id',
            'diamonds',
            'battle_point',
            'recharge_amount'
        ];
        const lines = [header.join(',')];
        results.forEach(r => {
            const row = [
                r.server_id,
                `"${(r.server_name || '').replace(/"/g, '""')}"`,
                `"${(r.player_server_id || '').replace(/"/g, '""')}"`,
                r.player_id,
                `"${(r.player_name || '').replace(/"/g, '""')}"`,
                r.user_id,
                r.diamonds,
                r.battle_point,
                r.recharge_amount
            ];
            lines.push(row.join(','));
        });

        fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');
        logInfo(`导出完成，文件: ${OUTPUT_FILE}，共 ${results.length} 行`);
    } catch (err) {
        logError(`执行失败: ${err.message}`);
    } finally {
        if (mainConn) await mainConn.end();
    }
}

run();
