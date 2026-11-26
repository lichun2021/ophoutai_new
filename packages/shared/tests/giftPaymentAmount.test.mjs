import assert from 'node:assert/strict';
import test from 'node:test';
import { gatewayMinorUnitsToYuan, getGiftPaymentAmountMinor, giftPaymentMatches, toPaymentMinorUnits } from '../server/utils/giftPaymentAmount.ts';

test('configured quantity, order and confirmed amount must agree to the cent', () => {
    assert.equal(getGiftPaymentAmountMinor('39.90', 2), 7980);
    assert.equal(giftPaymentMatches('39.90', 2, 79.8, '79.80'), true);
    assert.equal(giftPaymentMatches('39.90', 1, '1.00', '1.00'), false);
    assert.equal(giftPaymentMatches('39.90', 1, '39.90', '39.89'), false);
    assert.equal(giftPaymentMatches('39.90', 1, '39.90', undefined), false);
    assert.equal(giftPaymentMatches(null, 1, null, null), false);
    assert.equal(getGiftPaymentAmountMinor('99999999.99', 2), null);
});

test('inexact or missing payment values never become successful payments', () => {
    for (const value of [null, undefined, 0, -1, NaN, Infinity, '', '0.001', '1.00x', '1e1', '1\n', true]) {
        assert.equal(toPaymentMinorUnits(value), null);
    }
    assert.equal(gatewayMinorUnitsToYuan('1234'), '12.34');
    for (const cents of [null, '', 0, -10, '123.5', '123x']) assert.equal(gatewayMinorUnitsToYuan(cents), null);
});
