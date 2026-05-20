/**
 * 全局日志时间戳插件
 * Nuxt server plugin：服务启动时重写 console，所有日志自动加时间前缀
 * 格式: [HH:MM:SS] [LEVEL] message
 */
export default defineNitroPlugin(() => {
    const getTime = () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
    };

    const _log   = console.log.bind(console);
    const _warn  = console.warn.bind(console);
    const _error = console.error.bind(console);
    const _info  = console.info.bind(console);

    console.log   = (...args: any[]) => _log(getTime(),   ...args);
    console.warn  = (...args: any[]) => _warn(getTime(),  '[WARN]',  ...args);
    console.error = (...args: any[]) => _error(getTime(), '[ERROR]', ...args);
    console.info  = (...args: any[]) => _info(getTime(),  '[INFO]',  ...args);
});
