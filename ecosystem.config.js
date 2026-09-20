const os = require('os');
const path = require('path');
const cpus = os.cpus().length;
const APPS_ROOT = process.env.PM2_APPS_ROOT || '/data';
const instancesUser  = Math.max(1, cpus);
const instancesOp    = Math.max(1, Math.floor((cpus * 2) / 3));
const instancesAgent = Math.max(1, Math.floor(cpus / 3));

const SHARED = {
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root',
  DB_PASSWORD: 'Tz9#mQ!kR8@vX2$pN5jL',
  DB_NAME: 'quantum_db',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '6379', REDIS_PASSWORD: '',
  JWT_SECRET: '3587d7546a3d93796e6d3e83e6731bffb5f843c1251aa1b14213e75c6c81cbe0',
  JWT_EXPIRES_IN: '4h',
  ADMIN_SESSION_SECRET: '8a141dd93492d3c8d686905dfb108a1c358323cac029ea43442e47b44f3cc666',
  API_SIGN_KEY: 'fasdjhkfh2348!@#$!617',
  LOG_LEVEL: 'info',
  ADMIN_LOGIN_IP_WHITELIST: '*'
};

// 进程防护通用配置（防止内存增长被 OOM 杀、崩溃风暴、日志撑满磁盘）
const PROTECT = {
  max_memory_restart: '2G',   // 内存超 1G 自动重启，避免被系统 OOM Killer 杀掉导致进程消失
  max_restarts: 10,           // 10 秒内崩溃超 10 次才停止（防崩溃风暴），稳定后自动恢复
  min_uptime: '10s',          // 启动后 10s 内崩才算"快速崩溃"，计入 max_restarts
  log_date_format: 'YYYY-MM-DD HH:mm:ss',  // 日志加时间戳（配合 pm2-logrotate 轮转）
};

module.exports = {
  apps: [
    { name: 'user-center',  ...PROTECT, error_file: path.join(APPS_ROOT,'logs/user-center-error.log'), out_file: path.join(APPS_ROOT,'logs/user-center-out.log'),  cwd: path.join(APPS_ROOT,'user-center'),  script: 'server/index.mjs', exec_mode: 'cluster', instances: instancesUser,  merge_logs: true, env: { ...SHARED, NODE_ENV:'production', PORT: 3001, DB_CONNECTION_LIMIT:'600',  BASE_URL:'https://shop.ymumel.cn' } },
    { name: 'agent-admin',  ...PROTECT, error_file: path.join(APPS_ROOT,'logs/agent-admin-error.log'), out_file: path.join(APPS_ROOT,'logs/agent-admin-out.log'),  cwd: path.join(APPS_ROOT,'agent-admin'),  script: 'server/index.mjs', exec_mode: 'cluster', instances: instancesAgent, merge_logs: true, env: { ...SHARED, NODE_ENV:'production', PORT: 3002, DB_CONNECTION_LIMIT:'200',  BASE_URL:'https://www.fullalert96.cfd' } },
    { name: 'op-admin',     ...PROTECT, error_file: path.join(APPS_ROOT,'logs/op-admin-error.log'),    out_file: path.join(APPS_ROOT,'logs/op-admin-out.log'),     cwd: path.join(APPS_ROOT,'op-admin'),     script: 'server/index.mjs', exec_mode: 'cluster', instances: instancesOp,    merge_logs: true, env: { ...SHARED, NODE_ENV:'production', PORT: 3003, DB_CONNECTION_LIMIT:'1200', BASE_URL:'https://www.redalert96.lat' } },
  ]
};
