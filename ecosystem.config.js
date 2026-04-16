// ecosystem.config.js - PM2 三应用同时启动（服务端目录在 /data 下，与 deploy.sh 一致）
// 进程数：user-center 最多，op-admin 其次，agent-admin 较少（随 CPU 核数自动算）
// 使用: pm2 start /data/ecosystem.config.js
// 本地若需指向 monorepo：PM2_APPS_ROOT=/path/to/houtai/apps pm2 start ecosystem.config.js

const os = require('os');
const path = require('path');

const cpus = os.cpus().length;
// 与 deploy.sh 中 REMOTE_PATH 一致：/data/user-center、/data/agent-admin、/data/op-admin
const APPS_ROOT = process.env.PM2_APPS_ROOT || '/data';

// 核数 → 各应用实例数（保证 user ≥ op ≥ agent）
const instancesUser = Math.max(1, cpus);
const instancesOp = Math.max(1, Math.floor((cpus * 2) / 3));
const instancesAgent = Math.max(1, Math.floor(cpus / 3));

module.exports = {
  apps: [
    {
      name: 'user-center',
      cwd: path.join(APPS_ROOT, 'user-center'),
      script: 'server/index.mjs',
      exec_mode: 'cluster',
      instances: instancesUser,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DB_CONNECTION_LIMIT: '200',
        BASE_URL: 'https://user.yourdomain.com',
        API_SIGN_KEY: 'user_sign_key_change_me'
      }
    },
    {
      name: 'agent-admin',
      cwd: path.join(APPS_ROOT, 'agent-admin'),
      script: 'server/index.mjs',
      exec_mode: 'cluster',
      instances: instancesAgent,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        DB_CONNECTION_LIMIT: '200',
        BASE_URL: 'https://agent.yourdomain.com',
        API_SIGN_KEY: 'agent_sign_key_change_me',
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
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        DB_CONNECTION_LIMIT: '200',
        BASE_URL: 'https://op.yourdomain.com',
        API_SIGN_KEY: 'op_sign_key_change_me',
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    }
  ]
};
