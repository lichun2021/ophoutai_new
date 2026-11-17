import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as net from 'node:net';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const h3 = require('h3');
const sources = Object.fromEntries(await Promise.all(Object.entries({
  payment: '../server/controller/payment.ts',
  auth: '../../../packages/shared/server/utils/opSdkPtb.ts',
  inter: '../server/utils/opPaymentInter.ts',
  ledger: '../server/model/opSdkPtbPayment.ts',
}).map(async ([name, path]) => {
  const { outputText, diagnostics } = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(diagnostics, []);
  return [name, outputText];
})));

const NOW = 1_794_902_400;
const BASE_URL = 'http://192.168.123.1:8111';
const QUOTE_URL = `${BASE_URL}/v2/Inter/Payment/order`;
const ACK_URL = `${BASE_URL}/v2/Inter/done_pay_tranid`;
const INTER_SECRET = 'fixture-inter-secret';
const USER_ID = 7;
const orderId = '098f26b4-cb56-11f1-ae11-884949c4244b';
const wuid = '40763927194340500';
const checkout = { z: 'ptb', j: 'op', os: 'an', xx: orderId, x: wuid, f: 'fixture-account', tr: '17', h: '111', k: 'example.fixture.product', p: '10.00' };
const quote = {
  id: orderId, worldId: 111, wuid, sku: checkout.k, subAccountId: '17', amountMinor: 1000,
  currency: 'CNY', expiresAt: NOW + 60, status: 'created',
};
const receipt = { id: orderId, worldId: 111, wuid, sku: checkout.k, amountMinor: 1000,
  currency: 'CNY', paymentId: 'ptb:91', paidAt: NOW };

function fixture() {
  const env = {
    JWT_SECRET: 'local-only-fixture-signer', GM_INTER_BASE_URL: BASE_URL,
    GM_INTER_SECRET: INTER_SECRET, OP_SDK_PAYMENT_ORDER_URL: QUOTE_URL,
  };
  const state = { events: [], quotes: [], callbacks: [], quote, callbackStatus: 'paid', payment: null, balanceMinor: 3000,
    debitRejection: null, onQuote: null, ledgerUnavailable: false, ledgerConflict: false };
  async function request(url, options) {
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const fields = Object.fromEntries(options.body);
    assert.equal(fields.code, INTER_SECRET);
    if (url === QUOTE_URL) {
      state.events.push('quote');
      state.quotes.push(fields);
      state.onQuote?.();
      return Response.json({ code: 200, result: { order: state.quote } });
    }
    assert.equal(url, ACK_URL);
    state.events.push('callback');
    state.callbacks.push(fields);
    if (state.callbackStatus === null) throw new Error('simulated response loss after upstream processing');
    return Response.json({ code: 200, result: { status: state.callbackStatus } });
  }
  function load(name, dependencies) {
    const module = { exports: {} };
    runInNewContext(sources[name], {
      module, exports: module.exports, Buffer, URL, URLSearchParams, AbortSignal,
      process: { env }, fetch: request, console,
      Date: class extends Date { static now() { return NOW * 1000; } },
      readBody: h3.readBody, defineEventHandler: h3.defineEventHandler,
      require(dependency) {
        if (dependency === 'h3') return h3;
        assert(Object.hasOwn(dependencies, dependency), `Unexpected live dependency: ${dependency}`);
        return dependencies[dependency];
      },
    }, { filename: `${name}.ts` });
    return module.exports;
  }

  const auth = load('auth', { 'node:crypto': crypto });
  const inter = load('inter', { 'node:net': net });
  const { OpSdkPtbOrderRejectedError } = load('ledger', { '../db': {} });
  const payment = load('payment', {
    '../model/payment': {
      async detailByMchOrderId(id) {
        if (!state.payment || state.payment.receipt.id !== id) return null;
        return { payment_status: state.payment.confirmed ? 3 : 1, amount: '10.00' };
      },
    },
    '../model/externalGiftPackage': {}, '../model/paymentSettings': {}, '../model/admin': {}, '../model/user': {},
    '../db': {}, '../utils/redis-cluster': {}, '../utils/systemConfig': {}, '../model/gameCharacters': {},
    '../utils/paymentGateways': {}, '@quantum/shared/server/utils/userAutoLogin': {},
    '../model/gameServers': { async getByWorldId() { state.events.push('world'); return { is_active: 1 }; } },
    '@quantum/shared/server/utils/opSdkPtb': auth,
    '../utils/opPaymentInter': inter,
    '../model/opSdkPtbPayment': {
      OpSdkPtbOrderRejectedError,
      async findOpSdkPtbPayment(order) {
        state.events.push('ledger');
        assert.equal(order.id, orderId);
        if (state.ledgerUnavailable) throw new Error('simulated ledger read failure');
        if (state.ledgerConflict) throw new OpSdkPtbOrderRejectedError('OP 平台币订单与现有账本不匹配');
        return state.payment;
      },
      async debitOpSdkPtbPayment(order, expiresAt) {
        state.events.push('debit');
        assert.equal(state.payment, null);
        assert.equal(order.userId, USER_ID);
        assert.equal(order.amountMinor, 1000);
        assert.equal(expiresAt, quote.expiresAt);
        if (state.debitRejection) throw new OpSdkPtbOrderRejectedError(state.debitRejection);
        state.balanceMinor -= order.amountMinor;
        state.payment = { receipt, confirmed: false };
        return state.payment;
      },
      async confirmOpSdkPtbPayment(committed) {
        state.events.push('confirm');
        assert.equal(committed, state.payment);
        committed.confirmed = true;
      },
    },
    crypto,
  });
  const app = h3.createApp().use(h3.createRouter()
    .post('/sdkapi/Unipay/pay', h3.defineEventHandler(payment.doPayment))
    .post('/sdkapi/game/order', payment.getGameOrder));
  const handle = h3.toWebHandler(app);
  const token = auth.signOpSdkPtb(auth.parseOpSdkPtb(checkout), USER_ID);

  async function post(path, body, authorization) {
    const headers = { 'Content-Type': 'application/json' };
    if (authorization) headers['x-op-sdk-ptb-auth'] = authorization;
    const result = await handle(new Request(`http://localhost${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
    assert.equal(result.status, 200);
    return result.json();
  }
  return {
    state, env, token,
    pay: (body = checkout, authorization = token) => post('/sdkapi/Unipay/pay', body, authorization),
    status: () => post('/sdkapi/game/order', { oid: orderId }),
  };
}

test('the OP SDK payment cannot debit without valid order-bound authorization', async () => {
  const { pay, state, token } = fixture();
  assert.equal((await pay(checkout, null)).code, -1);
  assert.equal((await pay({ ...checkout, x: '40763927194340501' }, token)).code, -1);
  assert.equal((await pay({ ...checkout, xx: 'invalid-original-order' }, token)).code, -1);
  assert.deepEqual(state.events, []);
  assert.equal(state.balanceMinor, 3000);
});

test('missing, changed, or expired game quotes fail before any debit', async () => {
  const { pay, state, env } = fixture();
  delete env.OP_SDK_PAYMENT_ORDER_URL;
  assert.equal((await pay()).code, -1);
  assert.deepEqual(state.events, ['ledger', 'world', 'ledger']);
  env.OP_SDK_PAYMENT_ORDER_URL = QUOTE_URL;

  for (const invalid of [null, { ...quote, subAccountId: '18' }, { ...quote, sku: 'other.product' },
    { ...quote, amountMinor: 999 }, { ...quote, status: 'paid' }, { ...quote, expiresAt: NOW - 1 }]) {
    state.events.length = 0;
    state.quote = invalid;
    assert.equal((await pay()).code, -1);
    const events = ['ledger', 'world', 'quote'];
    if (!invalid || invalid.status !== 'created' || invalid.expiresAt <= NOW) events.push('ledger');
    assert.deepEqual(state.events, events);
  }
  assert.equal(state.balanceMinor, 3000);
  assert.equal(state.payment, null);
  assert.equal(state.callbacks.length, 0);
});

test('the confirmed OP receipt marks the original order successful after a single debit', async () => {
  const { pay, status, state } = fixture();
  assert.equal((await status()).code, 0);
  assert.equal((await pay()).code, 1);
  assert.deepEqual(state.events, ['ledger', 'world', 'quote', 'debit', 'callback', 'confirm']);
  assert.deepEqual(state.quotes, [{ id: orderId, worldId: '111', wuid, code: INTER_SECRET }]);
  assert.deepEqual(state.callbacks, [{ ...receipt, worldId: '111', amountMinor: '1000', paidAt: String(NOW), code: INTER_SECRET }]);
  assert.equal(state.balanceMinor, 2000);
  assert.equal((await status()).code, 1);
});

test('known ledger and debit rejections return a failure immediately', async () => {
  const { pay, state } = fixture();
  state.ledgerConflict = true;
  assert.deepEqual(await pay(), { code: -1, msg: 'OP 平台币订单与现有账本不匹配', data: null });
  state.ledgerConflict = false;
  for (const reason of ['游戏订单已过期，请重新下单', '小号不属于当前支付账号']) {
    state.debitRejection = reason;
    assert.deepEqual(await pay(), { code: -1, msg: reason, data: null });
  }
  assert.equal(state.balanceMinor, 3000);
  assert.equal(state.payment, null);
  assert.equal(state.callbacks.length, 0);
});

test('a concurrent debit is recovered when the game no longer returns a created quote', async () => {
  for (const confirmed of [false, true]) {
    const { pay, state } = fixture();
    state.quote = { ...quote, status: 'paid' };
    state.onQuote = () => {
      state.payment = { receipt, confirmed };
      state.balanceMinor -= receipt.amountMinor;
    };

    assert.equal((await pay()).code, 1);
    const events = ['ledger', 'world', 'quote', 'ledger'];
    if (!confirmed) events.push('callback', 'confirm');
    assert.deepEqual(state.events, events);
    assert.equal(state.balanceMinor, 2000);
    assert.equal(state.payment.confirmed, true);
    if (!confirmed) {
      assert.deepEqual(state.callbacks, [{ ...receipt, worldId: '111', amountMinor: '1000', paidAt: String(NOW), code: INTER_SECRET }]);
    }
  }
});

test('an unavailable ledger returns pending before or after an inconclusive quote', async () => {
  const initial = fixture();
  initial.state.ledgerUnavailable = true;
  assert.equal((await initial.pay()).checkout_state, 'processing');
  assert.deepEqual(initial.state.events, ['ledger']);

  const repeat = fixture();
  repeat.state.quote = null;
  repeat.state.onQuote = () => { repeat.state.ledgerUnavailable = true; };
  assert.equal((await repeat.pay()).checkout_state, 'processing');
  assert.deepEqual(repeat.state.events, ['ledger', 'world', 'quote', 'ledger']);
  assert.equal(repeat.state.callbacks.length, 0);
});

test('an uncertain callback leaves the original order pending and retries its stored receipt without debiting again', async () => {
  const { pay, status, state, env } = fixture();
  state.callbackStatus = null;
  const pending = await pay();
  assert.equal(pending.code, 2);
  assert.equal(pending.checkout_state, 'processing');
  assert.equal(state.payment.confirmed, false);
  assert.equal((await status()).code, 0);
  assert.deepEqual(state.events, ['ledger', 'world', 'quote', 'debit', 'callback']);

  delete env.OP_SDK_PAYMENT_ORDER_URL;
  state.callbackStatus = 'delivered';
  assert.equal((await pay()).code, 1);
  assert.equal((await pay()).code, 1);
  assert.deepEqual(state.events, ['ledger', 'world', 'quote', 'debit', 'callback', 'ledger', 'callback', 'confirm', 'ledger']);
  assert.equal(state.callbacks.length, 2);
  assert.deepEqual(state.callbacks[0], state.callbacks[1]);
  assert.equal(state.balanceMinor, 2000);
  assert.equal((await status()).code, 1);
});
