import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// The classifier is tested without starting an HTTP service or loading any database client.
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'h3' && context.parentURL?.endsWith('/giftPaymentProxy.ts')) {
            const source = `
                export const createError = data => Object.assign(new Error(data.message), data);
                export const getHeader = () => {};
                export const getRequestURL = () => {};
                export const readRawBody = () => {};
                export const sendProxy = () => { throw new Error('unexpected HTTP request'); };
            `;
            return nextResolve('data:text/javascript,' + encodeURIComponent(source), context);
        }
        return nextResolve(specifier, context);
    },
});

const { findPaymentNotificationOrder } = await import('../server/utils/giftPaymentProxy.ts');

test('callbacks retain all original, gateway and transaction identifiers for classification', async () => {
    const row = { transaction_id: 'local-tx', mch_order_id: 'gateway-tx', server_url: 'gift://' };
    const result = await findPaymentNotificationOrder({
        extParam: 'local-tx', outTradeNo: 'original-merchant-tx', tradeNo: 'gateway-tx',
    }, async ({ query, values }) => {
        assert.match(query, /transaction_id IN/);
        assert.match(query, /mch_order_id IN/);
        assert.match(query, /LIMIT 2/);
        assert.deepEqual(values, [
            'local-tx', 'original-merchant-tx', 'gateway-tx',
            'local-tx', 'original-merchant-tx', 'gateway-tx',
        ]);
        return [row];
    });
    assert.equal(result, row);
});

test('identifiers matching different orders cannot classify a gift or reach fulfillment', async () => {
    await assert.rejects(findPaymentNotificationOrder({
        extParam: 'gift-tx', tradeNo: 'another-account-order',
    }, async () => [{ transaction_id: 'gift-tx' }, { transaction_id: 'other-tx' }]),
    error => error.statusCode === 400 && error.message.includes('匹配冲突'));
});

test('missing, malformed and unknown identifiers cannot select an arbitrary order', async () => {
    let queries = 0;
    const noRows = async () => { queries++; return []; };
    assert.equal(await findPaymentNotificationOrder({}, noRows), null);
    assert.equal(queries, 0);
    for (const value of [[], {}, true, 1e20]) {
        await assert.rejects(findPaymentNotificationOrder({ trade_no: value }, noRows),
            error => error.statusCode === 400);
    }
    assert.equal(queries, 0);
    assert.equal(await findPaymentNotificationOrder({ trade_no: 'missing' }, noRows), null);
    assert.equal(queries, 1);
});
