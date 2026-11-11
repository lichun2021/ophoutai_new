import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const esbuild = require('esbuild');
const filename = path.join(appRoot, 'server/utils/serverlist.ts');
const code = esbuild.transformSync(await fs.readFile(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'node20' }).code;
const module = new Module(filename);
module.paths = Module._nodeModulePaths(appRoot);
module._compile(code, filename);
const { normalizeServerlistConfig, buildServerlist, writeServerlistToPath } = module.exports;
const now = Date.parse('2026-11-10T14:00:00+08:00');
const config = {
  enabled: true, host: 'game.example.test', port: 8602, status: 1, visible: 1, maintain: 0,
  opensAt: '2026-10-23T00:00', osType: 3, channelGroup: 'op3',
};
const row = (id = 111, changes = {}) => ({
  id: 9000 + id, server_id: id, name: `区服${id}`, is_active: 1, serverlist_config: { ...config }, ...changes,
});
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'op-serverlist-export-'));
test.after(() => fs.rm(directory, { recursive: true, force: true }));
let serial = 0;
const targetPath = () => path.join(directory, `serverlist-${++serial}`);

test('drafts allow missing endpoint fields without inventing a channel group and unknown keys are stripped', () => {
  const draft = normalizeServerlistConfig(null);
  assert.deepEqual(draft, { enabled: false, host: '', port: null, status: 1, visible: 1, maintain: 0, opensAt: '', osType: 3, channelGroup: '' });
  draft.host = 'changed';
  assert.equal(normalizeServerlistConfig(undefined).host, '');
  const normalized = normalizeServerlistConfig(JSON.stringify({ ...config, dbpass: 'must-not-export', interSecret: 'must-not-export', path: '/private/other' }));
  assert.deepEqual(normalized, config);
  for (const field of ['host', 'port', 'opensAt', 'channelGroup']) {
    assert.throws(() => normalizeServerlistConfig({ ...config, [field]: field === 'port' ? null : '' }));
  }
  for (const value of ['not json', '[]', 12, true, { enabled: 'true' }]) assert.throws(() => normalizeServerlistConfig(value));
});

test('worldList projects only public fields, uses server_id rather than the database key, and sorts descending', () => {
  const data = row(111, { dbpass: 'private-db-password', webhost: 'http://inter-only.example:8111' });
  const payload = buildServerlist([data, row(112)], now);
  assert.deepEqual(payload.worldList.map(world => world._id), [112, 111]);
  assert.deepEqual(payload.worldList[1], {
    _id: 111, w: 1, n: '区服111', start: Date.parse('2026-10-23T00:00:00+08:00') / 1000,
    v: 1, ostype: 3, subChannelId: 'op3', game: { h: 'game.example.test', p: 8602 }, fMaintain: 0,
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('private-db-password'), false);
  assert.equal(serialized.includes('inter-only.example'), false);
  assert.equal(serialized.includes('9000'), false);
  assert.deepEqual(data.serverlist_config, config);
});

test('Beijing local dates convert independently of process TZ and invalid calendar rollover is rejected', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
      process.env.TZ = zone;
      assert.equal(buildServerlist([row()], now).worldList[0].start, Date.parse('2026-10-23T00:00:00+08:00') / 1000);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  assert.doesNotThrow(() => normalizeServerlistConfig({ ...config, opensAt: '2024-02-29T23:59:59' }));
  for (const opensAt of ['2026-02-29T12:00', '2026-04-31T12:00', '2026-13-01T00:00', '2026-01-00T00:00', '2026-10-23T24:00', '2026-10-23T12:60', '2026-10-23T12:00:60', '2026-10-23T12:00Z']) {
    assert.throws(() => normalizeServerlistConfig({ ...config, opensAt }));
  }
});

test('inactive, draft and not-yet-open worlds are omitted, while hidden and maintained worlds retain their flags', () => {
  const payload = buildServerlist([
    row(110, { is_active: 0, serverlist_config: 'invalid legacy draft' }),
    row(111),
    row(112, { server_id: null, serverlist_config: null }),
    row(113, { serverlist_config: { ...config, opensAt: '2026-11-10T14:00' } }),
    row(114, { serverlist_config: { ...config, opensAt: '2027-01-01T00:00' } }),
    row(115, { serverlist_config: { ...config, visible: 0, maintain: 1, status: 0 } }),
  ], now);
  assert.deepEqual(payload.worldList.map(world => world._id), [115, 111]);
  assert.deepEqual([payload.worldList[0].v, payload.worldList[0].fMaintain, payload.worldList[0].w], [0, 1, 0]);
  assert.throws(() => buildServerlist([row(114, { serverlist_config: { ...config, opensAt: '2027-01-01T00:00' } })], now), /没有已开服/);
});

test('invalid world IDs, duplicates, endpoints and enum values are rejected before publishing', () => {
  for (const server_id of [null, 0, '01', -1, 1.5, 2147483648]) assert.throws(() => buildServerlist([row(111, { server_id })], now));
  assert.throws(() => buildServerlist([row(), row()], now), /重复/);
  for (const host of ['http://game.example.test', 'game.example.test:8602', 'name:password@game.example.test', 'game.example.test/path', 'game.example.test?token=private', 'game.example.test\\path', '999.1.1.1']) {
    assert.throws(() => normalizeServerlistConfig({ ...config, host }));
  }
  for (const port of [0, 65536, 1.5, '8602']) assert.throws(() => normalizeServerlistConfig({ ...config, port }));
  for (const changes of [{ status: 5 }, { status: -1 }, { visible: 2 }, { maintain: true }, { osType: 4 }, { channelGroup: 'unknown' }]) {
    assert.throws(() => normalizeServerlistConfig({ ...config, ...changes }));
  }
  assert.doesNotThrow(() => normalizeServerlistConfig({ ...config, host: '[2001:db8::1]' }));
});

test('atomic replacement writes UTF-8 JSON without a BOM, ends in newline and sets public file mode', async () => {
  const target = targetPath();
  await fs.writeFile(target, 'previous complete file\n', { mode: 0o600 });
  const oldFile = await fs.open(target, 'r');
  try {
    const result = await writeServerlistToPath(target, buildServerlist([row()], now));
    const bytes = await fs.readFile(target);
    assert.equal(bytes[0], 0x7b);
    assert.equal(bytes.at(-1), 0x0a);
    assert.equal(JSON.parse(bytes).worldList[0].n, '区服111');
    assert.deepEqual(result, { path: target, count: 1, bytes: bytes.length });
    assert.equal((await fs.stat(target)).mode & 0o777, 0o644);
    assert.equal(await oldFile.readFile('utf8'), 'previous complete file\n');
  } finally { await oldFile.close(); }
});

test('serialization reprojects the whitelist and invalid or empty exports never overwrite a previous file', async () => {
  const target = targetPath();
  const payload = buildServerlist([row()], now);
  payload.privateSetting = 'private';
  payload.worldList[0].dbpass = 'private';
  payload.worldList[0].game.password = 'private';
  await writeServerlistToPath(target, payload);
  const before = await fs.readFile(target, 'utf8');
  assert.equal(before.includes('private'), false);
  for (const invalid of [{ worldList: [] }, { worldList: [{ ...payload.worldList[0], game: { h: 'http://bad', p: 1 } }] }]) {
    await assert.rejects(writeServerlistToPath(target, invalid));
    assert.equal(await fs.readFile(target, 'utf8'), before);
  }
  await assert.rejects(async () => writeServerlistToPath(target, buildServerlist([row(111, { serverlist_config: { ...config, opensAt: '2027-01-01T00:00' } })], now)));
  assert.equal(await fs.readFile(target, 'utf8'), before);
});

test('failed rename preserves the old file and removes only its own temporary file', async () => {
  const target = targetPath();
  await fs.writeFile(target, 'previous\n');
  const unrelated = path.join(directory, `.${path.basename(target)}.unrelated.tmp`);
  await fs.writeFile(unrelated, 'other operation\n');
  const original = fs.rename;
  fs.rename = async (source, destination) => {
    if (destination === target) {
      assert.equal(JSON.parse(await fs.readFile(source, 'utf8')).worldList.length, 1);
      const error = new Error('simulated rename failure');
      error.code = 'EACCES';
      throw error;
    }
    return original(source, destination);
  };
  try {
    await assert.rejects(writeServerlistToPath(target, buildServerlist([row()], now)), /simulated rename failure/);
  } finally { fs.rename = original; }
  assert.equal(await fs.readFile(target, 'utf8'), 'previous\n');
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'other operation\n');
  assert.deepEqual((await fs.readdir(directory)).filter(name => name.startsWith(`.${path.basename(target)}.`)), [path.basename(unrelated)]);
});

test('directories, symbolic links and special files are refused without touching their contents', async () => {
  const payload = buildServerlist([row()], now);
  const victim = targetPath();
  await fs.writeFile(victim, 'unchanged\n');
  const link = targetPath();
  await fs.symlink(victim, link);
  await assert.rejects(writeServerlistToPath(link, payload), /不是普通文件/);
  assert.equal(await fs.readFile(victim, 'utf8'), 'unchanged\n');
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
  const folder = targetPath();
  await fs.mkdir(folder);
  await assert.rejects(writeServerlistToPath(folder, payload), /不是普通文件/);
  const fifo = targetPath();
  execFileSync('mkfifo', [fifo]);
  await assert.rejects(writeServerlistToPath(fifo, payload), /不是普通文件/);
});
