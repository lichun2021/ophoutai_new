import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import type { OpPaymentReceipt } from '../utils/opPaymentInter';

export type OpSdkPtbOrder = {
  id: string;
  userId: number;
  username: string;
  subAccountId: number;
  wuid: string;
  worldId: number;
  sku: string;
  amountMinor: number;
};

export type OpSdkPtbCommitted = { receipt: OpPaymentReceipt; confirmed: boolean };
export class OpSdkPtbOrderRejectedError extends Error {}

type OrderIdentity = Omit<OpSdkPtbOrder, 'amountMinor'>;

interface PaymentRow extends RowDataPacket {
  id: number;
  user_id: number;
  sub_user_id: number | null;
  world_id: number;
  wuid: string;
  role_id: string;
  product_des: string;
  game_code: string;
  payment_way: string;
  transaction_id: string;
  mch_order_id: string;
  payment_status: number;
  msg: string;
  amount: string;
  ptb_before: string;
  ptb_change: string;
  ptb_after: string;
  paid_at: number | string | null;
}

const PAYMENT_WAY = '平台币';
const PENDING = 'OP_SDK_PTB_DELIVERY_PENDING';
const CONFIRMED = 'OP_SDK_PTB_DELIVERY_CONFIRMED';
const MAX_AMOUNT_MINOR = 9_999_999_999; // PaymentRecords.amount is DECIMAL(10,2).

function validInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

function validateOrder(order: OrderIdentity): void {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(order.id) || order.id.length !== 36 ||
    !/^[1-9][0-9]{0,18}$/.test(order.wuid) || /[^0-9]/.test(order.wuid) || BigInt(order.wuid) > 9_223_372_036_854_775_807n ||
    ![order.userId, order.subAccountId, order.worldId].every(validInteger) ||
    !order.username || order.username !== order.username.trim() || order.username.length > 100 ||
    !order.sku || order.sku !== order.sku.trim() || order.sku.length > 100) {
    throw new Error('OP 平台币订单标识无效');
  }
}

function minorUnits(value: string): number {
  const match = /^(-?)([0-9]+)\.([0-9]{2})$/.exec(value);
  if (!match || match[0] !== value) throw new Error('平台币账本金额无效');
  const result = Number(match[2] + match[3]) * (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(result)) throw new Error('平台币账本金额超出范围');
  return result;
}

function decimal(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

function receiptFor(order: OrderIdentity, recordId: number, amountMinor: number, paidAt: number): OpPaymentReceipt {
  if (!validInteger(recordId) || !Number.isSafeInteger(paidAt) || paidAt <= 0) {
    throw new Error('OP 平台币账本回执无效');
  }
  return {
    id: order.id,
    worldId: order.worldId,
    wuid: order.wuid,
    sku: order.sku,
    paymentId: `ptb:${recordId}`,
    amountMinor,
    currency: 'CNY',
    paidAt,
  };
}

async function readCommitted(db: Pick<Pool, 'execute'>, order: OrderIdentity): Promise<OpSdkPtbCommitted | null> {
  const [rows] = await db.execute<PaymentRow[]>(`
    SELECT id, user_id, sub_user_id, world_id, wuid, role_id, product_des, game_code, payment_way,
           transaction_id, mch_order_id, payment_status, msg, amount, ptb_before, ptb_change, ptb_after,
           UNIX_TIMESTAMP(callback_at) AS paid_at
    FROM PaymentRecords WHERE transaction_id = ? OR mch_order_id = ?`, [order.id, order.id]);
  if (!rows.length) return null;
  const row = rows[0];
  const pending = row.payment_status === 1 && row.msg === PENDING;
  const confirmed = row.payment_status === 3 && row.msg === CONFIRMED;
  if (rows.length !== 1 || row.transaction_id !== order.id || row.mch_order_id !== order.id ||
    row.game_code !== 'op' || row.payment_way !== PAYMENT_WAY || row.user_id !== order.userId ||
    row.sub_user_id !== order.subAccountId || row.world_id !== order.worldId || row.wuid !== order.wuid ||
    row.role_id !== order.wuid || row.product_des !== order.sku || (!pending && !confirmed)) {
    throw new OpSdkPtbOrderRejectedError('OP 平台币订单与现有账本不匹配');
  }
  const amountMinor = minorUnits(row.amount);
  if (amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR || minorUnits(row.ptb_change) !== -amountMinor ||
    minorUnits(row.ptb_after) < 0 || minorUnits(row.ptb_before) - amountMinor !== minorUnits(row.ptb_after)) {
    throw new Error('OP 平台币订单扣款记录无效');
  }
  return { receipt: receiptFor(order, row.id, amountMinor, Number(row.paid_at)), confirmed };
}

export async function findOpSdkPtbPayment(order: OrderIdentity): Promise<OpSdkPtbCommitted | null> {
  validateOrder(order);
  return readCommitted(pool, order);
}

function checkAmount(payment: OpSdkPtbCommitted, amountMinor: number): OpSdkPtbCommitted {
  if (payment.receipt.amountMinor !== amountMinor) throw new OpSdkPtbOrderRejectedError('OP 平台币订单金额与现有账本不匹配');
  return payment;
}

export async function debitOpSdkPtbPayment(order: OpSdkPtbOrder, expiresAt: number): Promise<OpSdkPtbCommitted | null> {
  validateOrder(order);
  if (!Number.isSafeInteger(order.amountMinor) || order.amountMinor < 1 || order.amountMinor > MAX_AMOUNT_MINOR) {
    throw new Error('OP 平台币订单金额无效');
  }
  const amount = decimal(order.amountMinor);
  const db = await pool.getConnection();
  let duplicate: unknown;
  try {
    await db.beginTransaction();
    const [users] = await db.execute<RowDataPacket[]>(
      'SELECT status, game_code, channel_code, platform_coins FROM Users WHERE id = ? AND username = ? FOR UPDATE',
      [order.userId, order.username]);
    const user = users[0];
    if (!user || user.status !== 0 || user.game_code !== 'op') throw new OpSdkPtbOrderRejectedError('该账号无法使用 OP 平台币支付');
    const [subAccounts] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM SubUsers WHERE id = ? AND parent_user_id = ? FOR UPDATE', [order.subAccountId, order.userId]);
    if (!subAccounts.length) throw new OpSdkPtbOrderRejectedError('小号不属于当前支付账号');

    const existing = await readCommitted(db, order);
    if (existing) {
      const payment = checkAmount(existing, order.amountMinor);
      await db.commit();
      return payment;
    }

    const paidAt = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || paidAt >= expiresAt) throw new OpSdkPtbOrderRejectedError('游戏订单已过期，请重新下单');
    const [debit] = await db.execute<ResultSetHeader>(`
      UPDATE Users SET platform_coins = platform_coins - CAST(? AS DECIMAL(15,2))
      WHERE id = ? AND platform_coins >= CAST(? AS DECIMAL(15,2))`, [amount, order.userId, amount]);
    if (debit.affectedRows !== 1) {
      await db.rollback();
      return null;
    }

    const after = decimal(minorUnits(user.platform_coins) - order.amountMinor);
    const [insert] = await db.execute<ResultSetHeader>(`
      INSERT INTO PaymentRecords (
        user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, world_id, product_name, product_des,
        amount, mch_order_id, callback_at, msg, channel_code, game_code, payment_status, ptb_before, ptb_change, ptb_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?, 'op', 1, ?, ?, ?)`, [
      order.userId, order.subAccountId, order.wuid, order.id, order.wuid, PAYMENT_WAY, order.worldId, order.sku, order.sku,
      amount, order.id, paidAt, PENDING, user.channel_code ?? '', user.platform_coins, `-${amount}`, after,
    ]);
    const result = { receipt: receiptFor(order, insert.insertId, order.amountMinor, paidAt), confirmed: false };
    await db.commit();
    return result;
  } catch (error) {
    try {
      await db.rollback();
    } catch {
      db.destroy();
      throw error;
    }
    if ((error as { code?: string } | null)?.code !== 'ER_DUP_ENTRY') throw error;
    duplicate = error;
  } finally {
    db.release();
  }

  const existing = await findOpSdkPtbPayment(order);
  if (existing) return checkAmount(existing, order.amountMinor);
  throw duplicate;
}

export async function confirmOpSdkPtbPayment(payment: OpSdkPtbCommitted): Promise<void> {
  if (payment.confirmed) return;
  const { receipt } = payment;
  const recordId = Number(receipt.paymentId.slice(4));
  if (!validInteger(recordId) || receipt.paymentId !== `ptb:${recordId}`) throw new Error('OP 平台币账本回执无效');
  const where = `id = ? AND transaction_id = ? AND mch_order_id = ? AND game_code = 'op' AND payment_way = ?
    AND world_id = ? AND wuid = ? AND role_id = ? AND product_des = ?
    AND amount = CAST(? AS DECIMAL(10,2)) AND callback_at = FROM_UNIXTIME(?)`;
  const keys = [recordId, receipt.id, receipt.id, PAYMENT_WAY, receipt.worldId, receipt.wuid, receipt.wuid,
    receipt.sku, decimal(receipt.amountMinor), receipt.paidAt];
  const [result] = await pool.execute<ResultSetHeader>(`
    UPDATE PaymentRecords SET payment_status = 3, msg = ?, notify_at = NOW()
    WHERE ${where} AND payment_status = 1 AND msg = ?`, [CONFIRMED, ...keys, PENDING]);
  if (result.affectedRows === 1) return;
  const [confirmed] = await pool.execute<RowDataPacket[]>(`
    SELECT id FROM PaymentRecords WHERE ${where} AND payment_status = 3 AND msg = ?`, [...keys, CONFIRMED]);
  if (!confirmed.length) throw new Error('OP 平台币订单到账状态未能保存');
}
