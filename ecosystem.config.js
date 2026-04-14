// ecosystem.config.js - PM2 三应用管理配置
// 使用方式: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'user-center',
      cwd: './apps/user-center',
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // ===== 数据库配置（三个应用共用相同配置）=====
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'your_db_password',
        DB_NAME: 'quantum_db',
        DB_CONNECTION_LIMIT: '200',
        // ===== 应用配置 =====
        BASE_URL: 'https://user.yourdomain.com',
        API_SIGN_KEY: 'user_sign_key_change_me'
      }
    },
    {
      name: 'agent-admin',
      cwd: './apps/agent-admin',
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        // ===== 数据库配置（共用）=====
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'your_db_password',
        DB_NAME: 'quantum_db',
        DB_CONNECTION_LIMIT: '50',
        // ===== 应用配置 =====
        BASE_URL: 'https://agent.yourdomain.com',
        API_SIGN_KEY: 'agent_sign_key_change_me',
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    },
    {
      name: 'op-admin',
      cwd: './apps/op-admin',
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        // ===== 数据库配置（共用）=====
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'root',
        DB_PASSWORD: 'your_db_password',
        DB_NAME: 'quantum_db',
        DB_CONNECTION_LIMIT: '50',
        // ===== 应用配置 =====
        BASE_URL: 'https://op.yourdomain.com',
        API_SIGN_KEY: 'op_sign_key_change_me',
        // 建议限制运营后台登录 IP
        ADMIN_LOGIN_IP_WHITELIST: '*'
      }
    }
  ]
};
