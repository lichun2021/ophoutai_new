/**
 * Nitro 服务器启动时的环境变量检查插件
 * 确保所有必需的环境变量已配置
 */
import { checkRequiredEnvVars } from '@quantum/shared/server/utils/envCheck';

export default defineNitroPlugin((nitroApp) => {
  console.log('\n🔍 检查环境变量配置...');

  try {
    checkRequiredEnvVars();
    console.log('✅ 环境变量检查通过，服务器启动中...\n');
  } catch (error: any) {
    console.error('\n❌ 环境变量检查失败:', error.message);
    console.error('💡 请参考项目根目录的 .env.example 配置环境变量\n');
    process.exit(1);
  }
});
