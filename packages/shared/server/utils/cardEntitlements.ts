import { randomUUID } from 'node:crypto';
import { getCardProduct } from './cardProduct';
import { toPaymentMinorUnits } from './giftPaymentAmount';

type CardConnection = {
    beginTransaction(): Promise<void>;
    query(query: string, values?: any[]): Promise<[any, any]>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
};
type CardPool = { getConnection(): Promise<CardConnection> };

export type EntitlementCard = {
    id: number;
    user_id: number;
    card_type: 'monthly' | 'lifetime';
    daily_coins: number;
    start_date: string;
    expire_date: string | null;
    is_active: number;
    transaction_id: string | null;
    [key: string]: any;
};

export function getCardBeijingDate() {
    return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

async function lockUser(connection: CardConnection, userId: number) {
    const [users] = await connection.query('SELECT id, platform_coins FROM Users WHERE id = ? FOR UPDATE', [userId]);
    if (!users.length) throw new Error('用户不存在');
    return users[0];
}

// Keep distinct paid monthly periods, while making their remaining days run in sequence.
async function readCardSchedule(connection: CardConnection, userId: number, today: string): Promise<EntitlementCard[]> {
    const [rows] = await connection.query(
        `SELECT * FROM MonthlyCards WHERE user_id = ? AND is_active = 1
           AND (expire_date IS NULL OR expire_date >= ?)
         ORDER BY start_date, created_at, id FOR UPDATE`, [userId, today],
    );
    const cards: EntitlementCard[] = [];
    const transactions = new Set<string>();
    for (const row of rows as EntitlementCard[]) {
        if (row.transaction_id && transactions.has(row.transaction_id)) {
            await connection.query('UPDATE MonthlyCards SET is_active = 0 WHERE id = ?', [row.id]);
            continue;
        }
        if (row.transaction_id) transactions.add(row.transaction_id);
        cards.push({ ...row, daily_coins: row.card_type === 'monthly' ? 648 : Number(row.daily_coins) });
    }
    const monthlyCards = cards.filter(card => card.card_type === 'monthly');
    if (monthlyCards.some(card => card.expire_date === null)) return cards;

    let nextStart = today;
    for (const card of monthlyCards) {
        const remainingStart = card.start_date > today ? card.start_date : today;
        const days = Math.round((Date.parse(`${card.expire_date}T00:00:00Z`) - Date.parse(`${remainingStart}T00:00:00Z`)) / 86400_000) + 1;
        if (!Number.isSafeInteger(days) || days <= 0) throw new Error('月卡有效期异常，需人工核对');
        const start = remainingStart > nextStart ? remainingStart : nextStart;
        const end = addDays(start, days - 1);
        const storedStart = start === remainingStart ? card.start_date : start;
        if (storedStart !== card.start_date || end !== card.expire_date) {
            await connection.query('UPDATE MonthlyCards SET start_date = ?, expire_date = ? WHERE id = ?', [storedStart, end, card.id]);
            card.start_date = storedStart;
            card.expire_date = end;
        }
        nextStart = addDays(end, 1);
    }
    return cards;
}

function currentCards(cards: EntitlementCard[], today: string) {
    const selected = new Map<string, EntitlementCard>();
    for (const card of cards) {
        if (card.start_date > today || (card.expire_date !== null && card.expire_date < today)) continue;
        if (!selected.has(card.card_type)) selected.set(card.card_type, card);
    }
    return [...selected.values()];
}

async function claimedTypes(connection: CardConnection, userId: number, today: string): Promise<Set<string>> {
    const [rows] = await connection.query(
        `SELECT DISTINCT c.card_type FROM MonthlyCardClaims claims
         INNER JOIN MonthlyCards c ON c.id = claims.card_id
         WHERE claims.user_id = ? AND claims.claim_date = ?`, [userId, today],
    );
    return new Set(rows.map((row: { card_type: string }) => row.card_type));
}

export async function activatePaidCard(pool: CardPool, input: { transactionId: string; paidAmount: unknown }) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [identified] = await connection.query('SELECT user_id FROM PaymentRecords WHERE transaction_id = ?', [input.transactionId]);
        if (identified.length !== 1) throw new Error('支付订单不存在');
        await lockUser(connection, identified[0].user_id);
        const [orders] = await connection.query('SELECT * FROM PaymentRecords WHERE transaction_id = ? FOR UPDATE', [input.transactionId]);
        const order = orders[0];
        const product = getCardProduct(order?.product_name);
        const paidMinor = toPaymentMinorUnits(input.paidAmount);
        if (!product || order.user_id !== identified[0].user_id || paidMinor !== product.price * 100
            || toPaymentMinorUnits(order.amount) !== paidMinor) throw new Error('卡商品或实付金额与订单不一致');

        const [existing] = await connection.query('SELECT * FROM MonthlyCards WHERE user_id = ? AND transaction_id = ? FOR UPDATE', [order.user_id, input.transactionId]);
        if (existing.length) {
            if (existing.some((card: EntitlementCard) => card.user_id !== order.user_id || card.card_type !== product.cardType)) {
                throw new Error('卡权益交易关联异常，需人工核对');
            }
            if (order.payment_status !== 3) {
                await connection.query(
                    `UPDATE PaymentRecords SET payment_status = 3, callback_at = COALESCE(callback_at, ?)
                     WHERE transaction_id = ?`,
                    [new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), input.transactionId],
                );
            }
            await connection.commit();
            return { replayed: true, review: String(order.msg || '').startsWith('CARD_REVIEW_'), cardId: existing[0].id };
        }

        const today = getCardBeijingDate();
        const cards = await readCardSchedule(connection, order.user_id, today);
        const sameType = cards.filter(card => card.card_type === product.cardType);
        const review = (product.cardType === 'lifetime' && sameType.length > 0)
            || (product.cardType === 'monthly' && sameType.some(card => card.expire_date === null));
        let start = today;
        if (product.cardType === 'monthly' && !review) {
            const latest = sameType.reduce((date, card) => card.expire_date! > date ? card.expire_date! : date, '');
            if (latest >= today) start = addDays(latest, 1);
        }
        const expire = product.days === null ? null : addDays(start, product.days - 1);
        const [insert] = await connection.query(
            `INSERT INTO MonthlyCards (user_id, card_type, daily_coins, start_date, expire_date, is_active, purchase_amount, transaction_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [order.user_id, product.cardType, product.dailyCoins, start, expire, review ? 0 : 1, product.price, input.transactionId],
        );
        const message = review ? `CARD_REVIEW_${product.cardType === 'lifetime' ? 'DUPLICATE_LIFETIME' : 'MONTHLY_DATES'}` : 'CARD_ACTIVE';
        await connection.query(
            `UPDATE PaymentRecords SET payment_status = 3, callback_at = COALESCE(callback_at, ?), notify_at = ?, msg = ?
             WHERE transaction_id = ?`,
            [new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), review ? null : new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), message, input.transactionId],
        );
        await connection.commit();
        return { replayed: false, review, cardId: insert.insertId };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function readCardEntitlementState(pool: CardPool, userId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await lockUser(connection, userId);
        const today = getCardBeijingDate();
        const scheduled = await readCardSchedule(connection, userId, today);
        const cards = currentCards(scheduled, today).map(card => {
            if (card.card_type !== 'monthly' || card.expire_date === null) return card;
            let end = card.expire_date;
            for (const next of scheduled.filter(candidate => candidate.card_type === 'monthly' && candidate.expire_date !== null)) {
                if (next.start_date <= addDays(end, 1) && next.expire_date! > end) end = next.expire_date!;
            }
            return { ...card, expire_date: end };
        });
        const claimed = await claimedTypes(connection, userId, today);
        const [dates] = await connection.query(
            `SELECT DISTINCT claim_date FROM MonthlyCardClaims WHERE user_id = ? AND claim_date LIKE ? ORDER BY claim_date`,
            [userId, `${today.slice(0, 7)}%`],
        );
        await connection.commit();
        return {
            cards,
            totalDailyCoins: cards.reduce((sum, card) => sum + card.daily_coins, 0),
            todayClaimed: cards.length > 0 && cards.every(card => claimed.has(card.card_type)),
            unclaimedCards: cards.filter(card => !claimed.has(card.card_type)),
            claimedDates: dates.map((row: { claim_date: string }) => String(row.claim_date).slice(0, 10)),
            today,
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function claimCardDailyCoins(pool: CardPool, userId: number) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const user = await lockUser(connection, userId);
        const today = getCardBeijingDate();
        const cards = currentCards(await readCardSchedule(connection, userId, today), today);
        const claimed = await claimedTypes(connection, userId, today);
        const unclaimed = cards.filter(card => !claimed.has(card.card_type));
        if (!unclaimed.length) {
            await connection.commit();
            return { code: 400, message: cards.length ? '今日月卡权益已领取' : '您没有有效的月卡' };
        }
        if (unclaimed.some(card => !Number.isSafeInteger(card.daily_coins) || card.daily_coins < 0)) {
            throw new Error('卡每日权益金额异常，需人工核对');
        }
        const coins = unclaimed.reduce((sum, card) => sum + card.daily_coins, 0);
        const before = Number(user.platform_coins || 0);
        const after = Number((before + coins).toFixed(2));
        if (!Number.isSafeInteger(coins) || after > 9_999_999_999_999.99) throw new Error('平台币余额超出范围');
        const transactionId = `MC_${userId}_${randomUUID()}`;
        for (const card of unclaimed) {
            await connection.query(
                `INSERT INTO MonthlyCardClaims (card_id, user_id, claim_date, coins_amount, transaction_id) VALUES (?, ?, ?, ?, ?)`,
                [card.id, userId, today, card.daily_coins, transactionId],
            );
        }
        await connection.query('UPDATE Users SET platform_coins = COALESCE(platform_coins, 0) + ? WHERE id = ?', [coins, userId]);
        const names = unclaimed.map(card => card.card_type === 'monthly' ? '月卡' : '终身卡').join('+');
        await connection.query(
            `INSERT INTO PaymentRecords
             (user_id, sub_user_id, role_id, transaction_id, wuid, payment_way, payment_id, world_id,
              product_name, product_des, ip, amount, mch_order_id, msg, server_url, device, channel_code, game_code,
              payment_status, ptb_before, ptb_change, ptb_after)
             VALUES (?, NULL, '', ?, '', '月卡权益', 0, 1, ?, ?, '', 0, ?, ?, '', '', '', '', 3, ?, ?, ?)`,
            [userId, transactionId, `${names}每日领取`, `领取 ${coins} 平台币`, transactionId, `${names}，共领取${coins}平台币`, before, coins, after],
        );
        await connection.commit();
        return { code: 200, data: { coins_claimed: coins, new_balance: after, transaction_id: transactionId }, message: `成功领取 ${coins} 平台币` };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
