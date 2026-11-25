const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const quiet = { log() {}, warn() {}, error() {} };
const roles = [
    { id: 17, uuid: 'shared-role', user_id: 42, subuser_id: 7, server_id: 10017, character_level: 10, server_name: 'S10017' },
    { id: 21, uuid: 'shared-role', user_id: 42, subuser_id: 7, server_id: 10021, character_level: 20, server_name: 'S10021' },
];
const gift = { gift_items: [{ i: 1, a: 1 }], package_name: 'fixture', price_platform_coins: 10, is_active: true };

// Compile the actual exported function with isolated database and HTTP fixtures.
function loadFunction(app, file, name, fixtures) {
    const source = fs.readFileSync(path.join(root, 'apps', app, 'server', file), 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const declaration = tree.statements.flatMap(statement =>
        ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []
    ).find(item => item.name.getText(tree) === name);
    assert.ok(declaration, name);
    let code = `const ${declaration.getText(tree)}; globalThis.target = ${name};`;
    code = code.replaceAll("await import('../model/payment')", 'PaymentFixture')
        .replaceAll("await import('../utils/redis-cluster')", 'RedisFixture')
        .replaceAll("await import('../utils/systemConfig')", 'SystemFixture')
        .replaceAll("await import('../utils/sdkSign')", 'SignFixture');
    const context = {
        console: quiet, setTimeout, clearTimeout, AbortController,
        defineEventHandler: fn => fn,
        createError: info => Object.assign(new Error(info.message), info),
        ...fixtures,
    };
    vm.runInNewContext(ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.target;
}

for (const app of ['op-admin', 'user-center', 'agent-admin']) {
    test(`${app}: IDIP delivery keeps the selected server and rejects absent or foreign roles`, async () => {
        for (const [serverId, owner, expected] of [[10021, 42, true], [10022, 42, false], [10021, 99, false]]) {
            const deliveries = [];
            const fn = loadFunction(app, 'model/externalGiftPackage.ts', 'deliverPackageToGameViaIDIP', {
                sql: async ({ query, values }) => {
                    if (query.includes('SELECT * FROM GiftPackagePurchaseRecords')) {
                        return [{ id: 1, user_id: owner, thirdparty_uid: 'shared-role', package_id: 482 }];
                    }
                    if (/FROM (?:GameCharacters|gamecharacters)/.test(query)) {
                        assert.match(query, /gc.server_id = \?/);
                        assert.match(query, /su.parent_user_id = \?/);
                        assert.deepEqual(Array.from(values), ['shared-role', serverId, owner]);
                        return roles.filter(role => role.uuid === values[0] && role.server_id === values[1] && role.user_id === values[2]);
                    }
                    return { affectedRows: 1 };
                },
                getGiftPackageById: async () => gift,
                getByWorldId: async id => ({ webhost: `https://server-${id}.invalid`, name: String(id) }),
                fetch: async (url, options) => {
                    deliveries.push({ url, body: JSON.parse(options.body) });
                    return { status: 200, statusText: 'OK', text: async () => JSON.stringify({ body: { Result: 0 } }) };
                },
            });
            const result = await fn(1, String(serverId), 'shared-role');
            assert.equal(result.success, expected);
            assert.equal(deliveries.length, expected ? 1 : 0);
            if (expected) {
                assert.equal(deliveries[0].url, 'https://server-10021.invalid/script/idip/4283');
                assert.equal(deliveries[0].body.body.Partition, '10021');
                assert.equal(deliveries[0].body.body.RoleId, 'shared-role');
            }
        }
    });

    test(`${app}: payment character lookup includes its order server`, async () => {
        const fn = loadFunction(app, 'model/gameCharacters.ts', 'findByUuid', {
            sql: async ({ query, values }) => {
                assert.match(query, /uuid = \? AND server_id = \?/);
                return roles.filter(role => role.uuid === values[0] && role.server_id === values[1]);
            },
        });
        assert.equal((await fn('shared-role', 10021)).id, 21);
        assert.equal(await fn('shared-role', 10022), null);
    });
}

for (const app of ['user-center', 'agent-admin']) {
    test(`${app}: role reports update the requested server instead of the first UUID`, async () => {
        let updatedId;
        const fn = loadFunction(app, 'model/gameCharacters.ts', 'upsertByUuid', {
            normalizeExtData: value => value,
            sql: async ({ query, values }) => {
                if (query.startsWith('SELECT')) {
                    assert.match(query, /subuser_id = \? AND uuid = \? AND server_id = \?/);
                    return roles.filter(role => role.subuser_id === values[0] && role.uuid === values[1] && role.server_id === values[2]);
                }
                updatedId = values.at(-1);
                return { affectedRows: 1 };
            },
        });
        await fn({ ...roles[1], ext: {} });
        assert.equal(updatedId, 21);
    });
}

for (const app of ['op-admin', 'user-center']) {
    test(`${app}: platform-coin mall purchase carries server through selection and delivery`, async () => {
        for (const [serverId, expectedCode] of [[10021, 200], [10022, 400], [undefined, 400]]) {
            let charges = 0;
            let payment;
            let target;
            const fn = loadFunction(app, 'controller/userClient.ts', 'userPurchaseGiftPackage', {
                requireAuth: async () => ({ userId: 42 }),
                readBody: async event => event.body,
                getCurrentFormattedTime: () => 'fixture-time',
                RedisFixture: { getRedisCluster: () => ({ set: async () => true }) },
                UserModel: {
                    findById: async () => ({ id: 42 }), getPlatformCoins: async () => 100,
                    updatePlatformCoinsUnified: async () => { charges++; return { success: true, newBalance: 90 }; },
                },
                sql: async ({ query, values }) => {
                    assert.match(query, /su.parent_user_id = \? AND gc.uuid = \?/);
                    return roles.filter(role => role.user_id === values[0] && role.uuid === values[1]
                        && (values.length === 2 || role.server_id === values[2]));
                },
                PaymentFixture: { insert: async row => { payment = row; }, updateByTransactionId: async () => {} },
                ExternalGiftPackageModel: {
                    checkUserCanPurchase: async () => ({ canPurchase: true }), getGiftPackageById: async () => gift,
                    createPurchaseRecord: async () => ({ insertId: 1 }),
                    deliverPackageToGameViaIDIP: async (...args) => { target = args; return { success: true }; },
                },
            });
            const result = await fn({ body: { user_id: 42, package_id: 482, character_uuid: 'shared-role', server_id: serverId } });
            assert.equal(result.code, expectedCode);
            assert.equal(charges, expectedCode === 200 ? 1 : 0);
            if (expectedCode === 200) {
                assert.equal(payment.world_id, 10021);
                assert.equal(target[1], '10021');
            }
        }
    });
}

test('cash mall proxy binds UUID, account and server before forwarding', async () => {
    for (const [serverId, suppliedServerId, expected] of [[10021, 10021, true], [10021, 10017, false], [10022, 10022, false]]) {
        let forwarded;
        const fn = loadFunction('user-center', 'controller/payment.ts', 'doPayment', {
            readBody: async event => event.body, getQuery: () => ({}),
            SystemFixture: { getSystemParam: async (_key, fallback) => fallback },
            SignFixture: { computeSdkSign: () => 'fixture-signature' },
            requireAuth: async () => ({ userId: 42, username: 'fixture-user' }),
            getCardProduct: () => null,
            sql: async ({ query, values }) => query.includes('FROM Users') ? [{ username: 'fixture-user' }]
                : roles.filter(role => role.uuid === values[0] && role.user_id === values[1] && role.server_id === values[2]),
            forwardGiftPayment: async (_event, _path, params) => { forwarded = params; return { code: 1 }; },
        });
        const result = await fn({ node: { req: { method: 'POST' } }, body: {
            server_url: 'gift://' + encodeURIComponent(JSON.stringify({ pid: 482, cid: 'shared-role', sid: serverId })),
            role_id: 'shared-role', h: suppliedServerId, tr: 'forged-subaccount',
        } });
        assert.equal(Boolean(forwarded), expected);
        if (expected) {
            assert.equal(forwarded.h, '10021');
            assert.equal(forwarded.tr, '7');
            assert.equal(result.code, 1);
        }
    }
});

test('mall selection and remembered selection distinguish equal UUIDs on different servers', async () => {
    const { parse, compileScript, compileTemplate } = require('../../user-center/node_modules/@vue/compiler-sfc');
    const file = path.join(root, 'apps/user-center/pages/user/mall.vue');
    const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
    assert.equal(errors.length, 0);
    const script = compileScript(descriptor, { id: 'mall-server-test' });
    assert.equal(compileTemplate({ source: descriptor.template.content, id: 'mall-server-test', filename: file,
        compilerOptions: { bindingMetadata: script.bindings } }).errors.length, 0);
    const cookies = new Map([['mall_last_character_index', { value: '1' }]]);
    let list = [...roles];
    const context = {
        ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
        useCookie: key => { if (!cookies.has(key)) cookies.set(key, { value: null }); return cookies.get(key); },
        useRouter: () => ({}), useAuthStore: () => ({ userInfo: { id: 42 } }),
        useCartStore: () => ({}), useTips: () => ({}),
        definePageMeta() {}, onMounted() {}, onUnmounted() {}, watch() {},
        $fetch: async () => ({ code: 200, data: { characters: list } }), console: quiet,
    };
    vm.runInNewContext(descriptor.scriptSetup.content.replace(/^import .*;$/gm, '') + `
        globalThis.page = { loadUserCharacters, selectedCharacterKey, selectedCharacter, characterSelectOptions,
            cartCharacterKey, checkoutCharacter };`, context);
    await context.page.loadUserCharacters();
    assert.equal(context.page.selectedCharacter.value.server_id, 10021);
    assert.equal(cookies.get('mall_last_character_key').value, '10021:shared-role');
    assert.equal(cookies.get('mall_last_character_index').value, null);
    assert.equal(new Set(context.page.characterSelectOptions.value.map(item => item.value)).size, 2);
    list = [...roles].reverse();
    await context.page.loadUserCharacters();
    assert.equal(context.page.selectedCharacter.value.server_id, 10021);
    context.page.cartCharacterKey.value = '10021:shared-role';
    assert.equal(context.page.checkoutCharacter.value.server_id, 10021);
});
