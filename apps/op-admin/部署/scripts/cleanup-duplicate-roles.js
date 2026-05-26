/**
 * 清理重复角色数据脚本
 * 
 * 逻辑：
 * 1. 找到存在于多个服务器（server_id）的相同角色 UUID
 * 2. 遍历这些重复记录，从 GameServers 表获取对应游戏服的数据库连接信息
 * 3. 检查角色在游戏服中是否真实存在 (player 表)
 * 4. 如果角色在某游戏服中不存在，则删除后台数据库中对应的 GameCharacters 记录
 * 5. 统计处理结果：总UUID数、删除记录数、以及在所有服都找不到的角色
 * 
 * 运行方式: 
 * node cleanup-duplicate-roles.js
 */

import mysql from 'mysql2/promise';
import { DB_CONFIG, logInfo, logError, logWarn } from './config.js';

// 🌟 修改这里：true = 模拟运行，false = 真实删除
const DRY_RUN = true;

async function runCleanup() {
    logInfo(DRY_RUN ? '--- [模拟运行] 开始分析重复角色数据 (不会执行删除) ---' : '--- [正式运行] 开始执行角色清理 ---');

    let mainConn;
    
    // 统计数据
    let stats = {
        totalUuidsChecked: 0,
        totalRecordsProcessed: 0,
        totalRecordsDeleted: 0,
        uuidsWithNoServerMatch: [] // 在所有上报过的服里都找不到的角色
    };

    try {
        mainConn = await mysql.createConnection(DB_CONFIG);
        logInfo(`已连接到主数据库: ${DB_CONFIG.database}`);

        // 1. 找到在多个服务器中上报过的 uuid (基于 subuser_id + uuid 分组)
        const [duplicates] = await mainConn.execute(`
            SELECT uuid, subuser_id, COUNT(DISTINCT server_id) as server_count 
            FROM gamecharacters 
            GROUP BY uuid, subuser_id 
            HAVING server_count > 1
        `);

        if (duplicates.length === 0) {
            logInfo('✅ 未发现跨服重复的角色记录。');
            return;
        }

        stats.totalUuidsChecked = duplicates.length;
        logInfo(`🔍 发现 ${duplicates.length} 组存在跨服记录的 UUID。`);

        for (const item of duplicates) {
            const { uuid, subuser_id } = item;
            console.log(`\n---------------------------------------------------`);
            logInfo(`正在核对角色 UUID: ${uuid} (子账号: ${subuser_id})`);

            // 2. 获取该 uuid 关联的所有 GameCharacters 记录
            const [records] = await mainConn.execute(
                'SELECT id, server_id, server_name FROM gamecharacters WHERE uuid = ? AND subuser_id = ?',
                [uuid, subuser_id]
            );

            let foundInAnyServer = false;

            for (const record of records) {
                stats.totalRecordsProcessed++;
                const { id, server_id, server_name } = record;

                // 3. 从 GameServers 表获取该服的连接配置
                const [serverRows] = await mainConn.execute(
                    'SELECT dbip, dbuser, dbpass, bname, is_active FROM gameservers WHERE id = ? OR bname = ? OR name = ? LIMIT 1',
                    [server_id, `game_${server_id}`, server_id]
                );

                if (serverRows.length === 0) {
                    logWarn(`  [跳过] 无法找到服务器 ${server_name}(${server_id}) 的连接配置`);
                    continue;
                }

                const sCfg = serverRows[0];
                if (sCfg.is_active === 0) {
                    logInfo(`  [跳过] 服务器 ${server_name}(${server_id}) 未启用`);
                    continue;
                }

                const [host, port] = sCfg.dbip.split(':');
                let gameConn;

                try {
                    // 4. 连接游戏服检查
                    gameConn = await mysql.createConnection({
                        host: host,
                        port: port ? parseInt(port) : 3306,
                        user: sCfg.dbuser,
                        password: sCfg.dbpass,
                        database: sCfg.bname,
                        connectTimeout: 5000
                    });

                    // 查询角色在游戏服 player 表中是否存在
                    const [playerRows] = await gameConn.execute(
                        'SELECT id FROM player WHERE id = ? LIMIT 1',
                        [uuid]
                    );

                    if (playerRows.length === 0) {
                        // 5. 游戏服里没有这个角色，视为多余记录
                        stats.totalRecordsDeleted++;
                        if (DRY_RUN) {
                            logInfo(`  [发现多余记录] -> 角色在服 ${server_name} 中不存在。 (待删除 ID: ${id})`);
                        } else {
                            logInfo(`  [执行删除] -> 角色在服 ${server_name} 中不存在，执行删除 (ID: ${id})`);
                            await mainConn.execute('DELETE FROM gamecharacters WHERE id = ?', [id]);
                        }
                    } else {
                        foundInAnyServer = true;
                        logInfo(`  [确认留存] -> 角色在服 ${server_name} 中真实存在。`);
                    }
                } catch (gErr) {
                    logError(`  [错误] 无法连接或查询游戏服 ${server_name}: ${gErr.message}`);
                } finally {
                    if (gameConn) await gameConn.end();
                }
            }

            if (!foundInAnyServer) {
                stats.uuidsWithNoServerMatch.push({ uuid, subuser_id });
            }
        }

        console.log(`\n===================================================`);
        console.log(`📊 清理统计摘要 (${DRY_RUN ? '模拟运行' : '正式执行'}):`);
        console.log(`   - 检查的重复 UUID 组数: ${stats.totalUuidsChecked}`);
        console.log(`   - 检查的角色记录总数: ${stats.totalRecordsProcessed}`);
        console.log(`   - ${DRY_RUN ? '待删除' : '已删除'}的错误记录数: ${stats.totalRecordsDeleted}`);
        
        if (stats.uuidsWithNoServerMatch.length > 0) {
            console.log(`\n⚠️ 警告: 发现 ${stats.uuidsWithNoServerMatch.length} 个角色在任何一个上报过的服务器里都不存在!`);
            stats.uuidsWithNoServerMatch.forEach(u => {
                console.log(`   - UUID: ${u.uuid} (子账号: ${u.subuser_id})`);
            });
        } else {
            console.log(`\n✅ 良好: 所有被检查的角色至少在一个上报过的服务器中存在。`);
        }
        console.log(`===================================================\n`);

        logInfo(DRY_RUN ? '--- [模拟完成] 请根据上方统计确认结果。如需执行删除，请修改脚本 DRY_RUN 为 false ---' : '--- [清理完成] 任务结束 ---');

    } catch (error) {
        logError(`执行过程中出现异常: ${error.message}`);
    } finally {
        if (mainConn) await mainConn.end();
    }
}

runCleanup();
