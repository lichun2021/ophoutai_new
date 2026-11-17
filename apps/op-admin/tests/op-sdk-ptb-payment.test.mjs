import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('./.op-sdk-ptb-payment-test.cjs', import.meta.url));
const { outputFiles } = await require('esbuild').build({
  entryPoints: [fileURLToPath(new URL('../server/model/opSdkPtbPayment.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['../db'],
});

const order = {
  id: '098f26b4-cb56-11f1-ae11-884949c4244b',
  userId: 7,
  username: 'buyer',
  subAccountId: 17,
  wuid: '40763927194340500',
  worldId: 111,
  sku: 'example.test.sku',
  amountMinor: 1063,
};
const receipt = {
  id: order.id,
  worldId: order.worldId,
  wuid: order.wuid,
  sku: order.sku,
  amountMinor: order.amountMinor,
  paymentId: 'ptb:35',
  currency: 'CNY',
  paidAt: 1794902400,
};
const pending = 'OP_SDK_PTB_DELIVERY_PENDING';
const confirmed = 'OP_SDK_PTB_DELIVERY_CONFIRMED';
const row = {
  id: 35,
  user_id: order.userId,
  sub_user_id: order.subAccountId,
  world_id: order.worldId,
  wuid: order.wuid,
  role_id: order.wuid,
  product_des: order.sku,
  game_code: 'op',
  payment_way: '平台币',
  transaction_id: order.id,
  mch_order_id: order.id,
  payment_status: 1,
  msg: pending,
  amount: '10.63',
  ptb_before: '9999999999999.99',
  ptb_change: '-10.63',
  ptb_after: '9999999999989.36',
  paid_at: String(receipt.paidAt),
};

function fixture(steps) {
  const queue = [...steps];
  const run = (operation, ...args) => {
    const next = queue.shift();
    assert.equal(operation, Array.isArray(next) ? next[0] : next, 'SQL operation order');
    return Array.isArray(next) ? next[1](...args) : undefined;
  };
  const connection = Object.fromEntries(
    ['beginTransaction', 'execute', 'commit', 'rollback', 'release'].map(name => [name, (...args) => run(name, ...args)]),
  );
  const pool = {
    getConnection: async () => { run('getConnection'); return connection; },
    execute: (...args) => run('pool.execute', ...args),
  };
  const bundle = new Module(filename);
  bundle.require = path => {
    assert.equal(path, '../db');
    return { pool };
  };
  bundle._compile(outputFiles[0].text, filename);
  return { ...bundle.exports, verify: () => assert.deepEqual(queue, []) };
}

function orderRead(rows, operation = 'execute') {
  return [operation, (statement, values) => {
    assert.match(statement, /transaction_id = \? OR mch_order_id = \?/);
    assert.deepEqual(values, [order.id, order.id]);
    return [rows];
  }];
}

function lockedOrder(rows = [], balance = row.ptb_before) {
  return [
    'getConnection',
    'beginTransaction',
    ['execute', (statement, values) => {
      assert.match(statement, /FROM Users .*username = \? FOR UPDATE/);
      assert.deepEqual(values, [order.userId, order.username]);
      return [[{ status: 0, game_code: 'op', channel_code: 'test', platform_coins: balance }]];
    }],
    ['execute', (statement, values) => {
      assert.match(statement, /FROM SubUsers .*parent_user_id = \? FOR UPDATE/);
      assert.deepEqual(values, [order.subAccountId, order.userId]);
      return [[{ id: order.subAccountId }]];
    }],
    orderRead(rows),
  ];
}

function debit(affectedRows = 1) {
  return ['execute', (statement, values) => {
    assert.match(statement, /UPDATE Users SET platform_coins = platform_coins - CAST/);
    assert.match(statement, /platform_coins >= CAST/);
    assert.deepEqual(values, [row.amount, order.userId, row.amount]);
    return [{ affectedRows }];
  }];
}

test('fresh debit and its pending receipt commit together with exact decimal balances', async () => {
  let storedPaidAt;
  const ledger = fixture([
    ...lockedOrder(),
    debit(),
    ['execute', (statement, values) => {
      assert.match(statement, /INSERT INTO PaymentRecords/);
      assert.match(statement, /FROM_UNIXTIME\(\?\)/);
      storedPaidAt = values[11];
      assert.ok(Number.isSafeInteger(storedPaidAt) && storedPaidAt > 0);
      assert.deepEqual(values, [
        order.userId, order.subAccountId, order.wuid, order.id, order.wuid, '平台币', order.worldId,
        order.sku, order.sku, row.amount, order.id, storedPaidAt, pending, 'test',
        row.ptb_before, row.ptb_change, row.ptb_after,
      ]);
      return [{ insertId: row.id }];
    }],
    'commit', 'release',
  ]);
  assert.deepEqual(await ledger.debitOpSdkPtbPayment(order, Number.MAX_SAFE_INTEGER), {
    receipt: { ...receipt, paidAt: storedPaidAt }, confirmed: false,
  });
  ledger.verify();
});

test('insufficient balance and an expired quote do not create or commit a payment', async context => {
  context.mock.method(Date, 'now', () => receipt.paidAt * 1000);
  const insufficient = fixture([...lockedOrder([], '10.62'), debit(0), 'rollback', 'release']);
  assert.equal(await insufficient.debitOpSdkPtbPayment(order, Number.MAX_SAFE_INTEGER), null);
  insufficient.verify();

  const expired = fixture([...lockedOrder(), 'rollback', 'release']);
  await assert.rejects(expired.debitOpSdkPtbPayment(order, receipt.paidAt), expired.OpSdkPtbOrderRejectedError);
  expired.verify();
});

test('replay returns the original receipt and rejects a different amount before another debit', async () => {
  const replay = fixture([...lockedOrder([row]), 'commit', 'release']);
  assert.deepEqual(await replay.debitOpSdkPtbPayment(order, 1), { receipt, confirmed: false });
  replay.verify();

  const mismatch = fixture([...lockedOrder([row]), 'rollback', 'release']);
  await assert.rejects(mismatch.debitOpSdkPtbPayment({ ...order, amountMinor: 1064 }, Number.MAX_SAFE_INTEGER), /金额.*不匹配/);
  mismatch.verify();
});

test('an insert failure rolls back the debit and a unique-key race rereads the committed receipt', async () => {
  const failedInsert = error => ['execute', statement => {
    assert.match(statement, /INSERT INTO PaymentRecords/);
    throw error;
  }];
  const error = new Error('insert failed');
  const failed = fixture([...lockedOrder(), debit(), failedInsert(error), 'rollback', 'release']);
  await assert.rejects(failed.debitOpSdkPtbPayment(order, Number.MAX_SAFE_INTEGER), error);
  failed.verify();

  const race = fixture([
    ...lockedOrder(), debit(), failedInsert(Object.assign(new Error('unique-key race'), { code: 'ER_DUP_ENTRY' })),
    'rollback', 'release', orderRead([row], 'pool.execute'),
  ]);
  assert.deepEqual(await race.debitOpSdkPtbPayment(order, Number.MAX_SAFE_INTEGER), { receipt, confirmed: false });
  race.verify();
});

test('a legacy order found by merchant order ID is a conflict', async () => {
  const ledger = fixture([orderRead([{ ...row, transaction_id: 'ptb_legacy' }], 'pool.execute')]);
  await assert.rejects(ledger.findOpSdkPtbPayment(order), /现有账本不匹配/);
  ledger.verify();
});

test('confirmation guards the original receipt and accepts only an exact already confirmed row', async () => {
  const receiptKeys = [
    row.id, order.id, order.id, '平台币', order.worldId, order.wuid, order.wuid,
    order.sku, row.amount, receipt.paidAt,
  ];
  const confirmUpdate = affectedRows => ['pool.execute', (statement, values) => {
    assert.match(statement, /SET payment_status = 3, msg = \?, notify_at = NOW\(\)/);
    assert.match(statement, /callback_at = FROM_UNIXTIME\(\?\).*payment_status = 1 AND msg/s);
    assert.deepEqual(values, [confirmed, ...receiptKeys, pending]);
    return [{ affectedRows }];
  }];
  const checkConfirmed = rows => ['pool.execute', (statement, values) => {
    assert.match(statement, /WHERE id = \? AND transaction_id = \? AND mch_order_id = \?/);
    assert.match(statement, /callback_at = FROM_UNIXTIME\(\?\).*payment_status = 3 AND msg/s);
    assert.deepEqual(values, [...receiptKeys, confirmed]);
    return [rows];
  }];
  const payment = { receipt, confirmed: false };
  const first = fixture([confirmUpdate(1)]);
  await first.confirmOpSdkPtbPayment(payment);
  first.verify();

  const repeated = fixture([confirmUpdate(0), checkConfirmed([{ id: row.id }])]);
  await repeated.confirmOpSdkPtbPayment(payment);
  repeated.verify();

  const conflict = fixture([confirmUpdate(0), checkConfirmed([])]);
  await assert.rejects(conflict.confirmOpSdkPtbPayment(payment), /到账状态未能保存/);
  conflict.verify();
});
