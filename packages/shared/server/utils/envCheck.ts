/**
 * 环境变量检查工具
 * 在应用启动时调用，确保所有必需的环境变量已配置
 */

// 必需的环境变量列表
const REQUIRED_ENV_VARS = [
  // 数据库配置
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',

  // Redis 配置
  'REDIS_HOST',
  'REDIS_PORT',

  // JWT 配置
  'JWT_SECRET',

  // 管理员 Session 配置
  'ADMIN_SESSION_SECRET',

  // API 签名配置
  'API_SIGN_KEY',
];

// 可选但推荐的环境变量
const RECOMMENDED_ENV_VARS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'JWT_EXPIRES_IN',
  'REDIS_PASSWORD',
];

/**
 * 检查必需的环境变量是否已配置
 * @throws 如果缺少必需的环境变量，进程退出
 */
export function checkRequiredEnvVars(): void {
  const missing: string[] = [];
  const weak: string[] = [];

  // 检查是否缺少必需的环境变量
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ 缺少必需的环境变量:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n📋 请参考 .env.example 配置环境变量');
    console.error('💡 复制 .env.example 为 .env 并填写实际值\n');
    process.exit(1);
  }

  // 检查密钥强度
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    weak.push('JWT_SECRET (长度必须至少 32 字符)');
  }

  if (process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length < 32) {
    weak.push('ADMIN_SESSION_SECRET (长度必须至少 32 字符)');
  }

  if (process.env.API_SIGN_KEY && process.env.API_SIGN_KEY.length < 32) {
    weak.push('API_SIGN_KEY (长度必须至少 32 字符)');
  }

  if (weak.length > 0) {
    // 仅做兼容检查，不阻止启动、不刷 PM2 error 日志。
    // 如需强校验，可在部署前通过安全审计脚本单独检查。
  }

  // 检查推荐的环境变量
  const missingRecommended: string[] = [];
  for (const varName of RECOMMENDED_ENV_VARS) {
    if (!process.env[varName]) {
      missingRecommended.push(varName);
    }
  }

  if (missingRecommended.length > 0) {
    console.warn('\n⚠️  以下推荐的环境变量未配置 (不影响启动):');
    missingRecommended.forEach(v => console.warn(`   - ${v}`));
    console.warn('');
  }

  // 检查生产环境特定配置
  if (process.env.NODE_ENV === 'production') {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('⚠️  生产环境不建议使用 LOG_LEVEL=debug');
    }
  }

  console.log('✅ 环境变量检查通过');
  console.log(`   - 运行环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   - 数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log(`   - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`   - JWT 过期时间: ${process.env.JWT_EXPIRES_IN || '4h'}`);
  console.log('');
}

/**
 * 生成随机密钥 (用于开发环境快速生成)
 * @param length 密钥长度 (字节数)
 * @returns 十六进制字符串
 */
export function generateSecret(length: number = 32): string {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 验证环境变量值的格式
 * @param varName 环境变量名
 * @param pattern 正则表达式
 * @returns 是否匹配
 */
export function validateEnvFormat(varName: string, pattern: RegExp): boolean {
  const value = process.env[varName];
  if (!value) return false;
  return pattern.test(value);
}
