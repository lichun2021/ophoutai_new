// ecosystem.config.js - PM2 三应用同时启动
//
// ⚠️ 重要安全说明:
// 1. 本文件不包含任何密钥,可以安全提交到 Git
// 2. 密钥存储在 /data/.env.production 文件中(不提交 Git)
// 3. PM2 会自动加载 env_file 中的环境变量
//
// 使用方法:
//   pm2 start /data/ecosystem.config.js
//   或在应用目录: pm2 start ecosystem.config.js

const os = require('os');
const path = require('path');

const cpus = os.cpus().length;
// 与 deploy.sh 中 REMOTE_PATH 一致：/data/user-center、/data/agent-admin、/data/op-admin
const APPS_ROOT = process.env.PM2_APPS_ROOT || '/data';

// 核数 → 各应用实例数（保证 user ≥ op ≥ agent）
const instancesUser  = Math.max(1, cpus);
const instancesOp    = Math.max(1, Math.floor((cpus * 2) / 3));
const instancesAgent = Math.max(1, Math.floor(cpus / 3));

// 共享的环境变量文件路径
const ENV_FILE = path.join(APPS_ROOT, '.env.production');

module.exports = {
  apps: [
    {
      name: 'user-center',
      cwd: path.join(APPS_ROOT, 'user-center'),
      script: 'server/index.mjs',
      exec_mode: 'cluster',
      instances: instancesUser,
      merge_logs: true,

      // PM2 自动加载这个文件中的环境变量
      env_file: ENV_FILE,

      // 应用特定配置(不含密钥)
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DB_CONNECTION_LIMIT: '600',
        BASE_URL: 'https://shop.kccyei.cn',
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    },
    {
      name: 'agent-admin',
      cwd: path.join(APPS_ROOT, 'agent-admin'),
      script: 'server/index.mjs',
      exec_mode: 'cluster',
      instances: instancesAgent,
      merge_logs: true,

      env_file: ENV_FILE,

      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        DB_CONNECTION_LIMIT: '200',
        BASE_URL: 'https://www.fullalert96.cfd',
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    },
    {
      name: 'op-admin',
      cwd: path.join(APPS_ROOT, 'op-admin'),
      script: 'server/index.mjs',
      exec_mode: 'cluster',
      instances: instancesOp,
      merge_logs: true,

      env_file: ENV_FILE,

      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        DB_CONNECTION_LIMIT: '1200',
        BASE_URL: 'https://www.redalert96.lat',
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    }
  ]
};
