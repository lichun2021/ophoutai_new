import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('./.op-payment-inter-test.cjs', import.meta.url));
const { outputFiles } = await require('esbuild').build({
  entryPoints: [fileURLToPath(new URL('../server/utils/opPaymentInter.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node',
});
const bundle = new Module(filename);
bundle._compile(outputFiles[0].text, filename);
const { getOpPaymentInterConfig, getOpPaymentOrderConfig, getOpPaymentOrder, notifyOpPayment } = bundle.exports;

const baseUrl = 'http://192.168.123.1:8111';
const secret = 'inter fixture + &';
const receipt = {
  id: '098f26b4-cb56-11f1-ae11-884949c4244b',
  worldId: 111,
  wuid: '40763927194340500',
  sku: 'example.fixture.product',
  paymentId: 'ptb_fixture',
  amountMinor: 1000,
  currency: 'CNY',
  paidAt: 1794902400,
};

function configure(context, overrides = {}) {
  for (const [key, value] of Object.entries({ GM_INTER_BASE_URL: baseUrl, GM_INTER_SECRET: secret, GM_TIMEOUT_MS: '3000', ...overrides })) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test('sends the stored receipt as form data with the exact WUID and verifies the business status', async context => {
  configure(context);
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, result: { status: 'paid' } }));

  assert.equal(await notifyOpPayment(getOpPaymentInterConfig(), receipt), 'paid');
  assert.equal(fetchMock.mock.callCount(), 1);
  const [target, request] = fetchMock.mock.calls[0].arguments;
  assert.equal(target, `${baseUrl}/v2/Inter/done_pay_tranid`);
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.deepEqual(request.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.deepEqual(Object.fromEntries(request.body), {
    ...receipt, code: secret, worldId: '111', amountMinor: '1000', paidAt: '1794902400',
  });
});

test('accepts an already delivered receipt and rejects ambiguous failures without retry', async context => {
  configure(context);
  const responses = [
    () => Response.json({ code: 200, result: { status: 'delivered' } }),
    () => Response.json({ code: 200, result: { status: 'paid' } }, { status: 202 }),
    () => Response.json({ code: 202, result: { status: 'paid' }, message: 'private upstream data' }),
    () => Response.json({ code: 200, result: '支付成功' }),
    () => { throw new Error('private upstream data'); },
  ];
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => responses.shift()());
  const config = getOpPaymentInterConfig();

  assert.equal(await notifyOpPayment(config, receipt), 'delivered');
  for (let index = 0; index < 4; index++) {
    await assert.rejects(notifyOpPayment(config, receipt), { message: 'OP 到账回执待确认' });
  }
  assert.equal(fetchMock.mock.callCount(), 5);
});

test('rejects unsafe origins and missing credentials before spending', async context => {
  for (const invalid of ['http://example.test', 'http://0xc0a87b01:8111', 'http://127.0.0.1:8111', `${baseUrl}/other`, `${baseUrl}/#`, 'https://user:pw@example.test']) {
    await context.test(invalid, step => {
      configure(step, { GM_INTER_BASE_URL: invalid });
      assert.throws(getOpPaymentInterConfig, { message: 'OP 到账通道配置无效' });
    });
  }
  await context.test('missing secret', step => {
    configure(step, { GM_INTER_SECRET: undefined });
    assert.throws(getOpPaymentInterConfig, { message: 'OP 到账通道配置无效' });
  });
  await context.test('configured HTTPS root', step => {
    configure(step, { GM_INTER_BASE_URL: 'https://op.example.test/' });
    assert.equal(getOpPaymentInterConfig().baseUrl, 'https://op.example.test');
  });
});

test('does not send an invalid or imprecise receipt', async context => {
  configure(context);
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  const config = getOpPaymentInterConfig();
  for (const invalid of [{ id: 'ptb_fixture' }, { wuid: Number(receipt.wuid) }, { wuid: '9223372036854775808' }, { amountMinor: 0 }]) {
    await assert.rejects(notifyOpPayment(config, { ...receipt, ...invalid }), { message: 'OP 到账凭据字段无效' });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('reads and validates a game quote over the explicitly configured same-origin route', async context => {
  const orderUrl = `${baseUrl}/v2/Inter/Payment/order`;
  configure(context, { OP_SDK_PAYMENT_ORDER_URL: orderUrl });
  const identity = { id: receipt.id, worldId: receipt.worldId, wuid: receipt.wuid };
  const order = { ...identity, sku: receipt.sku, subAccountId: '17', amountMinor: 1000, currency: 'CNY', expiresAt: Math.floor(Date.now() / 1000) + 60, status: 'created' };
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, result: { order } }));

  assert.deepEqual(await getOpPaymentOrder(getOpPaymentOrderConfig(), identity), order);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [target, request] = fetchMock.mock.calls[0].arguments;
  assert.equal(target, orderUrl);
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.deepEqual(Object.fromEntries(request.body), { ...identity, worldId: '111', code: secret });
});

test('requires the deployed quote route on the validated Inter origin', async context => {
  const path = '/v2/Inter/Payment/order';
  const unsafeUrls = [undefined, baseUrl, `${baseUrl}/`, `${baseUrl}/v2/Inter/Payment/get_order`,
    `${baseUrl}${path}#`, `${baseUrl}${path}?`, `${baseUrl}/other/..${path}`,
    `http://192.168.123.2:8111${path}`, `http://user@192.168.123.1:8111${path}`, `http://0xc0a87b01:8111${path}`];
  for (const url of unsafeUrls) {
    await context.test(String(url), step => {
      configure(step, { OP_SDK_PAYMENT_ORDER_URL: url });
      assert.throws(getOpPaymentOrderConfig, /原订单查询通道/);
    });
  }
});

test('invalid or expired quote data cannot authorize a debit', async context => {
  configure(context, { OP_SDK_PAYMENT_ORDER_URL: `${baseUrl}/v2/Inter/Payment/order` });
  const identity = { id: receipt.id, worldId: receipt.worldId, wuid: receipt.wuid };
  const order = { ...identity, sku: receipt.sku, subAccountId: '17', amountMinor: 1000, currency: 'CNY', expiresAt: Math.floor(Date.now() / 1000) + 60, status: 'created' };
  const invalid = [null, { ...order, id: receipt.id.replace(/^0/, '1') }, { ...order, worldId: 112 },
    { ...order, wuid: Number(receipt.wuid) }, { ...order, subAccountId: '017' }, { ...order, amountMinor: '1000' },
    { ...order, currency: 'USD' }, { ...order, status: 'paid' }, { ...order, expiresAt: 1 }, { ...order, expiresAt: Date.now() + 60_000 }];
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, result: { order: invalid.shift() } }));
  const config = getOpPaymentOrderConfig();
  for (let index = invalid.length; index > 0; index--) {
    await assert.rejects(getOpPaymentOrder(config, identity), /原订单凭据无效或已过期/);
  }
  fetchMock.mock.mockImplementation(async () => Response.json({ code: 202, message: 'private upstream data' }));
  await assert.rejects(getOpPaymentOrder(config, identity), { message: 'OP 原订单查询未确认' });
});
