import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
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
const {
  applyWorldConfigFields, normalizeOpWorldConfig, normalizeServerlistConfig, toWorldConfigFields, WORLD_CONFIG_FIELDS,
} = module.exports;

const saved = {
  enabled: true, host: 'game.example.test', port: 8602, status: 1, visible: 1, maintain: 0,
  opensAt: '2026-10-23T00:00', osType: 3, channelGroup: 'op3', wssurl: 'wss://game.example.test/webSocketGate',
};
const world = {
  _id: 111, n: 'OP38 Linux 隔离测试111', w: 1, v: 1, ostype: 3, fMaintain: 0,
  start: [2026, 10, 23, 0, 0], game_db: 'gameDb', fighting_db: 'fightingDb',
};

test('legacy JSON preserves known configuration and allows previously published rows without static endpoint fields', () => {
  const result = normalizeServerlistConfig(JSON.stringify({ enabled: true, unrelated: 'ignored' }));
  assert.deepEqual(result, {
    enabled: true, host: '', port: null, status: 1, visible: 1, maintain: 0,
    opensAt: '', osType: 3, channelGroup: '',
  });
  const { wssurl, ...legacy } = saved;
  assert.deepEqual(normalizeServerlistConfig(JSON.stringify({ ...legacy, wsurl: wssurl })), saved);
  assert.deepEqual(normalizeServerlistConfig({ ...legacy, wss: wssurl }), saved);
  assert.deepEqual(normalizeServerlistConfig({ ...saved, wsurl: 'old.invalid', wss: 'older.invalid' }), saved);
  for (const value of ['not json', '[]', 12, true, { enabled: 'true' }]) {
    assert.throws(() => normalizeServerlistConfig(value));
  }
  for (const changes of [{ host: 'https://game.example.test' }, { port: 65536 }, { channelGroup: 'unknown' }]) {
    assert.throws(() => normalizeServerlistConfig({ ...saved, ...changes }));
  }
});

test('native OP fields round-trip through stored config, including zero flags and Beijing calendar values', () => {
  const native = {
    ...world, w: 0, v: 0, ostype: 2, fMaintain: 1, start: [2028, 2, 29, 3, 4],
    wsurl: ' wss://game.example.test:8443/webSocketGate ',
  };
  const config = applyWorldConfigFields(JSON.stringify({ ...saved, status: 'bad legacy value' }), native);
  assert.deepEqual(config, {
    ...saved, status: 0, visible: 0, osType: 2, maintain: 1, opensAt: '2028-02-29T03:04',
    game_db: 'gameDb', fighting_db: 'fightingDb', wssurl: native.wsurl.trim(),
  });
  assert.deepEqual(Object.keys(toWorldConfigFields(config)), WORLD_CONFIG_FIELDS);
  const { _id, n, ...fields } = native;
  assert.deepEqual(toWorldConfigFields(config), { ...fields, wsurl: native.wsurl.trim() });
  assert.deepEqual(toWorldConfigFields({ ...config, opensAt: '2028-02-29T03:04:53' }).start, fields.start);
});

test('omitted fields keep saved values and explicit clear values remove them', () => {
  const config = { ...saved, game_db: 'gameDb', fighting_db: 'fightingDb' };
  assert.deepEqual(applyWorldConfigFields(config, { w: 3 }), { ...config, status: 3 });
  const cleared = applyWorldConfigFields(config, {
    start: null, wssurl: '', wsurl: 'older.example.test', wss: saved.wssurl, game_db: '', fighting_db: null,
  });
  assert.deepEqual(toWorldConfigFields(cleared), {
    w: 1, v: 1, ostype: 3, fMaintain: 0, start: null, game_db: '', fighting_db: '', wsurl: '',
  });
  assert.equal(toWorldConfigFields(null).start, null);
  assert.equal(Object.hasOwn(applyWorldConfigFields({}, { w: 0 }), 'wssurl'), false);
});

test('OP start requires five integers for a valid local calendar date', () => {
  for (const start of [
    1792684800, '2026-10-23T00:00', [2026, 10, 23, 0], [2026, 10, 23, 0, 0, 0],
    [2026, 10, 23, 0, '0'], [2026, 10, 23, 0, 1.5], Array(5), [2026, 2, 29, 0, 0],
    [2026, 4, 31, 0, 0], [2026, 13, 1, 0, 0], [2026, 1, 0, 0, 0], [2026, 10, 23, 24, 0],
    [2026, 10, 23, 0, 60], [0, 1, 1, 0, 0], [10000, 1, 1, 0, 0],
  ]) {
    assert.throws(() => applyWorldConfigFields(saved, { start }), /开服时间/);
  }
});

test('OP publishing requires numeric ID and flags, name, a five-part date, and database pool keys', () => {
  for (const key of ['_id', 'n', 'w', 'v', 'ostype', 'fMaintain', 'start', 'game_db', 'fighting_db']) {
    const incomplete = { ...world };
    delete incomplete[key];
    assert.throws(() => normalizeOpWorldConfig(incomplete));
  }
  for (const changes of [
    { _id: '111' }, { _id: 0 }, { _id: 1.5 }, { _id: 2147483648 }, { n: ' ' },
    { w: '1' }, { w: 3 }, { v: 2 }, { ostype: 4 }, { fMaintain: true }, { start: null },
    { start: [2026, 10, 23, 9] },
    { game_db: '' }, { fighting_db: null },
  ]) {
    assert.throws(() => normalizeOpWorldConfig({ ...world, ...changes }));
  }
  const result = normalizeOpWorldConfig({ ...world, unrelated: 'ignored' });
  assert.deepEqual(result, world);
  assert.notEqual(result.start, world.start);
  assert.equal(Object.hasOwn(result, 'wsurl'), false);
  assert.equal(normalizeOpWorldConfig({ ...world, wsurl: '' }).wsurl, '');
  assert.deepEqual(normalizeOpWorldConfig({ ...world, wss: saved.wssurl }), { ...world, wsurl: saved.wssurl });
  assert.deepEqual(normalizeOpWorldConfig({ ...world, wssurl: saved.wssurl, wsurl: 'old.invalid' }), { ...world, wsurl: saved.wssurl });
});

test('WSS normalizes a host or secure WebSocket URL and defaults the game path', () => {
  for (const [wsurl, expected] of [
    ['game.example.test', 'wss://game.example.test/webSocketGate'],
    [' game.example.test:8443 ', 'wss://game.example.test:8443/webSocketGate'],
    ['WSS://GAME.example.test:443/', 'wss://game.example.test/webSocketGate'],
    ['wss://game.example.test', 'wss://game.example.test/webSocketGate'],
    ['wss://game.example.test/game/custom', 'wss://game.example.test/game/custom'],
    ['[2001:0DB8::1]:8443', 'wss://[2001:db8::1]:8443/webSocketGate'],
  ]) {
    assert.equal(normalizeOpWorldConfig({ ...world, wsurl }).wsurl, expected);
    assert.equal(applyWorldConfigFields(saved, { wsurl }).wssurl, expected);
    assert.equal(normalizeServerlistConfig({ ...saved, wssurl: wsurl }).wssurl, expected);
  }
  assert.equal(normalizeServerlistConfig({ wss: 'game.example.test' }).wssurl, saved.wssurl);
});

test('WSS rejects insecure schemes, malformed URLs, credentials, query, and hash', () => {
  for (const wsurl of [
    'ws://example.test', 'https://example.test', 'wss:example.test', 'wss:///example.test', 'wss://',
    'wss://user:password@example.test', 'wss://@example.test', 'wss://example.test/webSocketGate?',
    'wss://example.test/webSocketGate?uid=test', 'wss://example.test/webSocketGate#', 'wss://example.test/#frag',
    'wss://example.test:65536', 'wss://game node.example.test', 'user:password@example.test',
    'example.test:65536', 'example.test?uid=test', 'example.test#fragment', '//example.test',
  ]) {
    assert.throws(() => normalizeOpWorldConfig({ ...world, wsurl }), /WSS/);
    assert.throws(() => applyWorldConfigFields(saved, { wsurl }), /WSS/);
  }
});
