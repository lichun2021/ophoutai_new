import fs from 'fs';
import path from 'path';

type GameIpTier = {
    min?: number;
    max?: number;
    // 兼容：可以是字符串或 { [worldId]: url }
    ip: string | Record<string, string>;
};

type GameIpConfig = {
    // 兼容：可以是字符串或 { [worldId]: url }
    defaultIp?: string | Record<string, string>;
    tiers?: GameIpTier[];
};

let cachedConfig: GameIpConfig | null = null;
let cachedMtimeMs = 0;
let lastCheckMs = 0;
const RECHECK_INTERVAL_MS = 15000; // 最短重查间隔 15s
let watcherStarted = false;
let resolvedPath: string | null = null;

function getConfigPath(): string {
    const root = process.cwd();
    if (resolvedPath && fs.existsSync(resolvedPath)) return resolvedPath;
    const possible = [
        process.env.GAME_IP_CONFIG_PATH || '',
        path.join(root, 'server/config/gameIpTiers.json'),
        path.join(root, '../server/config/gameIpTiers.json'),
        path.join(root, 'nuxt3/server/config/gameIpTiers.json'),
        '/data/nuxt3/server/config/gameIpTiers.json',
        '/data/config/gameIpTiers.json',
        path.join(root, 'config/gameIpTiers.json')
    ];
    for (const p of possible) {
        if (p && fs.existsSync(p)) {
            resolvedPath = p;
            return resolvedPath;
        }
    }
    // 默认开发路径兜底
    resolvedPath = path.join(root, 'server', 'config', 'gameIpTiers.json');
    return resolvedPath;
}

function startWatcher(file: string): void {
    if (watcherStarted) return;
    try {
        fs.watch(file, { persistent: false }, () => {
            // 文件改动后，标记过期；下次读取会自动重载
            cachedMtimeMs = 0;
        });
        watcherStarted = true;
    } catch {}
}

function safeReadConfig(): GameIpConfig {
    const file = getConfigPath();
    try {
        const now = Date.now();
        // 在最短间隔内且已有缓存，直接返回，避免频繁 stat
        if (cachedConfig && (now - lastCheckMs) < RECHECK_INTERVAL_MS) {
            return cachedConfig;
        }
        lastCheckMs = now;

        const stat = fs.statSync(file);
        if (!cachedConfig || stat.mtimeMs !== cachedMtimeMs) {
            const raw = fs.readFileSync(file, 'utf8');
            const json = JSON.parse(raw) as GameIpConfig;
            // 规范化与排序（按 min 升序）
            const tiers = Array.isArray(json.tiers) ? json.tiers.slice() : [];
            tiers.sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
            cachedConfig = {
                defaultIp: (json as any).defaultIp ?? '127.0.0.1',
                tiers
            } as GameIpConfig;
            cachedMtimeMs = stat.mtimeMs;
            startWatcher(file);
        }
        return cachedConfig as GameIpConfig;
    } catch (e) {
        // 文件不存在或解析失败，使用安全默认
        if (!cachedConfig) {
            cachedConfig = { defaultIp: '127.0.0.1', tiers: [] };
        }
        return cachedConfig;
    }
}

export function selectGameIpByAmount(amount: number): string {
    const cfg = safeReadConfig();
    const value = Number.isFinite(amount as number) ? Number(amount) : 0;

    for (const tier of cfg.tiers || []) {
        const minOk = tier.min === undefined || value >= tier.min;
        const maxOk = tier.max === undefined || value <= tier.max;
        if (minOk && maxOk) {
            if (typeof tier.ip === 'string') return tier.ip;
            // 将对象直接序列化为字符串返回，减少对上层的改动
            return JSON.stringify(tier.ip || {});
        }
    }
    if (typeof cfg.defaultIp === 'string') return cfg.defaultIp || '127.0.0.1';
    if (cfg.defaultIp && typeof cfg.defaultIp === 'object') {
        // 将对象直接序列化为字符串返回
        return JSON.stringify(cfg.defaultIp);
    }
    return '127.0.0.1';
}

export function reloadGameIpConfig(): void {
    // 通过修改 cachedMtimeMs 触发下次读取
    cachedMtimeMs = 0;
}


