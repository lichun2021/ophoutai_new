// PaymentRecords.amount is DECIMAL(10,2). Compare positive cash amounts as integer cents.
const maxOrderCents = 9_999_999_999;

// Some gateways report paid amounts in integer cents instead of yuan.
export function gatewayMinorUnitsToYuan(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const digits = String(value);
    if (!digits.length || digits.length > 10 || /\D/.test(digits) || Number(digits) === 0) return null;
    return (Number(digits) / 100).toFixed(2);
}

export function toPaymentMinorUnits(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value));
    if (!match || match[0] !== String(value)) return null;
    const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    return cents > 0 ? cents : null;
}

export function getGiftPaymentAmountMinor(price: unknown, quantity: unknown): number | null {
    const unit = toPaymentMinorUnits(price);
    if (unit === null || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    const cents = unit * quantity;
    return cents <= maxOrderCents ? cents : null;
}

export function giftPaymentMatches(price: unknown, quantity: unknown, orderAmount: unknown, paidAmount: unknown): boolean {
    const expected = getGiftPaymentAmountMinor(price, quantity);
    return expected !== null && expected === toPaymentMinorUnits(orderAmount) && expected === toPaymentMinorUnits(paidAmount);
}
