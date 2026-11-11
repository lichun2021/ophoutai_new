import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

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
}

// Database boundary: values are validated before becoming public client data.
export interface ServerlistRow {
  id?: unknown;
  server_id?: unknown;
  name?: unknown;
  is_active?: unknown;
  serverlist_config?: unknown;
}

export interface ServerlistWorld {
  _id: number;
  w: number;
  n: string;
  start: number;
  v: 0 | 1;
  ostype: 1 | 2 | 3;
  subChannelId: 'op1' | 'op2' | 'op3';
  game: { h: string; p: number };
  fMaintain: 0 | 1;
}

export interface ServerlistPayload {
  worldList: ServerlistWorld[];
}

export interface ServerlistWriteResult {
  path: string;
  count: number;
  bytes: number;
}

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
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) throw new Error('请填写真实的游戏区服ID');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id > 2147483647) throw new Error('游戏区服ID超出有效范围');
  return id;
}

// datetime-local is deliberately interpreted as Beijing time, independently
// of the server process timezone and without accepting implicit rollover dates.
function openTimeSeconds(value: string): number {
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
  return (date.getTime() - 8 * 60 * 60 * 1000) / 1000;
}

export function normalizeServerlistConfig(value: unknown): ServerlistConfig {
  let source = value;
  if (typeof source === 'string') {
    if (!source.trim()) source = null;
    else {
      try { source = JSON.parse(source); } catch { throw new Error('服务器列表配置不是有效的JSON对象'); }
    }
  }
  const input = source === null || source === undefined ? {} : objectValue(source, '服务器列表配置须为JSON对象');
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
  if (opensAt) openTimeSeconds(opensAt);
  const config: ServerlistConfig = {
    enabled,
    host,
    port,
    status: enumValue(field('status'), [0, 1, 2, 3, 4], '服务器状态须为0至4的整数'),
    visible: enumValue(field('visible'), BITS, '服务器可见状态须为0或1'),
    maintain: enumValue(field('maintain'), BITS, '服务器维护状态须为0或1'),
    opensAt,
    osType: enumValue(field('osType'), [1, 2, 3] as const, '平台须为1、2或3'),
    channelGroup: group as ServerlistConfig['channelGroup'],
  };
  if (enabled) {
    if (!host) throw new Error('启用发布前请填写游戏节点主机');
    if (port === null) throw new Error('启用发布前请填写游戏节点端口');
    if (!opensAt) throw new Error('启用发布前请填写北京时间开服时间');
    if (!group) throw new Error('启用发布前请选择服务器分组');
  }
  return config;
}

export function buildServerlist(rows: ServerlistRow[], nowMs = Date.now()): ServerlistPayload {
  if (!Array.isArray(rows)) throw new Error('服务器列表数据格式错误');
  if (!Number.isFinite(nowMs)) throw new Error('当前时间无效，无法生成服务器列表');
  const nowSeconds = Math.floor(nowMs / 1000);
  const worldList: ServerlistWorld[] = [];
  const seen = new Set<number>();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') throw new Error('服务器记录格式错误');
    if (row.is_active !== 1 && row.is_active !== '1' && row.is_active !== true) return;
    try {
      const config = normalizeServerlistConfig(row.serverlist_config);
      if (!config.enabled) return;
      const world = worldIdValue(row.server_id);
      if (seen.has(world)) throw new Error('存在重复的游戏区服ID');
      seen.add(world);
      const name = stringValue(row.name, '区服名称不能为空');
      if (!name || name.length > 100) throw new Error('区服名称须为1至100个字符');
      const start = openTimeSeconds(config.opensAt);
      if (start >= nowSeconds) return;
      worldList.push({
        _id: world, w: config.status, n: name, start, v: config.visible, ostype: config.osType,
        subChannelId: config.channelGroup as ServerlistWorld['subChannelId'],
        game: { h: config.host, p: config.port! }, fMaintain: config.maintain,
      });
    } catch (error: any) {
      throw new Error(`第${index + 1}条区服配置无效：${error.message}`);
    }
  });
  if (!worldList.length) throw new Error('没有已开服且启用发布的区服，原serverlist文件保持不变');
  worldList.sort((left, right) => right._id - left._id);
  return { worldList };
}

function serializeServerlist(payload: ServerlistPayload): { content: string; count: number } {
  const input = objectValue(payload, '服务器列表文件内容须为JSON对象');
  if (!Array.isArray(input.worldList) || !input.worldList.length) throw new Error('服务器列表不能为空，原文件保持不变');
  const seen = new Set<number>();
  const worldList = input.worldList.map(raw => {
    const world = objectValue(raw, '服务器列表条目格式错误');
    const id = worldIdValue(world._id);
    if (seen.has(id)) throw new Error('服务器列表包含重复区服ID');
    seen.add(id);
    const name = stringValue(world.n, '服务器列表区服名称无效');
    if (!name || name.length > 100) throw new Error('服务器列表区服名称无效');
    if (typeof world.start !== 'number' || !Number.isSafeInteger(world.start)) throw new Error('服务器列表开服时间须为整数秒');
    if (!GROUPS.includes(world.subChannelId as typeof GROUPS[number])) throw new Error('服务器列表分组无效');
    const game = objectValue(world.game, '服务器列表游戏节点格式错误');
    return {
      _id: id, w: enumValue(world.w, [0, 1, 2, 3, 4], '服务器列表状态无效'), n: name, start: world.start,
      v: enumValue(world.v, BITS, '服务器列表可见状态无效'),
      ostype: enumValue(world.ostype, [1, 2, 3] as const, '服务器列表平台无效'),
      subChannelId: world.subChannelId as ServerlistWorld['subChannelId'],
      game: { h: hostValue(game.h), p: portValue(game.p) },
      fMaintain: enumValue(world.fMaintain, BITS, '服务器列表维护状态无效'),
    };
  }).sort((left, right) => right._id - left._id);
  return { content: JSON.stringify({ worldList }, null, 2) + '\n', count: worldList.length };
}

async function checkTarget(target: string): Promise<void> {
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('serverlist目标不是普通文件，已停止生成');
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// The application controller must call writeServerlist, not accept a client path.
export async function writeServerlistToPath(target: string, payload: ServerlistPayload): Promise<ServerlistWriteResult> {
  const { content, count } = serializeServerlist(payload);
  if (!path.isAbsolute(target) || path.basename(target) === path.sep) throw new Error('服务器列表输出路径无效');
  await checkTarget(target);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let created = false;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(temporary, 'wx', 0o644);
    created = true;
    await file.chmod(0o644);
    await file.writeFile(content, 'utf8');
    await file.sync();
    await file.close();
    file = undefined;
    await checkTarget(target);
    await rename(temporary, target);
    created = false;
  } finally {
    if (file) await file.close().catch(() => {});
    if (created) await unlink(temporary).catch(() => {});
  }
  return { path: target, count, bytes: Buffer.byteLength(content, 'utf8') };
}

export function writeServerlist(payload: ServerlistPayload): Promise<ServerlistWriteResult> {
  return writeServerlistToPath('/data/serverlist', payload);
}
