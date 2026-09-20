#!/usr/bin/env node
/**
 * 手动永久封禁 IP（写入全局黑名单，所有接口统一生效）
 *
 * 用法:
 *   node ban-ip.js <ip> [ip2 ip3 ...] [ --reason=封禁原因 ]
 *   node ban-ip.js 162.14.71.15 --reason=恶意刷接口
 *   node ban-ip.js 1.2.3.4 5.6.7.8 --reason=撞库
 *
 * 说明:
 *   - 写入 Redis key: global:ip_blacklist:<ip>，value=封禁原因，不带过期=永久
 *   - op-admin 的 /api/* 与 /sdkapi/* 都在最外层检查此 key，命中即 403
 *   - 解封：node unban-ip.js <ip>，或 redis-cli DEL global:ip_blacklist:<ip>
 *   - 通过 redis-cli 子进程执行，无需额外 npm 依赖（服务器需有 redis-cli）
 *
 * Redis 连接（通过 redis-cli 参数，默认 127.0.0.1:6379）:
 *   可用环境变量 REDIS_HOST / REDIS_PORT / REDIS_PASSWORD 覆盖
 */

import { execSync } from 'child_process';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

// 解析参数：提取 IP 列表与 --reason
function parseArgs() {
    const args = process.argv.slice(2);
    const ips = [];
    let reason = '手动封禁';
    for (const a of args) {
        if (a.startsWith('--reason=')) {
            reason = a.split('=').slice(1).join('=');
        } else if (!a.startsWith('-')) {
            ips.push(a.trim());
        }
    }
    return { ips, reason };
}

// 构造 redis-cli 基础命令
function redisCliBase() {
    const parts = ['redis-cli', '-h', REDIS_HOST, '-p', String(REDIS_PORT)];
    if (REDIS_PASSWORD) parts.push('-a', REDIS_PASSWORD);
    return parts;
}

function banOne(ip, reason) {
    const key = `global:ip_blacklist:${ip}`;
    const cmd = [...redisCliBase(), 'SET', key, reason].join(' ');
    try {
        const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
        console.log(`✅ 永久封禁 IP=${ip}，原因：${reason}（redis: ${out || 'OK'}）`);
        return true;
    } catch (e) {
        console.error(`❌ 封禁失败 IP=${ip}：${e.message}`);
        return false;
    }
}

function main() {
    const { ips, reason } = parseArgs();
    if (ips.length === 0) {
        console.error('用法: node ban-ip.js <ip> [ip2 ...] [--reason=原因]');
        process.exit(1);
    }
    console.log(`Redis: ${REDIS_HOST}:${REDIS_PORT}`);
    console.log(`封禁原因：${reason}`);
    console.log('-------------------');
    let ok = 0;
    for (const ip of ips) {
        if (banOne(ip, reason)) ok++;
    }
    console.log('-------------------');
    console.log(`完成：${ok}/${ips.length} 个 IP 已永久封禁`);
    console.log('提示：解封用 redis-cli DEL global:ip_blacklist:<ip>');
}

main();
