import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const esbuild = require('esbuild');
const { createApp, createError, defineEventHandler, toNodeListener } = require('h3');
const fixture = { allowed: true, denialStatus: 401, writes: [], queries: 0, rows: [], files: [], fileError: null };
globalThis.__gmConfigFixture = fixture;
const modelFixture = { rows: [], calls: [] };
globalThis.__gmServerModelFixture = modelFixture;

async function loadController(filename) {
  const mocks = {
    './gm': 'import {createError} from "h3"; export async function requireGMPermission(){if(!globalThis.__gmConfigFixture.allowed)throw createError({statusCode:globalThis.__gmConfigFixture.denialStatus});}',
    '../model/gameServers': `
      export async function listAll(){globalThis.__gmConfigFixture.queries++;return globalThis.__gmConfigFixture.rows;}
      export async function createServer(value){globalThis.__gmConfigFixture.writes.push({action:'create',value});}
      export async function updateServer(id,value){globalThis.__gmConfigFixture.writes.push({action:'update',id,value});}
      export async function removeServer(id){globalThis.__gmConfigFixture.writes.push({action:'remove',id});}`,
    '../model/gmOperationLogs': 'export async function queryGmOperationLogs(){globalThis.__gmConfigFixture.queries++;return {rows:[],total:0,page:1,pageSize:20};}',
    '../utils/serverlist': `
      export {buildServerlist,normalizeServerlistConfig} from ${JSON.stringify(path.join(appRoot, 'server/utils/serverlist.ts'))};
      export async function writeServerlist(payload){
        if(globalThis.__gmConfigFixture.fileError)throw globalThis.__gmConfigFixture.fileError;
        globalThis.__gmConfigFixture.files.push(payload);
        return {path:'/data/serverlist',count:payload.worldList.length,bytes:Buffer.byteLength(JSON.stringify(payload))};
      }`,
  };
  const bundle = await esbuild.build({
    entryPoints: [path.join(appRoot, 'server/controller', filename)],
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['h3'],
    plugins: [{ name: 'local-config-models', setup(build) {
      build.onResolve({ filter: /^(\.\/gm|\.\.\/model\/(gameServers|gmOperationLogs)|\.\.\/utils\/serverlist)$/ }, args => ({ path: args.path, namespace: 'local-config-model' }));
      build.onLoad({ filter: /.*/, namespace: 'local-config-model' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: appRoot }));
    } }],
  });
  const output = path.join(appRoot, 'tests', '.local-' + filename + '.cjs');
  const module = new Module(output);
  module.paths = Module._nodeModulePaths(appRoot);
  module._compile(bundle.outputFiles[0].text, output);
  return module.exports;
}

const config = await loadController('serverConfig.ts');
const logs = await loadController('gmLogs.ts');
const modelBundle = await esbuild.build({
  entryPoints: [path.join(appRoot, 'server/model/gameServers.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'local-server-database', setup(build) {
    build.onResolve({ filter: /^(\.\.\/db|\.\.\/utils\/redis-cluster)$/ }, args => ({ path: args.path, namespace: 'local-server-database' }));
    build.onLoad({ filter: /.*/, namespace: 'local-server-database' }, args => ({ contents: args.path === '../db'
      ? 'export async function sql(params){globalThis.__gmServerModelFixture.calls.push(params);return params.query.startsWith("SELECT")?globalThis.__gmServerModelFixture.rows:{insertId:1};}'
      : 'export function getRedisCluster(){return {get:async()=>null,set:async()=>{},del:async()=>{}};}', loader: 'js' }));
  } }],
});
const modelModule = new Module(path.join(appRoot, 'tests/.local-server-model.cjs'));
modelModule.paths = Module._nodeModulePaths(appRoot);
modelModule._compile(modelBundle.outputFiles[0].text, path.join(appRoot, 'tests/.local-server-model.cjs'));
const serverModel = modelModule.exports;
const app = createApp();
app.use(defineEventHandler(event => {
  const route = new URL(event.node.req.url, 'http://localhost').pathname.slice(1);
  if (route === 'logs') return logs.listLogs(event);
  if (route === 'generate-serverlist') return config.generateServerlist(event);
  if (['list', 'create', 'update', 'remove'].includes(route)) return config[route](event);
  throw createError({ statusCode: 404 });
}));
const server = createServer(toNodeListener(app));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  delete globalThis.__gmConfigFixture;
  delete globalThis.__gmServerModelFixture;
});
test.beforeEach(() => { fixture.allowed = true; fixture.denialStatus = 401; fixture.writes = []; fixture.queries = 0; fixture.rows = []; fixture.files = []; fixture.fileError = null; modelFixture.rows = []; modelFixture.calls = []; });
const post = (route, body) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('server configuration and operation logs require the shared GM permission before database access', async () => {
  fixture.allowed = false;
  for (const route of ['/list', '/logs']) assert.equal((await fetch(url + route)).status, 401);
  for (const route of ['/create', '/update?id=1', '/remove?id=1', '/generate-serverlist']) assert.equal((await post(route, {})).status, 401);
  assert.equal(fixture.queries, 0);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.files.length, 0);
  fixture.denialStatus = 403;
  assert.equal((await post('/generate-serverlist', {})).status, 403);
  assert.equal(fixture.queries, 0);
});

test('new GM worlds need no MySQL credentials and do not activate old online/CDK operations', async () => {
  const response = await post('/create', { server_id: 7, name: ' 测试区服 ', webhost: 'http://127.0.0.1:8311/' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.deepEqual(fixture.writes[0], { action: 'create', value: {
    server_id: 7, name: '测试区服', webhost: 'http://127.0.0.1:8311',
    dbip: '', bname: '', dbuser: '', dbpass: '', serverlist_config: null, is_active: 1, allow_cdk_redeem: 0, count_online: 0,
  } });
});

const publicConfig = {
  enabled: true, host: 'game.example.test', port: 8602, status: 1, visible: 1,
  maintain: 0, opensAt: '2020-01-01T00:00', osType: 3, channelGroup: 'op3',
};

test('client-list-only worlds accept an empty Inter URL and normalize JSON without saving unknown fields', async () => {
  const response = await post('/create', {
    server_id: 111, name: '客户端区服', serverlist_config: JSON.stringify({ ...publicConfig, secret: 'must-not-save' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(fixture.writes[0].value.webhost, '');
  assert.deepEqual(fixture.writes[0].value.serverlist_config, publicConfig);
  assert.equal((await post('/update?id=1', { serverlist_config: { ...publicConfig, enabled: false, host: '' } })).status, 200);
  assert.equal(fixture.writes[1].value.serverlist_config.enabled, false);
  assert.equal((await post('/update?id=1', { serverlist_config: null })).status, 200);
  assert.equal(fixture.writes[2].value.serverlist_config, null);
});

test('enabled client-list configuration rejects missing fields before any database write', async () => {
  for (const broken of [{ ...publicConfig, host: '' }, { ...publicConfig, port: null }, { ...publicConfig, opensAt: '' }, { ...publicConfig, channelGroup: '' }]) {
    assert.equal((await post('/create', { server_id: 111, name: '测试区服', serverlist_config: broken })).status, 400);
    assert.equal((await post('/update?id=1', { serverlist_config: broken })).status, 400);
  }
  assert.equal(fixture.writes.length, 0);
});

test('generation uses saved public fields, excludes legacy NULL records, and ignores request paths and rows', async () => {
  fixture.rows = [
    { server_id: 5, name: '旧记录', webhost: 'http://inter-only.example.test:8111', is_active: 1, serverlist_config: null },
    { server_id: 111, name: '测试区服', webhost: 'http://private-inter.example.test:8111', dbuser: 'private-user', dbpass: 'private-db-password', is_active: 1, serverlist_config: publicConfig },
  ];
  const response = await post('/generate-serverlist?path=/tmp/unapproved', { path: '/etc/unapproved', rows: [] });
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.path, '/data/serverlist');
  assert.equal(result.count, 1);
  assert.ok(result.bytes > 0);
  assert.equal(fixture.queries, 1);
  assert.equal(fixture.files.length, 1);
  const payload = fixture.files[0];
  assert.equal(payload.worldList[0]._id, 111);
  assert.deepEqual(payload.worldList[0].game, { h: 'game.example.test', p: 8602 });
  for (const sensitive of ['private-inter', 'private-user', 'private-db-password', 'inter-only']) assert.equal(JSON.stringify(payload).includes(sensitive), false);
});

test('no eligible rows or invalid stored config never reaches the file writer', async () => {
  fixture.rows = [{ server_id: 5, name: '旧记录', is_active: 1, serverlist_config: null }];
  assert.equal((await (await post('/generate-serverlist', {})).json()).success, false);
  fixture.rows = [{ server_id: 111, name: '错误记录', is_active: 1, serverlist_config: { ...publicConfig, host: '' } }];
  assert.equal((await (await post('/generate-serverlist', {})).json()).success, false);
  assert.equal(fixture.files.length, 0);
});

test('file-system failure is reported without leaking raw database or operating-system details', async () => {
  fixture.rows = [{ server_id: 111, name: '测试区服', is_active: 1, serverlist_config: publicConfig }];
  fixture.fileError = Object.assign(new Error('private path and connection detail'), { code: 'EACCES' });
  const result = await (await post('/generate-serverlist', {})).json();
  assert.equal(result.success, false);
  assert.match(result.message, /\/data\/serverlist/);
  assert.equal(result.message.includes('private'), false);
  assert.equal(fixture.files.length, 0);
});

test('server model hydrates JSON strings and objects while preserving legacy NULL values', async () => {
  modelFixture.rows = [
    { id: 1, serverlist_config: JSON.stringify(publicConfig) },
    { id: 2, serverlist_config: publicConfig },
    { id: 3, serverlist_config: null },
  ];
  const rows = await serverModel.listAll();
  assert.deepEqual(rows.map(row => row.serverlist_config), [publicConfig, publicConfig, null]);
  assert.match(modelFixture.calls[0].query, /serverlist_config/);
});

test('server model writes client config as JSON once, including string input, and can clear it with SQL NULL', async () => {
  const row = { server_id: 111, name: '测试区服', webhost: '', dbip: '', bname: '', dbuser: '', dbpass: '' };
  await serverModel.createServer({ ...row, serverlist_config: JSON.stringify(publicConfig) });
  const insert = modelFixture.calls.find(call => call.query.startsWith('INSERT'));
  assert.deepEqual(JSON.parse(insert.values[7]), publicConfig);
  await serverModel.updateServer(1, { serverlist_config: publicConfig });
  const update = modelFixture.calls.find(call => call.query.startsWith('UPDATE'));
  assert.deepEqual(JSON.parse(update.values[0]), publicConfig);
  modelFixture.calls = [];
  await serverModel.updateServer(1, { serverlist_config: null });
  assert.equal(modelFixture.calls.find(call => call.query.startsWith('UPDATE')).values[0], null);
});

test('invalid world IDs and unsafe or old protocol endpoint URLs are rejected before writes', async () => {
  const valid = { server_id: 7, name: '测试区服', webhost: 'http://127.0.0.1:8311' };
  for (const server_id of [null, '', '01', 0, -1, 1.5, 2147483648, '1e3']) {
    assert.equal((await post('/create', { ...valid, server_id })).status, 400);
  }
  for (const webhost of ['ftp://127.0.0.1', 'http://name:password@127.0.0.1', 'http://127.0.0.1/script', 'http://127.0.0.1?code=unused', 'http://127.0.0.1/#ignored']) {
    assert.equal((await post('/create', { ...valid, webhost })).status, 400);
  }
  assert.equal(fixture.writes.length, 0);
});

test('partial edits preserve unspecified compatibility database fields and validate supplied IDs', async () => {
  assert.equal((await post('/update?id=1', { name: '区服改名' })).status, 200);
  assert.deepEqual(fixture.writes, [{ action: 'update', id: 1, value: { name: '区服改名' } }]);
  assert.equal((await post('/update?id=1', { server_id: null })).status, 400);
  assert.equal((await post('/remove?id=1.5', {})).status, 400);
  assert.equal(fixture.writes.length, 1);
});
