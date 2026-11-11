import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(directory, '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const esbuild = require('esbuild');
const { createApp, defineEventHandler, toNodeListener } = require('h3');
const source = await readFile(path.join(appRoot, 'server/utils/gmInterClient.ts'), 'utf8');
const compiled = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' }).code;
const { GmInterClient, normalizeWuid, buildMailMessage } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const A = '40763927194340500';
const B = '40763927194340501';
const SECRET = 'local-mock-secret-only';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

async function interServer(respond) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const form = Object.fromEntries(new URLSearchParams(body));
    requests.push({ path: req.url, contentType: req.headers['content-type'], form });
    const payload = await respond(req.url, form);
    if (payload === undefined) return;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  });
  const url = await listen(server);
  return { server, url, requests, client: new GmInterClient({ baseUrl: url, secret: SECRET }) };
}

test('WUID is an exact signed-64 string, never a rounded JS number', () => {
  assert.equal(normalizeWuid(A), A);
  assert.equal(normalizeWuid('9223372036854775807'), '9223372036854775807');
  for (const value of [Number(A), '9223372036854775808', '01', '0', '-1', '1e5', '1.2', null]) {
    assert.throws(() => normalizeWuid(value));
  }
});

test('mail attachments follow the game reward shape and leave expiry to the game server', () => {
  const mail = buildMailMessage(A, '补偿', '说明', [{ i: 90003, a: 100 }]);
  assert.equal(mail.u, A);
  assert.equal(Object.hasOwn(mail, 'd'), false);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(mail)), 'd'), false);
  assert.deepEqual(mail.i, [{ i: [{ i: 90003, a: 1, r: 100 }], a: 100, r: 100, t: 100 }]);
  assert.deepEqual([mail.c, mail.s, mail.t, mail.f.id], [4, 0, 21, 999]);
});

test('get_one uses form encoding and preserves the queried role ID', async () => {
  const mock = await interServer(() => ({ code: 200, result: { user: { _id: A, w: 7, n: '本地角色', teamlv: 32, vip: 3 } } }));
  try {
    const player = await mock.client.getPlayer(7, A);
    assert.deepEqual(player, { id: A, wuid: A, name: '本地角色', worldId: 7, level: 32, vipLevel: 3 });
    assert.equal(mock.requests[0].path, '/v2/Inter/User/get_one');
    assert.equal(mock.requests[0].contentType, 'application/x-www-form-urlencoded');
    assert.deepEqual(mock.requests[0].form, { w_id: '7', _id: A, code: SECRET });
  } finally { await close(mock.server); }
});

test('get_one rejects an imprecise numeric WUID or a response from another world', async () => {
  for (const user of [{ _id: Number(A), w: 7 }, { _id: A, w: 8 }]) {
    const mock = await interServer(() => ({ code: 200, result: { user } }));
    try { await assert.rejects(mock.client.getPlayer(7, A)); } finally { await close(mock.server); }
  }
});

test('top-level code=200 is insufficient; each target must appear in the success list', async () => {
  const mock = await interServer(() => ({ code: 200, result: {
    success_list: [{ w_id: 7, u: A }],
    err_list: [{ w_id: 7, u: B }],
    err_info_list: ['user not found'],
  } }));
  try {
    const result = await mock.client.sendMail(7, [A, B], '标题', '正文', []);
    assert.deepEqual(result.map(row => [row.playerId, row.success, row.status]), [[A, true, 'confirmed'], [B, false, 'failed']]);
    assert.equal(mock.requests.length, 1);
    const form = mock.requests[0].form;
    assert.equal(form.f_u64, '1');
    assert.deepEqual(JSON.parse(form.message_str).map(message => message.u), [A, B]);
  } finally { await close(mock.server); }
});

test('missing, conflicting, or unrelated acknowledgements are unknown, not success', async () => {
  const responses = [
    {},
    { success_list: [], err_list: [], err_info_list: [] },
    { success_list: [{ w_id: 7, u: A }], err_list: [{ w_id: 7, u: A }], err_info_list: [] },
    { success_list: [{ w_id: 7, u: B }], err_list: [], err_info_list: [] },
    { success_list: [{ w_id: 7, u: A }], err_list: [], err_info_list: ['unattributed error'] },
  ];
  for (const result of responses) {
    const mock = await interServer(() => ({ code: 200, result }));
    try {
      const rows = await mock.client.sendMail(7, [A], '标题', '正文', []);
      assert.equal(rows[0].success, false);
      assert.equal(rows[0].status, 'unknown');
      assert.match(rows[0].message, /勿直接重试/);
      assert.equal(mock.requests.length, 1);
    } finally { await close(mock.server); }
  }
});

test('a timed-out send is never retried automatically', async () => {
  const mock = await interServer(() => undefined);
  try {
    const client = new GmInterClient({ baseUrl: mock.url, secret: SECRET, timeoutMs: 50 });
    const rows = await client.sendMail(7, [A], '标题', '正文', []);
    assert.equal(rows[0].status, 'unknown');
    assert.equal(mock.requests.length, 1);
  } finally { await close(mock.server); }
});

const fixture = {
  admin: { id: 1, name: 'local-admin', level: 0, is_active: 1 },
  server: { server_id: 7, name: '本地区服', webhost: '', bname: '', is_active: 1 },
  logs: [],
  failLog: false,
};
globalThis.__gmBackendFixture = fixture;
const bundle = await esbuild.build({
  entryPoints: [path.join(appRoot, 'server/controller/gm.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20',
  external: ['h3'],
  plugins: [{ name: 'local-gm-models', setup(build) {
    const modules = {
      '../model/admin': 'export const getAdminWithPermissions = async () => globalThis.__gmBackendFixture.admin;',
      '../model/gameServers': 'export const listActive = async () => [globalThis.__gmBackendFixture.server]; export const getByIdentifier = async () => globalThis.__gmBackendFixture.server;',
      '../model/gmOperationLogs': 'export const insertGmOperationLog = async row => { if(globalThis.__gmBackendFixture.failLog) throw new Error("local log failure"); globalThis.__gmBackendFixture.logs.push(row); };',
      '../utils/auth': 'export const verifyAdminSession = cookie => cookie === "verified" ? {ok:true,adminId:1} : {ok:false};',
    };
    build.onResolve({ filter: /^\.\.\/(model\/(admin|gameServers|gmOperationLogs)|utils\/auth)$/ }, args => ({ path: args.path, namespace: 'local-gm-model' }));
    build.onLoad({ filter: /.*/, namespace: 'local-gm-model' }, args => ({ contents: modules[args.path], loader: 'js' }));
  } }],
});
const controllerFilename = path.join(appRoot, 'tests/.gm-controller-local.cjs');
const controllerModule = new Module(controllerFilename);
controllerModule.paths = Module._nodeModulePaths(appRoot);
controllerModule._compile(bundle.outputFiles[0].text, controllerFilename);
const controller = controllerModule.exports;

async function controllerServer(interResponse, userResponse) {
  const inter = await interServer((pathname, form) => pathname === '/v2/Inter/User/get_one'
    ? userResponse ? userResponse(form) : { code: 200, result: { user: { _id: form._id, w: 7, n: '本地校验角色' } } }
    : interResponse(pathname, form));
  fixture.server = { server_id: 7, name: '本地区服', webhost: inter.url, bname: '', is_active: 1 };
  fixture.admin = { id: 1, name: 'local-admin', level: 0, is_active: 1 };
  fixture.logs = [];
  fixture.failLog = false;
  process.env.GM_INTER_SECRET = SECRET;
  const app = createApp();
  app.use(defineEventHandler(event => {
    const pathname = new URL(event.node.req.url, 'http://localhost').pathname;
    if (pathname === '/servers') return controller.getServers(event);
    if (pathname === '/players') return controller.getPlayers(event);
    if (pathname === '/items') return controller.getItems(event);
    if (pathname === '/mail') return controller.sendMail(event);
    if (pathname === '/batch') return controller.sendItemsBatch(event);
    throw new Error('Unexpected local test route');
  }));
  const server = createServer(toNodeListener(app));
  return { inter, server, url: await listen(server), close: async () => { await close(server); await close(inter.server); } };
}

const headers = { Cookie: 'admin_sid=verified', 'Content-Type': 'application/json' };
const mail = { server: '7', playerId: A, title: '本地验证', content: '只发给mock接口', items: [{ i: 90003, a: 10 }] };

test('GM permission requires a signed active level-zero session; a numeric header is not authentication', async () => {
  const local = await controllerServer(() => ({ code: 200 }));
  try {
    assert.equal((await fetch(local.url + '/servers', { headers: { authorization: '1' } })).status, 401);
    fixture.admin.level = 1;
    assert.equal((await fetch(local.url + '/servers', { headers })).status, 403);
    fixture.admin.level = 0;
    fixture.admin.is_active = 0;
    assert.equal((await fetch(local.url + '/servers', { headers })).status, 403);
    assert.equal(local.inter.requests.length, 0);
  } finally { await local.close(); }
});

test('world IDs work without a legacy MySQL bname and invalid mail never reaches the game', async () => {
  const local = await controllerServer(() => ({ code: 200 }));
  try {
    const servers = await (await fetch(local.url + '/servers', { headers })).json();
    assert.equal(servers.data[0].identifier, '7');
    for (const bad of [
      { ...mail, playerId: Number(A) },
      { ...mail, items: [{ i: 999999999999, a: 1 }] },
      { ...mail, items: Array.from({ length: 7 }, () => ({ i: 90003, a: 1 })) },
    ]) {
      assert.equal((await fetch(local.url + '/mail', { method: 'POST', headers, body: JSON.stringify(bad) })).status, 400);
    }
    assert.equal(local.inter.requests.length, 0);
  } finally { await local.close(); }
});

test('batch response and audit log preserve partial success, deduplicate recipients, and redact the inter secret', async () => {
  const local = await controllerServer(() => ({ code: 200, result: { success_list: [{ w_id: 7, u: A }], err_list: [{ w_id: 7, u: B }], err_info_list: ['not found'] } }));
  try {
    const response = await fetch(local.url + '/batch', { method: 'POST', headers, body: JSON.stringify({ ...mail, players: [{ playerId: A }, { playerId: B }, { playerId: A }] }) });
    const result = await response.json();
    assert.equal(result.success, false);
    assert.deepEqual([result.data.total, result.data.successCount, result.data.failedCount], [2, 1, 1]);
    assert.deepEqual(fixture.logs.map(row => [row.player_id, row.success]), [[A, 1], [B, 0]]);
    assert.equal(fixture.logs[0].request_params.protocol, 'new_gmtools');
    assert.equal(fixture.logs[0].request_params.item_names['90003'], '贝里');
    assert.equal(local.inter.requests.filter(request => request.path === '/v2/Inter/Message/add_message_list').length, 1);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
    assert.equal(JSON.stringify(fixture.logs).includes(SECRET), false);
  } finally { await local.close(); }
});

test('a failed audit write does not falsely report a confirmed reward as unsent', async () => {
  const local = await controllerServer(() => ({ code: 200, result: { success_list: [{ w_id: 7, u: A }], err_list: [], err_info_list: [] } }));
  fixture.failLog = true;
  try {
    const result = await (await fetch(local.url + '/mail', { method: 'POST', headers, body: JSON.stringify(mail) })).json();
    assert.equal(result.success, true);
    assert.equal(result.data.auditWarning, true);
    assert.equal(result.data.results[0].status, 'confirmed');
    assert.equal(local.inter.requests.filter(request => request.path === '/v2/Inter/Message/add_message_list').length, 1);
  } finally { await local.close(); }
});

test('preflight world mismatch prevents sending to a wrong-world WUID, including merged servers', async () => {
  const local = await controllerServer(
    () => ({ code: 200, result: { success_list: [{ w_id: 7, u: A }], err_list: [], err_info_list: [] } }),
    form => ({ code: 200, result: { user: { _id: form._id, w: form._id === B ? 8 : 7, n: '本地校验角色' } } }),
  );
  try {
    const result = await (await fetch(local.url + '/batch', { method: 'POST', headers, body: JSON.stringify({ ...mail, players: [{ playerId: A }, { playerId: B }] }) })).json();
    assert.equal(result.success, false);
    assert.equal(result.data.results[0].status, 'confirmed');
    assert.equal(result.data.results[1].status, 'failed');
    assert.match(result.data.results[1].message, /本次未发送/);
    const sent = local.inter.requests.filter(request => request.path === '/v2/Inter/Message/add_message_list');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0].form.message_str).map(row => row.u), [A]);
  } finally { await local.close(); }
});

test('failed read-only role preflight is definitely unsent, not an ambiguous write failure', async () => {
  const local = await controllerServer(() => { throw new Error('Mail must not be called'); }, () => ({ code: 403 }));
  try {
    const result = await (await fetch(local.url + '/mail', { method: 'POST', headers, body: JSON.stringify(mail) })).json();
    assert.equal(result.success, false);
    assert.equal(result.data.results[0].status, 'failed');
    assert.match(result.data.results[0].message, /本次未发送/);
    assert.equal(local.inter.requests.filter(request => request.path === '/v2/Inter/Message/add_message_list').length, 0);
  } finally { await local.close(); }
});
