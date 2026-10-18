const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Execute the real TypeScript without a browser or additional test dependencies.
// The second variant toggles only the existing build-time cache flag.
function loadApi(name, { cacheEnabled = false, storage, fetch } = {}) {
    let source = fs.readFileSync(path.join(__dirname, '../../playlet-web/src/lib/Api', name + '.ts'), 'utf8');
    if (cacheEnabled) source = source.replace('const DISABLE_CACHE = true;', 'const DISABLE_CACHE = false;');
    const exports = {};
    const context = {
        exports, fetch, URL, URLSearchParams, encodeURIComponent,
        console: { log() {}, error() {} }, setTimeout,
        require(id) {
            if (id.endsWith('/Host')) return { getHost: () => 'roku:8888' };
            if (id.endsWith('/PlayletApi')) return { PlayletApi: {} };
            throw new Error(`Unexpected import ${id}`);
        }
    };
    Object.defineProperty(context, 'localStorage', { get: () => typeof storage === 'function' ? storage() : storage });
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, context);
    return exports[name];
}

function memoryStorage() {
    const entries = new Map();
    return {
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: key => entries.delete(key),
        key: i => [...entries.keys()][i],
        get length() { return entries.size; }
    };
}

async function successfulFetch(storage, cacheEnabled) {
    const data = { items: [{ videoId: 'test' }] };
    let requests = 0;
    const Api = loadApi('InvidiousApi', { storage, cacheEnabled, fetch: async () => {
        requests++;
        return { ok: true, json: async () => data };
    } });
    assert.equal(await new Api().cachedFetch('http://example/feed', 60, 2), data);
    assert.equal(requests, 1, 'cache errors must not cause a retry');
    return Api;
}

test('disabled cache never accesses storage for reads or writes', async () => {
    await successfulFetch(() => { throw new Error('storage must not be touched'); }, false);
});

test('quota failure preserves a successful response', async () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    await successfulFetch(storage, true);
});

test('inaccessible storage and failed cleanup preserve a successful response', async () => {
    const Api = await successfulFetch(() => { throw new Error('SecurityError'); }, true);
    assert.doesNotThrow(() => Api.clearCache());
});

test('corrupt, expired, null and malformed cache entries fall back to the network', async () => {
    for (const value of ['{bad json', 'null', '{}', JSON.stringify({ __version: 1, timestamp: 0, data: 'stale' })]) {
        const storage = memoryStorage();
        storage.setItem('v1:http://example/feed', value);
        await successfulFetch(storage, true);
    }
});

test('valid cached response avoids the network', async () => {
    const storage = memoryStorage();
    storage.setItem('v1:http://example/feed', JSON.stringify({ __version: 1, timestamp: Date.now(), data: 'cached' }));
    const Api = loadApi('InvidiousApi', { storage, cacheEnabled: true, fetch: () => { throw new Error('unexpected fetch'); } });
    assert.equal(await new Api().cachedFetch('http://example/feed', 60), 'cached');
});

test('clearCache removes only Playlet cache entries', () => {
    const storage = memoryStorage();
    storage.setItem('v1:test', 'cache');
    storage.setItem('theme', 'dark');
    loadApi('InvidiousApi', { storage }).clearCache();
    assert.equal(storage.getItem('v1:test'), null);
    assert.equal(storage.getItem('theme'), 'dark');
});

test('channel, playlist and mix navigation use protected POST and encoded query values', async () => {
    const calls = [];
    const Api = loadApi('PlayletApi', { fetch: async (url, options) => calls.push({ url, options }) });
    await Api.openChannel('channel&extra=1');
    await Api.openPlaylist('PL&list', undefined);
    await Api.openPlaylist('RD&mix', 'video&extra=2');
    assert.equal(calls.length, 3);
    for (const { options } of calls) {
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['X-Playlet'], '1');
    }
    const urls = calls.map(c => new URL(c.url));
    assert.equal(urls[0].searchParams.get('authorId'), 'channel&extra=1');
    assert.equal(urls[1].searchParams.get('playlistId'), 'PL&list');
    assert.equal(urls[2].searchParams.get('playlistId'), 'RD&mix');
    assert.equal(urls[2].searchParams.get('videoId'), 'video&extra=2');
    assert.equal(urls[2].searchParams.has('extra'), false);
});
