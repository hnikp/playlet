// Run against the updated development app, after the Roku unit suites.
// Exercises real TCP framing and middleware; does not change accounts or preferences.
const assert = require('node:assert/strict');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const config = require('../tools/get-env-vars')(['ROKU_DEV_TARGET']);
const host = config.ROKU_DEV_TARGET;
const port = 8888;
const MAX = 2097152;
const sockets = new Set();

function socket() {
    const s = net.createConnection({ host, port });
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    return s;
}

function exchange(parts, timeout = 12000) {
    return new Promise((resolve, reject) => {
        const s = socket();
        let response = '';
        s.setTimeout(timeout, () => s.destroy(new Error('HTTP response timed out')));
        s.on('data', data => response += data.toString());
        s.on('error', error => response.startsWith('HTTP/1.1 413') ? resolve(response) : reject(error));
        s.on('end', () => resolve(response));
        s.on('connect', async () => {
            try {
                for (const part of parts) {
                    if (s.destroyed) break;
                    s.write(part);
                    if (parts.length > 1) await delay(60);
                }
            } catch (error) { s.destroy(error); }
        });
    });
}

function status(response) {
    assert.match(response, /^HTTP\/1\.1 \d{3}/, 'expected an HTTP response');
    return Number(response.slice(9, 12));
}

function header(method, route, bodyLength = 0, csrf = false) {
    return `${method} ${route} HTTP/1.1\r\nHost: roku\r\nConnection: close\r\nContent-Length: ${String(bodyLength).padStart(10, '0')}\r\n${csrf ? 'X-Playlet: 1\r\n' : ''}\r\n`;
}

function sizedRequest(size) {
    const length = size - header('GET', '/api/state?key=device').length;
    return header('GET', '/api/state?key=device', length) + 'x'.repeat(length);
}

async function check(label, fn) {
    await fn();
    console.log(`PASS ${label}`);
}

async function main() {
    await check('old GET navigation rejected; POST requires CSRF; valid POST remains available', async () => {
        assert.equal(status(await exchange([header('GET', '/api/view/open?authorId=UC_x5XG1OV2P6uZZ5FSM9Ttw')])), 405);
        assert.equal(status(await exchange([header('POST', '/api/view/open?authorId=UC_x5XG1OV2P6uZZ5FSM9Ttw')])), 403);
        // Empty navigation input is rejected by the protected handler, not the CSRF guard.
        assert.equal(status(await exchange([header('POST', '/api/view/open', 0, true)])), 400);
    });
    await check('state requests and concurrent reads remain responsive', async () => {
        const start = Date.now();
        const results = await Promise.all(Array.from({ length: 4 }, () => exchange([header('GET', '/api/state?key=app')])));
        results.forEach(result => assert.equal(status(result), 200));
        assert.ok(Date.now() - start < 4000, 'state reads stalled the server');
    });
    await check('requests below and exactly at the limit succeed', async () => {
        for (const size of [MAX - 1, MAX]) {
            const request = sizedRequest(size);
            assert.equal(Buffer.byteLength(request), size);
            assert.equal(status(await exchange([request])), 200);
        }
    });
    await check('oversized complete request and fragmented declarations get 413', async () => {
        assert.equal(status(await exchange([sizedRequest(MAX + 1)])), 413);
        const text = header('GET', '/api/state', MAX);
        assert.equal(status(await exchange([text.slice(0, 25), text.slice(25)])), 413);
        assert.equal(status(await exchange([text.replace(String(MAX).padStart(10, '0'), '999999999999999999999999')])), 413);
    });
    await check('oversized final receive is rejected; fragmented legal body succeeds', async () => {
        const legal = sizedRequest(MAX);
        assert.equal(status(await exchange([legal.slice(0, -1), legal.slice(-1) + 'x'])), 413);
        assert.equal(status(await exchange([legal.slice(0, -10), legal.slice(-10)])), 200);
    });
    await check('oversized unterminated headers get 413', async () => {
        assert.equal(status(await exchange(['GET / HTTP/1.1\r\nHost: ' + 'x'.repeat(MAX)])), 413);
    });
    await check('channel, playlist and mix POST navigation succeed', async () => {
        for (const query of [
            'authorId=UC_x5XG1OV2P6uZZ5FSM9Ttw',
            'playlistId=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs',
            'playlistId=RDjNQXAC9IVRw&videoId=jNQXAC9IVRw'
        ]) assert.equal(status(await exchange([header('POST', '/api/view/open?' + query, 0, true)])), 204);
    });
    await check('browser keep-alive requests release their slots when the response says close', async () => {
        for (let i = 0; i < 25; i++) {
            const request = header('GET', '/api/state?key=device').replace('Connection: close', 'Connection: keep-alive');
            const response = await exchange([request]);
            assert.equal(status(response), 200);
            assert.match(response, /Connection: close/i);
        }
    });
    await check('active connections capped, existing clients work, timeout releases capacity', async () => {
        const held = [];
        for (let i = 0; i < 10; i++) {
            const s = socket();
            s.setTimeout(45000, () => s.destroy(new Error('held connection timed out')));
            s.on('error', () => {});
            await new Promise((resolve, reject) => {
                s.once('connect', resolve);
                s.once('error', reject);
            });
            s.write('GET /api/state?key=device HTTP/1.1\r\n');
            held.push(s);
        }
        await delay(500);
        await new Promise((resolve, reject) => {
            const extra = socket();
            const timer = setTimeout(() => { extra.destroy(); reject(new Error('excess connection not closed')); }, 4000);
            extra.once('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
            extra.once('close', () => { clearTimeout(timer); resolve(); });
        });
        const first = held.shift();
        assert.ok(!first.destroyed, 'an existing connection was unexpectedly closed');
        const response = await new Promise((resolve, reject) => {
            let text = '';
            first.on('data', data => text += data.toString());
            first.once('end', () => resolve(text));
            first.once('error', reject);
            first.write('Host: roku\r\nConnection: close\r\n\r\n');
        });
        assert.equal(status(response), 200);
        assert.equal(status(await exchange([header('GET', '/api/state?key=device')])), 200);
        // Keep the remaining clients idle and verify the server, rather than the client, times them out.
        await delay(32000);
        assert.ok(held.every(s => s.destroyed), 'idle connections were not released');
        assert.equal(status(await exchange([header('GET', '/api/state?key=device')])), 200);
    });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    for (const s of sockets) s.destroy();
});
