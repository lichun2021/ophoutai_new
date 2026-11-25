const products = {
    '月卡': { cardType: 'monthly', price: 328, dailyCoins: 648, days: 30 },
    '终身卡': { cardType: 'lifetime', price: 980, dailyCoins: 500, days: null },
} as const;

export function getCardProduct(name: unknown) {
    if (name === '月卡' || name === '终身卡') return products[name];
    return null;
}
