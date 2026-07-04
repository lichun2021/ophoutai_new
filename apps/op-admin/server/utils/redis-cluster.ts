import Redis from 'ioredis';

// ============ 安全改进: 移除硬编码，强制使用环境变量 ============
// Redis 配置 - 必须从环境变量读取
let redisClient: Redis | null = null;

export const getRedisCluster = (): Redis => {
  if (!redisClient) {
    const host = process.env.REDIS_HOST!;
    const port = Number(process.env.REDIS_PORT!);
    const password = process.env.REDIS_PASSWORD || undefined; // 无密码时为 undefined

    redisClient = new Redis({ host, port, password, connectTimeout: 10000 });

    redisClient.on('error', (err: Error) => {
      console.error('Redis Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Connected');
    });
  }

  return redisClient;
};

export const updateTransactionHasPay = async (transactionId: string): Promise<boolean> => {
  try {
    const redis = getRedisCluster();

    // 获取交易数据
    const data = await redis.get(transactionId);

    if (!data) {
      console.error(`Transaction ${transactionId} not found in Redis`);
      return false;
    }
  
    // 解析JSON数据
    const transaction = JSON.parse(data);
    
    // 更新haspay字段
    transaction.haspay = 1;
    // 将更新后的数据保存回Redis
    await redis.set(transactionId, JSON.stringify(transaction), 'EX', 3600);
    
    console.log(`Transaction ${transactionId} updated successfully`);
    return true;
  } catch (error) {
    console.error(`Error updating transaction ${transactionId}:`, error);
    return false;
  }
};