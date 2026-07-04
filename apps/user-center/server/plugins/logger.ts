import { createLogger } from '@quantum/shared/server/utils/logger';

const logger = createLogger('startup');

export default defineNitroPlugin(() => {
  logger.info('🚀 user-center 启动', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
  });
});
