// ecosystem.config.js - PM2 三应用同时启动（服务端目录在 /data 下，与 deploy.sh 一致）
const os = require('os');
const path = require('path');

const cpus = os.cpus().length;
const APPS_ROOT = process.env.PM2_APPS_ROOT || '/data';

const instancesUser  = Math.max(1, cpus);
const instancesOp    = Math.max(1, Math.floor((cpus * 2) / 3));
const instancesAgent = Math.max(1, Math.floor(cpus / 3));

// ============ 公共配置（三个应用共享，优先读环境变量，回退到默认值）============
const DB_HOST      = process.env.DB_HOST     || '127.0.0.1';
const DB_PORT      = process.env.DB_PORT     || '3306';
const DB_USER      = process.env.DB_USER     || 'root';
const DB_PASSWORD  = process.env.DB_PASSWORD || 'Tz9#mQ!kR8@vX2$pN5&jL';
const DB_NAME      = process.env.DB_NAME     || 'quantum_db';

const REDIS_HOST     = process.env.REDIS_HOST     || '127.0.0.1';
const REDIS_PORT     = process.env.REDIS_PORT     || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

const JWT_SECRET           = process.env.JWT_SECRET           || 'ce67e83e5c8ce17271e0b789529454d34329f2150bff43b3e809ffbcbbaa8b25';
const JWT_EXPIRES_IN       = process.env.JWT_EXPIRES_IN       || '4h';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'd5ab9ad9149b15cf25e397d7b87c316d6c0aa50b40ffe01d202681a5ff396d7f';
const API_SIGN_KEY         = process.env.API_SIGN_KEY         || '81d48330444c58e5711427efdebb3880985af6c8e29fc57476383c8b36678953';

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
        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
        DB_CONNECTION_LIMIT: '600',
        REDIS_HOST, REDIS_PORT, REDIS_PASSWORD,
        JWT_SECRET, JWT_EXPIRES_IN,
        ADMIN_SESSION_SECRET,
        API_SIGN_KEY,
        API_SIGN_SKEW_SEC: '60',
        BASE_URL: process.env.BASE_URL || 'https://shop.kccyei.cn',
        LOG_LEVEL: 'info',
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
        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
        DB_CONNECTION_LIMIT: '200',
        REDIS_HOST, REDIS_PORT, REDIS_PASSWORD,
        JWT_SECRET, JWT_EXPIRES_IN,
        ADMIN_SESSION_SECRET,
        API_SIGN_KEY,
        API_SIGN_SKEW_SEC: '60',
        BASE_URL: process.env.BASE_URL_AGENT || 'https://www.fullalert96.cfd',
        LOG_LEVEL: 'info',
        ADMIN_LOGIN_IP_WHITELIST: process.env.ADMIN_LOGIN_IP_WHITELIST || '*',
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
        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
        DB_CONNECTION_LIMIT: '1200',
        REDIS_HOST, REDIS_PORT, REDIS_PASSWORD,
        JWT_SECRET, JWT_EXPIRES_IN,
        ADMIN_SESSION_SECRET,
        API_SIGN_KEY,
        API_SIGN_SKEW_SEC: '60',
        BASE_URL: process.env.BASE_URL_OP || 'https://www.redalert96.lat',
        LOG_LEVEL: 'info',
        ADMIN_LOGIN_IP_WHITELIST: process.env.ADMIN_LOGIN_IP_WHITELIST || '*',
      }
    }
  ]
};
