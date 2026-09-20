#!/usr/bin/env node
/**
 * Update agent password script
 * Usage:
 * node scripts/update-agent-password.js <agentName> <oldPassword> <newPassword>
 * node scripts/update-agent-password.js --force <agentName> <newPassword>
 *
 * Examples:
 * node scripts/update-agent-password.js agent001 oldpass123 newpass456
 * node scripts/update-agent-password.js --force agent001 newpass456
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { DB_CONFIG, logInfo, logError } from './config.js';

const PASSWORD_SALT = '1a!@#33er4r';

function hashAdminPassword(password) {
    const inner = crypto.createHash('md5').update(password).digest('hex');
    return crypto.createHash('md5').update(inner + PASSWORD_SALT).digest('hex');
}

async function runUpdateAgentPassword() {
    let connection = null;

    try {
        const forceMode = process.argv[2] === '--force';
        const agentName = forceMode ? process.argv[3] : process.argv[2];
        const oldPassword = forceMode ? null : process.argv[3];
        const newPassword = forceMode ? process.argv[4] : process.argv[4];

        if (forceMode) {
            if (!agentName || !newPassword) {
                throw new Error('缺少参数，请使用: node scripts/update-agent-password.js --force <代理名字> <新密码>');
            }
        } else if (!agentName || !oldPassword || !newPassword) {
            throw new Error('缺少参数，请使用: node scripts/update-agent-password.js <代理名字> <老密码> <新密码>');
        }

        if (!forceMode && newPassword === oldPassword) {
            throw new Error('新密码不能和老密码一致');
        }

        if (newPassword.length < 6) {
            throw new Error('新密码长度不能少于6位');
        }

        connection = await mysql.createConnection(DB_CONFIG);
        logInfo('Database connected successfully');

        const [admins] = await connection.execute(
            'SELECT id, name, password, level, is_active FROM admins WHERE name = ? LIMIT 1',
            [agentName]
        );

        if (!admins || admins.length === 0) {
            throw new Error('代理名字不存在');
        }

        const admin = admins[0];

        if (!forceMode) {
            const oldPasswordHash = hashAdminPassword(oldPassword);
            if (admin.password !== oldPasswordHash) {
                throw new Error('老密码不正确');
            }
        }

        const newPasswordHash = hashAdminPassword(newPassword);
        if (newPasswordHash === admin.password) {
            throw new Error('新密码不能与当前密码一致');
        }

        await connection.execute(
            'UPDATE admins SET password = ?, updated_at = NOW() WHERE id = ?',
            [newPasswordHash, admin.id]
        );

        logInfo(`代理密码修改成功: ${admin.name} (id=${admin.id})`);
    } catch (error) {
        logError(`代理密码修改失败: ${error.message}`);
        process.exitCode = 1;
    } finally {
        if (connection) {
            await connection.end();
            logInfo('Database connection closed');
        }
    }
}

runUpdateAgentPassword();
