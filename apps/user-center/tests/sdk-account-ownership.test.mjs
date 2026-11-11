import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { runInNewContext } from 'node:vm';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const ts = require('typescript');
const h3 = require('h3');
const sources = Object.fromEntries(await Promise.all([
  'server/utils/sdkGameAuth.ts',
  'server/utils/sdkSign.ts',
  'server/controller/user.ts',
  'server/routes/sdkapi/[...].ts',
  '../../packages/shared/server/utils/loginResponseLog.ts',
].map(async file => {
  const { outputText, diagnostics } = ts.transpileModule(await readFile(path.join(appRoot, file), 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(diagnostics, []);
  return [path.basename(file), outputText];
})));

const environment = 'local-fixture';
const sdkSecret = 'local-sdk-request-signing-secret';
const legacySecret = 'local-legacy-subaccount-secret';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const accounts = [
  { id: 7, username: 'owner-fixture', password: 'owner-fixture-password', status: 0 },
  { id: 8, username: 'other-fixture', password: 'other-fixture-password', status: 0 },
];
const subAccounts = [
  { id: 41, username: 'first', parent_user_id: 7 },
  { id: '9007199254740993', username: 'second', parent_user_id: 7 },
  { id: 99, username: 'other', parent_user_id: 8 },
];

function fixture() {
  const state = {
    users: accounts.map(account => ({ ...account })),
    logs: [],
    sessions: new Map(),
    redisReads: 0,
    listedParents: [],
    signAttempts: 0,
    now: 1784800000000,
    failRedis: false,
    failSignOn: 0,
  };
  const captureLog = (...args) => state.logs.push(inspect(args, { depth: 8 }));
  const env = {
    SDK_GAME_TICKET_ENVIRONMENT: environment,
    SDK_GAME_TICKET_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  function load(name, dependencies) {
    const module = { exports: {} };
    runInNewContext(sources[name], {
      Buffer,
      URL,
      URLSearchParams,
      Date: class extends Date { static now() { return state.now; } },
      process: { env },
      console: { info: captureLog, log: captureLog, warn: captureLog, error: captureLog },
      defineEventHandler: h3.defineEventHandler,
      createError: h3.createError,
      getMethod: h3.getMethod,
      getRequestURL: h3.getRequestURL,
      readBody: h3.readBody,
      module,
      exports: module.exports,
      require(dependency) {
        if (dependency === 'h3') return h3;
        if (!Object.hasOwn(dependencies, dependency)) throw new Error(`Unexpected fixture dependency: ${dependency}`);
        return dependencies[dependency];
      },
    }, { filename: name });
    return module.exports;
  }

  const redis = {
    async set(key, value, mode, ttl, guard) {
      assert.equal(mode, 'EX');
      assert.equal(guard, 'NX');
      assert.equal(ttl, 900);
      assert.match(key, /^sdk:game-session:local-fixture:[a-f0-9]{64}$/);
      if (state.sessions.has(key)) return null;
      state.sessions.set(key, { value, expiresAt: state.now + ttl * 1000 });
      return 'OK';
    },
    async get(key) {
      state.redisReads += 1;
      if (state.failRedis) throw new Error('fixture Redis failure');
      const session = state.sessions.get(key);
      return session && session.expiresAt > state.now ? session.value : null;
    },
  };
  const sdkGameAuth = load('sdkGameAuth.ts', {
    'node:crypto': {
      ...crypto,
      sign(...args) {
        state.signAttempts += 1;
        if (state.signAttempts === state.failSignOn) throw new Error('fixture signer failure');
        return crypto.sign(...args);
      },
    },
    './redis-cluster': { getRedisCluster: () => redis },
  });
  const systemConfig = { getSystemParam: async () => sdkSecret };
  const sdkSign = load('sdkSign.ts', { crypto, './systemConfig': systemConfig });
  const rateLimit = {
    checkLoginLimits: async () => ({ locked: false }),
    recordLoginFailure: async () => {},
    recordLoginSuccess: async () => {},
  };
  const requestIp = { getRequestClientIp: () => '127.0.0.1' };
  const i18n = {
    sdkMessages: {
      login: {
        success: () => 'ok',
        invalidCredentials: () => 'credentials rejected',
        failed: () => 'login failed',
        systemError: () => 'system error',
      },
    },
  };
  const listByParent = async userId => {
    state.listedParents.push(userId);
    return subAccounts.filter(account => account.parent_user_id === userId);
  };
  const controller = load('user.ts', {
    '../model/user': {},
    '../model/admin': {},
    '../model/apis': {},
    '../model/payment': {},
    '../model/subUsers': { findByParentUserId: listByParent },
    '../model/userLoginLogs': { recordLogin: async () => {} },
    '../utils/auth': {},
    '../utils/gameIp': { selectGameIpByAmount: () => '127.0.0.1' },
    '../utils/i18n': i18n,
    '../utils/loginRateLimit': rateLimit,
    '../utils/redis-cluster': { getRedisCluster: () => redis },
    '../utils/requestIp': requestIp,
    '../utils/sdkGameAuth': sdkGameAuth,
    '../utils/systemConfig': systemConfig,
    '../config': { config: { thirdPartyConfig: { accessKey: legacySecret } } },
    '../db': {
      async sql({ query, values }) {
        if (query.includes('FROM PaymentRecords')) return [{ total: 0 }];
        if (query.includes('FROM SubUsers s JOIN Users u')) {
          const owner = state.users.find(user => user.id === values[1]);
          const subAccount = subAccounts.find(sub => String(sub.id) === values[0] && sub.parent_user_id === owner?.id);
          return subAccount ? [{ subAccountId: String(subAccount.id), status: owner.status }] : [];
        }
        if (query.includes('FROM Users WHERE username')) {
          return state.users.filter(user => user.username === values[0] && (values.length === 1 || values[1] === user.password));
        }
        if (query.includes('FROM Users WHERE id = ? AND username = ?')) {
          return state.users.filter(user => user.id === values[0] && user.username === values[1]);
        }
        throw new Error('Unexpected fixture SQL');
      },
    },
    './payment': { generateUserLoginUrl: async () => '' },
    '@quantum/shared/server/utils/jwt': {},
    '@quantum/shared/server/utils/userAutoLogin': {},
    crypto,
  });
  const route = load('[...].ts', {
    '../../utils/sdkSign': sdkSign,
    '../../utils/i18n': i18n,
    '../../utils/loginRateLimit': rateLimit,
    '../../utils/requestIp': requestIp,
    '../../controller/user': controller,
    '../../controller/admin': {},
    '../../controller/paymentSettings': {},
    '../../controller/payment': {},
    '@quantum/shared/server/utils/loginResponseLog': load('loginResponseLog.ts', {}),
    uuid: { v4: crypto.randomUUID },
  });
  const app = h3.createApp().use(route.default);
  const handle = h3.toWebHandler(app);

  function signRequest(body) {
    return { ...body, sign: sdkSign.computeSdkSign(body, sdkSecret) };
  }

  async function post(routeName, body, { signed = true, session } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (session) headers.Authorization = `Bearer ${session}`;
    const payload = signed ? signRequest(body) : body;
    const response = await handle(new Request(`http://localhost/sdkapi/login/${routeName}`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    }));
    return { status: response.status, headers: response.headers, body: await response.json() };
  }

  async function login() {
    const { username, password } = state.users[0];
    const result = await post('dologin', { z: username, b: password, d: 'op', game_login_proof: '1' });
    assert.equal(result.status, 200);
    assert.equal(result.body.z, 1);
    assert.match(result.body.sdk_session, /^[a-f0-9]{64}$/);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    return result.body.sdk_session;
  }

  return { state, post, login, signRequest };
}

function assertProof(proof, expectedSubject, now, audience = 'op-sdk-ownership') {
  assert.match(proof, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const [header, payload, signature] = proof.split('.');
  const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT' });
  assert.equal(crypto.verify(
    'RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'),
  ), true);
  const claims = decode(payload);
  assert.deepEqual(claims, {
    iss: 'oph-sdk', aud: audience, env: environment, sub: expectedSubject,
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 60, jti: claims.jti,
  });
  assert.match(claims.sub, /^[1-9][0-9]*$/);
  assert.match(claims.jti, /^[a-f0-9]{32}$/);
  return claims;
}

function assertListFailure(result) {
  assert.equal(result.status, 200);
  assert.equal(result.body.code, '0');
  assert.deepEqual(result.body.data, []);
  assert.equal(result.headers.get('cache-control'), 'no-store');
}

test('signed xiaohao without sdk_session retains the full legacy response', async () => {
  const { state, post } = fixture();
  const result = await post('xiaohao', { z: accounts[0].username, c: '1' });
  const loginTime = Math.floor(state.now / 1000);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    code: '1',
    data: subAccounts.filter(sub => sub.parent_user_id === 7).map(sub => ({
      username: String(sub.id),
      nickname: sub.username,
      login_time: loginTime,
      sign: crypto.createHash('md5').update(`${sub.id}${loginTime}${legacySecret}`).digest('hex'),
    })),
    msg: '查询成功', djq: null, ttb: null, discount: null, flb: 0,
  });
  assert.equal(state.redisReads, 0);
  assert.equal(state.signAttempts, 0);
});

test('dologin issues a session only with an authenticated, signed string opt-in for OP', async () => {
  const { state, post, login, signRequest } = fixture();
  const { username, password } = accounts[0];
  const legacyLogin = { z: username, b: password, d: 'op' };
  const optIn = { ...legacyLogin, game_login_proof: '1' };

  for (const body of [
    legacyLogin,
    { ...optIn, game_login_proof: 1 },
    { ...optIn, game_login_proof: '0' },
    { ...optIn, d: 'another-game' },
  ]) {
    const result = await post('dologin', body);
    assert.equal(result.status, 200);
    assert.equal(result.body.z, 1);
    assert.equal(Object.hasOwn(result.body, 'sdk_session'), false);
  }
  for (const body of [optIn, { ...signRequest(legacyLogin), game_login_proof: '1' }]) {
    const result = await post('dologin', body, { signed: false });
    assert.equal(result.body.z, -1);
    assert.equal(result.body.x, '签名无效');
    assert.equal(Object.hasOwn(result.body, 'sdk_session'), false);
  }
  const rejected = await post('dologin', { ...optIn, b: 'wrong-fixture-password' });
  assert.equal(rejected.body.z, -1);
  assert.equal(rejected.body.x, 'credentials rejected');
  assert.equal(Object.hasOwn(rejected.body, 'sdk_session'), false);
  assert.equal(state.sessions.size, 0);

  await login();
  assert.equal(state.sessions.size, 1);
});

test('dologin session issues a distinct ownership proof for each owned subaccount and keeps game tickets separate', async () => {
  const { state, post, login } = fixture();
  const session = await login();
  const result = await post('xiaohao', { z: accounts[0].username, c: '1', sdk_session: session });
  assert.equal(result.status, 200);
  assert.equal(result.body.code, '1');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.body.data.map(row => row.username), ['41', '9007199254740993']);
  const proofs = result.body.data.map(row => row.gameLoginProof);
  const [first, second] = result.body.data.map(row => {
    assert.match(row.sign, /^[a-f0-9]{32}$/);
    return assertProof(row.gameLoginProof, row.username, state.now);
  });
  assert.notEqual(first.jti, second.jti);

  const ticket = await post('gameTicket', { subAccountId: '41' }, { signed: false, session });
  assert.equal(ticket.status, 200);
  assert.equal(ticket.body.code, 1);
  assertProof(ticket.body.ticket, '41', state.now, 'op');

  const logs = state.logs.join('\n');
  for (const secret of [session, ticket.body.ticket, ...proofs]) {
    assert.equal(logs.includes(secret), false, 'route and controller logs must omit credentials');
  }
});

test('xiaohao fails closed for malformed, expired, mismatched and banned sessions', async () => {
  const { state, post, login } = fixture();
  const session = await login();
  for (const token of ['', null, 17, 'invalid-session-fixture', '0'.repeat(64)]) {
    assertListFailure(await post('xiaohao', { z: accounts[0].username, sdk_session: token }));
  }
  assertListFailure(await post('xiaohao', { z: accounts[1].username, sdk_session: session }));
  state.users[0].status = 1;
  assertListFailure(await post('xiaohao', { z: accounts[0].username, sdk_session: session }));
  state.users[0].status = 0;
  state.now += 901 * 1000;
  assertListFailure(await post('xiaohao', { z: accounts[0].username, sdk_session: session }));
  assert.deepEqual(state.listedParents, []);
  assert.equal(state.signAttempts, 0);
  assert.equal(state.logs.join('\n').includes(session), false);
  assert.equal(state.logs.join('\n').includes('invalid-session-fixture'), false);
});

test('Redis or a later proof signing failure returns no list or partial proof', async () => {
  const { state, post, login } = fixture();
  const session = await login();
  const list = () => post('xiaohao', { z: accounts[0].username, sdk_session: session });
  state.failRedis = true;
  assertListFailure(await list());
  assert.equal(state.signAttempts, 0);
  state.failRedis = false;
  state.failSignOn = 2;
  assertListFailure(await list());
  assert.equal(state.signAttempts, 2);
  assert.equal(state.logs.join('\n').includes(session), false);
});
