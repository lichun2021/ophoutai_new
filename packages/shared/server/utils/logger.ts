/**
 * 统一日志系统
 * - 生产环境输出 JSON 结构化日志（便于 ELK/Loki 采集）
 * - 开发环境输出彩色可读日志
 * - 通过 LOG_LEVEL 环境变量控制级别（debug/info/warn/error）
 * - 支持可选 context 标签，方便按模块过滤
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

function getCurrentLevel(): number {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function formatMessage(level: LogLevel, context: string, message: string, meta?: object): string {
  const ts = new Date().toISOString();

  if (isProduction()) {
    // JSON 结构化日志（适合日志采集）
    return JSON.stringify({
      ts,
      level,
      ctx: context,
      msg: message,
      ...(meta ? { meta } : {}),
    });
  }

  // 开发环境：彩色可读格式
  const color = COLORS[level];
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${color}[${level.toUpperCase()}]${RESET} ${ts} [${context}] ${message}${metaStr}`;
}

function log(level: LogLevel, context: string, message: string, meta?: object): void {
  if (LEVELS[level] < getCurrentLevel()) return;

  const formatted = formatMessage(level, context, message, meta);

  if (level === 'error' || level === 'warn') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * 创建带 context 标签的 logger 实例
 * 用法：const logger = createLogger('payment')
 *       logger.info('订单创建', { orderId: '123' })
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, meta?: object) => log('debug', context, message, meta),
    info:  (message: string, meta?: object) => log('info',  context, message, meta),
    warn:  (message: string, meta?: object) => log('warn',  context, message, meta),
    error: (message: string, meta?: object) => log('error', context, message, meta),
  };
}

/** 全局默认 logger（context = 'app'） */
export const logger = createLogger('app');
