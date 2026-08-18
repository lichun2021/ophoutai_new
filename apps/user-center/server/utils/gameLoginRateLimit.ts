import { getRedisCluster } from './redis-cluster';
import { normalizeUsername } from './loginRateLimit';
import { createError } from 'h3';

// #1 fix: Redis 故障时 fail-open，不阻断业务
// #2 fix: username 归一化（lower+trim），防止大小写变体绕过限流
// #3 fix: 限流只计"真正成功写入角色"时调用，调用方移到子账号校验之后（见 reportRole）

export async function checkGameLoginRateLimit(
    username: string,
    gameCode: string,
    channelCode: string,
    config: { maxLoginsPerMinute?: number; maxLoginsPerHour?: number; blockDurationMinutes?: number } = {}
): Promise<void> {
    const maxPerMin = config.maxLoginsPerMinute ?? 5;
    const maxPerHour = config.maxLoginsPerHour ?? 50;
    const blockMin = config.blockDurationMinutes ?? 30;

    // 归一化用户名，防止大小写绕过
    const normalizedUser = normalizeUsername(username);

    try {
        const redis = getRedisCluster();

        const blockKey = `game_login_block:${normalizedUser}:${gameCode}`;
        const isBlocked = await redis.get(blockKey);
        if (isBlocked) {
            const ttl = await redis.ttl(blockKey);
            throw createError({
                statusCode: 429,
                message: `登录过于频繁，请 ${Math.ceil(Math.max(ttl, 0) / 60)} 分钟后再试`
            });
        }

        const minuteKey = `game_login_minute:${normalizedUser}:${gameCode}`;
        const minuteCount = await redis.incr(minuteKey);
        if (minuteCount === 1) await redis.expire(minuteKey, 60);

        if (minuteCount > maxPerMin) {
            await redis.setex(blockKey, blockMin * 60, '1');
            console.error(`[游戏登录限流] 账号 ${normalizedUser} 1分钟内上报 ${minuteCount} 次，封禁 ${blockMin} 分钟`);
            throw createError({ statusCode: 429, message: `登录过于频繁，已被暂时封禁 ${blockMin} 分钟` });
        }

        const hourKey = `game_login_hour:${normalizedUser}:${gameCode}`;
        const hourCount = await redis.incr(hourKey);
        if (hourCount === 1) await redis.expire(hourKey, 3600);

        if (hourCount > maxPerHour) {
            await redis.setex(blockKey, blockMin * 60, '1');
            console.error(`[游戏登录限流] 账号 ${normalizedUser} 1小时内上报 ${hourCount} 次，封禁 ${blockMin} 分钟`);
            throw createError({ statusCode: 429, message: `登录次数超限，已被暂时封禁 ${blockMin} 分钟` });
        }

        console.log(`[游戏登录检查] ${normalizedUser} | ${gameCode} | ${channelCode} | 1分钟:${minuteCount} | 1小时:${hourCount}`);

    } catch (e: any) {
        // 只有 statusCode 429 才是限流，其余（含 Redis 故障）一律 fail-open
        if (e?.statusCode === 429) throw e;
        console.warn(`[游戏登录限流] Redis 异常，fail-open 放行: ${e?.message || e}`);
    }
}

export async function checkChannelGameLoginRateLimit(
    channelCode: string,
    gameCode: string,
    maxLoginsPerHour: number = 1000
): Promise<void> {
    try {
        const redis = getRedisCluster();
        const channelKey = `game_login_channel:${channelCode}:${gameCode}`;
        const channelCount = await redis.incr(channelKey);
        if (channelCount === 1) await redis.expire(channelKey, 3600);

        if (channelCount > maxLoginsPerHour) {
            console.error(`[渠道登录限流] 渠道 ${channelCode} | ${gameCode} 1小时内 ${channelCount} 次，超过阈值 ${maxLoginsPerHour}`);
            throw createError({ statusCode: 429, message: `该渠道登录频率异常，请联系管理员` });
        }
    } catch (e: any) {
        if (e?.statusCode === 429) throw e;
        console.warn(`[渠道登录限流] Redis 异常，fail-open 放行: ${e?.message || e}`);
    }
}
