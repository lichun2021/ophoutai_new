import { isIP } from 'node:net';

export interface ServerlistConfig {
  enabled: boolean;
  host: string;
  port: number | null;
  status: number;
  visible: 0 | 1;
  maintain: 0 | 1;
  opensAt: string;
  osType: 1 | 2 | 3;
  channelGroup: '' | 'op1' | 'op2' | 'op3';
  game_db?: string;
  fighting_db?: string;
  wssurl?: string;
}

type WorldStart = [number, number, number, number, number];

export interface OpWorldConfig {
  _id: number;
  n: string;
  w: number;
  v: 0 | 1;
  ostype: 1 | 2 | 3;
  fMaintain: 0 | 1;
  start: WorldStart;
  game_db: string;
  fighting_db: string;
  wsurl?: string;
}

export const WORLD_CONFIG_FIELDS = ['w', 'v', 'ostype', 'fMaintain', 'start', 'game_db', 'fighting_db', 'wsurl'] as const;
type WorldConfigField = typeof WORLD_CONFIG_FIELDS[number];

const DEFAULT_CONFIG: ServerlistConfig = {
  enabled: false,
  host: '',
  port: null,
  status: 1,
  visible: 1,
  maintain: 0,
  opensAt: '',
  osType: 3,
  channelGroup: '',
};
const GROUPS = ['op1', 'op2', 'op3'] as const;
const BITS = [0, 1] as const;
const OS_TYPES = [1, 2, 3] as const;
const WORLD_STATUSES = [0, 1, 2, 3, 4] as const;
const OP_WORLD_STATUSES = [0, 1, 2] as const;

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value.trim();
}

function enumValue<T extends number>(value: unknown, choices: readonly T[], message: string): T {
  if (typeof value !== 'number' || !Number.isInteger(value) || !choices.includes(value as T)) throw new Error(message);
  return value as T;
}

function hostValue(value: unknown): string {
  const host = stringValue(value, '游戏节点主机必须是字符串');
  if (!host || host.length > 253 || /[\s/@\\?#]/.test(host)) {
    throw new Error('游戏节点主机需为IP或域名，不含协议、端口、路径或账号');
  }
  if (host.startsWith('[') && host.endsWith(']') && isIP(host.slice(1, -1)) === 6) return host;
  if (host.includes(':') || host.includes('[') || host.includes(']')) {
    throw new Error('游戏节点主机不能包含端口；IPv6地址须使用方括号');
  }
  if (isIP(host) === 4) return host;
  if (/^\d+(?:\.\d+){3}$/.test(host) || /^\d+$/.test(host)) throw new Error('游戏节点IP地址无效');
  const labels = host.replace(/\.$/, '').split('.');
  if (!labels.every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) {
    throw new Error('游戏节点主机需为有效的IP或域名');
  }
  return host;
}

function portValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('游戏节点端口须为1至65535的整数');
  }
  return value;
}

function worldIdValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new Error('游戏区服ID（_id）须为1至2147483647的整数');
  }
  return value;
}

// Validate the Beijing calendar date independently of the process timezone.
function validateOpensAt(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error('开服时间须为北京时间YYYY-MM-DDTHH:mm格式');
  const [year, month, day, hour, minute, second] = match.slice(1).map(part => Number(part || 0));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
    || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
    throw new Error('开服时间不是有效的北京时间日期');
  }
}

function opensAtFromWorldStart(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 5 || !Array.from(value).every(Number.isInteger)) {
    throw new Error('开服时间（start）须为包含年、月、日、时、分的整数数组');
  }
  const [yyyy, mm, dd, hh, min] = value.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'));
  const opensAt = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  validateOpensAt(opensAt);
  return opensAt;
}

function worldStartFromOpensAt(value: string): WorldStart {
  return value.slice(0, 16).split(/[-T:]/).map(Number) as WorldStart;
}

function databaseValue(value: unknown, key: 'game_db' | 'fighting_db', required = false): string {
  const name = stringValue(value, `数据库配置名（${key}）须为字符串`);
  if (required && !name) throw new Error(`数据库配置名（${key}）不能为空`);
  return name;
}

function wsurlInput(input: Record<string, unknown>): unknown {
  for (const key of ['wssurl', 'wsurl', 'wss']) {
    if (Object.hasOwn(input, key) && input[key] !== undefined) return input[key];
  }
}

function wsurlValue(input: unknown): string {
  const error = 'WSS 地址须为有效的主机或 wss:// URL，且不能包含账号、密码、查询参数或片段';
  const value = stringValue(input, error);
  if (!value) return value;
  const url = value.includes('://') ? value : `wss://${value}`;
  const authority = /^wss:\/\/([^/]+)/i.exec(url)?.[1];
  if (!authority || authority.includes('@') || /[\u0000-\u0020\u007f\s\\?#]/.test(value)) throw new Error(error);
  try {
    const endpoint = new URL(url);
    if (endpoint.pathname === '/') endpoint.pathname = '/webSocketGate';
    return endpoint.toString();
  } catch {
    throw new Error(error);
  }
}

function readServerlistConfig(value: unknown): Record<string, unknown> {
  let source = value;
  if (typeof source === 'string') {
    if (!source.trim()) source = null;
    else {
      try { source = JSON.parse(source); } catch { throw new Error('服务器列表配置不是有效的JSON对象'); }
    }
  }
  return source === null || source === undefined ? {} : objectValue(source, '服务器列表配置须为JSON对象');
}

export function normalizeServerlistConfig(value: unknown): ServerlistConfig {
  const input = readServerlistConfig(value);
  const field = (key: keyof ServerlistConfig) => Object.hasOwn(input, key) && input[key] !== undefined ? input[key] : DEFAULT_CONFIG[key];
  const enabled = field('enabled');
  if (typeof enabled !== 'boolean') throw new Error('服务器列表发布开关须为布尔值');
  const host = stringValue(field('host'), '游戏节点主机必须是字符串');
  const rawPort = field('port');
  const port = rawPort === null || rawPort === '' ? null : portValue(rawPort);
  const opensAt = stringValue(field('opensAt'), '开服时间必须是字符串');
  const group = stringValue(field('channelGroup'), '请选择服务器分组');
  if (group && !GROUPS.includes(group as typeof GROUPS[number])) throw new Error('服务器分组须为op1、op2或op3');
  if (host) hostValue(host);
  if (opensAt) validateOpensAt(opensAt);
  const config: ServerlistConfig = {
    enabled,
    host,
    port,
    status: enumValue(field('status'), WORLD_STATUSES, '服务器状态须为0至4的整数'),
    visible: enumValue(field('visible'), BITS, '服务器可见状态须为0或1'),
    maintain: enumValue(field('maintain'), BITS, '服务器维护状态须为0或1'),
    opensAt,
    osType: enumValue(field('osType'), OS_TYPES, '平台须为1、2或3'),
    channelGroup: group as ServerlistConfig['channelGroup'],
  };
  if (field('game_db') !== undefined) config.game_db = databaseValue(field('game_db') ?? '', 'game_db');
  if (field('fighting_db') !== undefined) config.fighting_db = databaseValue(field('fighting_db') ?? '', 'fighting_db');
  const wsurl = wsurlInput(input);
  if (wsurl !== undefined) config.wssurl = wsurlValue(wsurl ?? '');
  return config;
}

export function applyWorldConfigFields(base: unknown, input: Record<string, unknown>): ServerlistConfig {
  const config = readServerlistConfig(base);
  const field = (key: WorldConfigField, fallback?: unknown) => Object.hasOwn(input, key) && input[key] !== undefined ? input[key] : fallback;
  const start = field('start');
  const wsurl = wsurlInput(input);
  return normalizeServerlistConfig({
    ...config,
    status: field('w', config.status),
    visible: field('v', config.visible),
    osType: field('ostype', config.osType),
    maintain: field('fMaintain', config.maintain),
    opensAt: start === undefined ? config.opensAt : start === null ? '' : opensAtFromWorldStart(start),
    game_db: field('game_db', config.game_db),
    fighting_db: field('fighting_db', config.fighting_db),
    wssurl: wsurl === undefined ? wsurlInput(config) : wsurl,
  });
}

export function toWorldConfigFields(value: unknown) {
  const config = normalizeServerlistConfig(value);
  return {
    w: config.status,
    v: config.visible,
    ostype: config.osType,
    fMaintain: config.maintain,
    start: config.opensAt ? worldStartFromOpensAt(config.opensAt) : null,
    game_db: config.game_db ?? '',
    fighting_db: config.fighting_db ?? '',
    wsurl: config.wssurl,
  };
}

export function normalizeOpWorldConfig(value: unknown): OpWorldConfig {
  const input = objectValue(value, 'OP 区服数据须为JSON对象');
  const id = worldIdValue(input._id);
  const name = stringValue(input.n, '区服名称（n）须为字符串');
  if (!name || name.length > 100) throw new Error('区服名称（n）须为1至100个字符');
  const config: OpWorldConfig = {
    _id: id,
    n: name,
    w: enumValue(input.w, OP_WORLD_STATUSES, 'OP 区服状态（w）须为0、1或2'),
    v: enumValue(input.v, BITS, '服务器可见状态（v）须为0或1'),
    ostype: enumValue(input.ostype, OS_TYPES, '平台（ostype）须为1、2或3'),
    fMaintain: enumValue(input.fMaintain, BITS, '服务器维护状态（fMaintain）须为0或1'),
    start: worldStartFromOpensAt(opensAtFromWorldStart(input.start)),
    game_db: databaseValue(input.game_db, 'game_db', true),
    fighting_db: databaseValue(input.fighting_db, 'fighting_db', true),
  };
  const wsurl = wsurlInput(input);
  if (wsurl !== undefined) config.wsurl = wsurlValue(wsurl ?? '');
  return config;
}
