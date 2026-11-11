const fs = require('fs');
const os = require('os');
const path = require('path');

const root = '/data';
const shared = JSON.parse(fs.readFileSync(path.join(root, 'config/runtime-env.json'), 'utf8'));
const cpus = Math.max(1, os.cpus().length);
const publicIp = shared.PUBLIC_IP || '118.107.9.181';
const node = process.execPath;

for (const name of [
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'REDIS_HOST', 'REDIS_PORT', 'JWT_SECRET', 'ADMIN_SESSION_SECRET', 'API_SIGN_KEY',
]) {
  if (shared[name] === undefined || shared[name] === null || String(shared[name]) === '') {
    throw new Error(`Missing runtime setting: ${name}`);
  }
}

const sharedEnv = Object.fromEntries(Object.entries(shared).map(([key, value]) => [key, String(value)]));

function app(name, publicPort, instances) {
  const url = `http://${publicIp}:${publicPort}`;
  return {
    name,
    cwd: path.join(root, name),
    script: 'server/index.mjs',
    interpreter: node,
    exec_mode: 'cluster',
    instances,
    node_args: '--max-old-space-size=512',
    max_memory_restart: '768M',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 10000,
    listen_timeout: 15000,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: path.join(root, 'logs', `${name}-error.log`),
    out_file: path.join(root, 'logs', `${name}-out.log`),
    env: {
      ...sharedEnv,
      NODE_ENV: 'production',
      LOG_LEVEL: sharedEnv.LOG_LEVEL || 'info',
      HOST: '0.0.0.0',
      NITRO_HOST: '0.0.0.0',
      PORT: String(publicPort),
      NITRO_PORT: String(publicPort),
      DB_CONNECTION_LIMIT: sharedEnv.DB_CONNECTION_LIMIT || '50',
      BASE_URL: url,
      API_BASE_URL: url,
      NUXT_BASE_URL: url,
      NUXT_PUBLIC_BASE_URL: url,
      NUXT_PUBLIC_API_BASE_URL: url,
      NUXT_PUBLIC_API_SIGN_KEY: sharedEnv.API_SIGN_KEY,
      OP_ADMIN_URL: 'http://127.0.0.1:3003',
      OP_ADMIN_BASE_URL: 'http://127.0.0.1:3003',
      TELEGRAM_BOT_ENABLED: 'false',
      ITEM_CONFIG_PATH: path.join(root, 'config', name, 'itemConfig.json'),
      RECHARGE_CONFIG_PATH: path.join(root, 'config', name, 'rechargeConfig.json'),
    },
  };
}

module.exports = {
  apps: [
    app('user-center', 3001, cpus),
    app('agent-admin', 3002, Math.max(1, Math.floor(cpus / 3))),
    app('op-admin', 3003, Math.max(1, Math.floor((cpus * 2) / 3))),
  ],
};
