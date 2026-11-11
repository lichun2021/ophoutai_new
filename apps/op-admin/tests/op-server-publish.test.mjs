import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('./.op-server-publish-test.cjs', import.meta.url));
const { outputFiles } = await require('esbuild').build({
  entryPoints: [fileURLToPath(new URL('../server/utils/opServerConfigPublish.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['h3'],
});
const bundle = new Module(filename);
bundle.paths = Module._nodeModulePaths(fileURLToPath(new URL('..', import.meta.url)));
bundle._compile(outputFiles[0].text, filename);
const { publishOpServerConfig } = bundle.exports;

const url = 'https://op.example.test/v2/game_world/publish?env=1';
const token = 'ab'.repeat(32);
const world = {
  _id: 111,
  w: 1,
  n: 'OP38 Linux 隔离测试111',
  v: 1,
  ostype: 3,
  fMaintain: 0,
  start: [2026, 10, 23, 0, 35],
  game_db: 'gameDb',
  fighting_db: 'fightingDb',
  wsurl: 'wss://op.example.test/webSocketGate',
};

function configure(context, overrides = {}) {
  const settings = {
    OP_WORLD_PUBLISH_URL: url,
    OP_WORLD_PUBLISH_TOKEN: token,
    ...overrides,
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test('publishes the native document and requires an acknowledgement of its applied fields', async context => {
  configure(context);
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({
    code: 200, result: { reloaded: true, world },
  }));

  await publishOpServerConfig(world);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [target, request] = fetchMock.mock.calls[0].arguments;
  assert.equal(target.href, url);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Cookie, undefined);
  assert.equal(request.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(request.body), world);
  assert.equal(request.redirect, 'error');
});

test('does not report success if OP drops minutes or has not reloaded', async context => {
  configure(context);
  const responses = [
    { reloaded: true, world: { ...world, start: [2026, 10, 23, 0] } },
    { reloaded: false, world },
  ];
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, result: responses.shift() }));

  for (const _ of [0, 1]) {
    await assert.rejects(publishOpServerConfig(world), error => error.statusCode === 502 && /待确认/.test(error.message));
  }
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('clearing wsurl requires an acknowledgement with the field removed', async context => {
  configure(context);
  const { wsurl, ...withoutWsurl } = world;
  const responses = [withoutWsurl, { ...withoutWsurl, wsurl }];
  context.mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, result: { reloaded: true, world: responses.shift() } }));
  await publishOpServerConfig({ ...world, wsurl: '' });
  await assert.rejects(publishOpServerConfig({ ...world, wsurl: '' }), /待确认/);
});

test('does not send a publish request for another world', async context => {
  configure(context);
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  await assert.rejects(publishOpServerConfig({ ...world, _id: 112 }), error => (
    error.statusCode === 403 && /仅授权区服 111/.test(error.message)
  ));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('publish rejection or connection loss never retries the write or reveals upstream details', async context => {
  configure(context);
  const publishResponses = [
    () => Response.json({ code: 203, error: 'upstream details' }, { status: 403 }),
    () => { throw new Error('upstream details'); },
  ];
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => publishResponses.shift()());
  for (const message of [/拒绝发布请求（HTTP 403）/, /待确认/]) {
    await assert.rejects(publishOpServerConfig(world), error => (
      error.statusCode === 502 && message.test(error.message) && !/upstream details/.test(error.message)
    ));
  }
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('reports missing server configuration before making a request', async context => {
  configure(context, { OP_WORLD_PUBLISH_TOKEN: undefined });
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  await assert.rejects(publishOpServerConfig(world), { statusCode: 503 });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('does not send the publish credential to a non-loopback HTTP URL', async context => {
  configure(context, { OP_WORLD_PUBLISH_URL: url.replace('https:', 'http:') });
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  await assert.rejects(publishOpServerConfig(world), { statusCode: 503 });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('does not send the publish credential to a different route', async context => {
  configure(context, { OP_WORLD_PUBLISH_URL: url.replace('env=1', 'env=2') });
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  await assert.rejects(publishOpServerConfig(world), { statusCode: 503 });
  assert.equal(fetchMock.mock.callCount(), 0);
});
