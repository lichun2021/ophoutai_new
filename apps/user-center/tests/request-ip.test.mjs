import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire, Module } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const esbuild = require('esbuild');
const { createApp, defineEventHandler, toNodeListener } = require('h3');

function cjsModule(code, filename) {
  const mod = new Module(filename);
  mod.paths = Module._nodeModulePaths(appRoot);
  mod._compile(code, filename);
  return mod.exports;
}

const ipSource = await readFile(path.join(appRoot, 'server/utils/requestIp.ts'), 'utf8');
const helper = cjsModule(esbuild.transformSync(ipSource, { loader: 'ts', format: 'cjs' }).code, path.join(appRoot, 'tests/.local-request-ip.cjs'));
const event = (peer, headers = {}) => ({ node: { req: { socket: { remoteAddress: peer }, headers } } });
const oldTrusted = process.env.TRUSTED_PROXY_IPS;
test.afterEach(() => {
  if (oldTrusted === undefined) delete process.env.TRUSTED_PROXY_IPS;
  else process.env.TRUSTED_PROXY_IPS = oldTrusted;
});

test('direct public connections use the TCP peer and ignore forged forwarding headers', () => {
  delete process.env.TRUSTED_PROXY_IPS;
  assert.equal(helper.getRequestClientIp(event('203.0.113.20', {
    'ali-cdn-real-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2', 'x-real-ip': '198.51.100.3',
  })), '203.0.113.20');
});

test('IPv4-mapped IPv6 sockets and plain IPv6 addresses are normalized consistently', () => {
  for (const [peer, expected] of [
    ['::ffff:203.0.113.20', '203.0.113.20'],
    ['0:0:0:0:0:ffff:cb00:7114', '203.0.113.20'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
  ]) assert.equal(helper.getRequestClientIp(event(peer)), expected);
});

test('only loopback or configured exact proxy peers can supply validated forwarding addresses', () => {
  process.env.TRUSTED_PROXY_IPS = '192.0.2.10, 2001:db8::10, invalid';
  assert.equal(helper.getRequestClientIp(event('::1', { 'ali-cdn-real-ip': '203.0.113.1' })), '203.0.113.1');
  assert.equal(helper.getRequestClientIp(event('192.0.2.10', { 'x-real-ip': '203.0.113.2' })), '203.0.113.2');
  assert.equal(helper.getRequestClientIp(event('2001:0db8::10', { 'x-real-ip': '2001:db8::20' })), '2001:db8::20');
  assert.equal(helper.getRequestClientIp(event('192.0.2.11', { 'x-real-ip': '203.0.113.2' })), '192.0.2.11');
});

test('forwarded chains are read from the trusted end rather than a spoofable first entry', () => {
  process.env.TRUSTED_PROXY_IPS = '192.0.2.10';
  assert.equal(helper.getRequestClientIp(event('127.0.0.1', { 'x-forwarded-for': '198.51.100.99, 203.0.113.2, 192.0.2.10' })), '203.0.113.2');
});

test('missing or malformed peers never become a client-supplied IP', () => {
  for (const peer of [undefined, '', 'not-an-ip']) {
    assert.equal(helper.getRequestClientIp(event(peer, { 'x-real-ip': '203.0.113.1' })), 'unknown');
  }
  assert.equal(helper.getRequestClientIp(event('127.0.0.1', { 'ali-cdn-real-ip': 'bad', 'x-forwarded-for': 'bad', 'x-real-ip': 'bad' })), '127.0.0.1');
});

const fixture = { rows: [], quota: 0, quotaIps: [] };
globalThis.__registrationIpFixture = fixture;
const mocks = {
  '../model/user': `export const ensureRegisterIpColumn=async()=>{};
    export const findByThirdpartyUid=async()=>null;
    export const insert=async value=>{globalThis.__registrationIpFixture.rows.push(value);return {insertId:1};};`,
  '../db': `export async function sql({query,values}) {
    const f=globalThis.__registrationIpFixture;
    if(query.includes('COUNT(*) AS cnt')) {f.quotaIps.push(values[0]);return [{cnt:f.quota}];}
    if(query.includes('FROM Users WHERE username'))return [];
    if(query.includes('FROM Admins')||query.includes('FROM Games'))return [{id:1}];
    throw new Error('Unexpected local test SQL');
  }`,
  '../config': 'export const config={};',
  '../utils/systemConfig': 'export const getSystemParam=async()=>"";',
  '../utils/redis-cluster': 'export const getRedisCluster=()=>{throw new Error("No Redis calls expected in registration controller test");};',
  '../utils/i18n': 'export const sdkMessages={};',
  '../utils/gameIp': 'export const selectGameIpByAmount=()=>"127.0.0.1";',
  '../utils/loginRateLimit': 'export const recordLoginFailure=async()=>{}; export const recordLoginSuccess=async()=>{};',
  './payment': 'export const generateUserLoginUrl=async()=>"";',
  '@quantum/shared/server/utils/jwt': 'export const signJWT=()=>"local-only";export const setAuthCookie=()=>{};',
};
const controllerPath = path.join(appRoot, 'server/controller/user.ts');
const bundle = await esbuild.build({
  entryPoints: [controllerPath], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', external: ['h3'],
  plugins: [{ name: 'local-registration-models', setup(build) {
    build.onResolve({ filter: /^(\.\.\/model\/|\.\.\/utils\/auth$)/ }, args => ({ path: args.path, namespace: 'local-model' }));
    build.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'local-model' } : null);
    build.onLoad({ filter: /.*/, namespace: 'local-model' }, args => ({ contents: mocks[args.path] || 'export {};', loader: 'js' }));
    build.onLoad({ filter: /server\/controller\/user\.ts$/ }, async args => ({
      contents: 'import {readBody,createError,defineEventHandler} from "h3";\n' + await readFile(args.path, 'utf8'), loader: 'ts',
    }));
  } }],
});
const controller = cjsModule(bundle.outputFiles[0].text, path.join(appRoot, 'tests/.local-registration-controller.cjs'));

async function registrationServer() {
  const app = createApp();
  app.use(defineEventHandler(controller.register));
  const server = createServer(toNodeListener(app));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

test('registration controller accepts a direct socket IP without proxy headers and stores the same IP', async () => {
  fixture.rows = []; fixture.quota = 0; fixture.quotaIps = [];
  const local = await registrationServer();
  try {
    const response = await fetch(local.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'local-registration-check', password: 'local-only', channel_code: 'admin', game_code: 'op' }) });
    assert.equal((await response.json()).status, 'success');
    assert.deepEqual(fixture.quotaIps, ['127.0.0.1']);
    assert.equal(fixture.rows.length, 1);
    assert.equal(fixture.rows[0].register_ip, '127.0.0.1');
  } finally { await local.close(); }
});

test('the existing per-IP registration count limit still blocks a direct connection at its quota', async () => {
  fixture.rows = []; fixture.quota = 10; fixture.quotaIps = [];
  const local = await registrationServer();
  try {
    const response = await fetch(local.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'local-registration-quota', password: 'local-only', channel_code: 'admin', game_code: 'op' }) });
    assert.equal((await response.json()).status, 'fail');
    assert.deepEqual(fixture.quotaIps, ['127.0.0.1']);
    assert.equal(fixture.rows.length, 0);
  } finally { await local.close(); }
});

test.after(() => { delete globalThis.__registrationIpFixture; });
