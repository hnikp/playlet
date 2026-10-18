// Run on the updated development app after the player suites. Validates that the
// protected web navigation still changes the actual UI and preserves playback.
import { launchVod, odc, check, expectField, expectPred, finish, group, field } from './vpd-player-harness';
const config = require('../tools/get-env-vars')(['ROKU_DEV_TARGET']);
const base = `http://${config.ROKU_DEV_TARGET}:8888`;

async function request(path: string, method = 'GET', body?: unknown) {
    return fetch(base + path, {
        method,
        headers: method === 'GET' ? {} : { 'X-Playlet': '1', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
    });
}

async function stack() {
    const result = await odc.getNodesInfo({ requests: { stack: { base: 'scene', keyPath: '#Stack' } } });
    return result.results.stack.children;
}

(async () => {
    await launchVod('aqz-KE-bpKQ');
    group('web app resources and settings');
    const prefs = await (await request('/api/preferences')).json();
    for (const path of ['/', '/api/home-layout', '/config/preferences.json5', '/config/default_home_layout.yaml',
        '/config/invidious_video_api.yaml', '/config/sponsorblock_config.json5', '/api/bookmarks/feeds', '/api/search-history']) {
        const response = await request(path);
        check(`${path} available`, response.status === 200, response.status);
        await response.arrayBuffer();
    }
    group('search and queue');
    const search = await request('/playlet-invidious-backend/api/v1/search?q=Big%20Buck%20Bunny&type=video');
    const results: any = await search.json();
    check('search returns results', search.ok && (Array.isArray(results) ? results.length > 0 : results.items?.length > 0));
    const added = await request('/api/queue', 'POST', { videoId: 'jNQXAC9IVRw', title: 'Me at the zoo' });
    check('queue accepts a video', added.status === 204);
    // The HTTP task posts a field change; the render thread appends the video asynchronously.
    const queueDeadline = Date.now() + 5000;
    let queued = false;
    let lastQueue: any;
    while (!queued && Date.now() < queueDeadline) {
        const queue: any = await (await request('/api/queue')).json();
        lastQueue = queue;
        // The existing queue DTO uses BrightScript's lowercase JSON keys.
        queued = queue.items?.some((item: any) => item.videoid === 'jNQXAC9IVRw') === true;
        if (!queued) await new Promise(resolve => setTimeout(resolve, 100));
    }
    check('queued video appears within 5 seconds', queued, queued ? undefined : lastQueue);

    group('rejected GET leaves navigation and fullscreen playback unchanged');
    const before = await stack();
    const fullscreen = await field('#VideoContainer.fullscreen');
    const rejected = await request('/api/view/open?authorId=UC_x5XG1OV2P6uZZ5FSM9Ttw');
    check('GET returns 405', rejected.status === 405);
    check('screen stack unchanged', JSON.stringify(await stack()) === JSON.stringify(before));
    await expectField('#VideoContainer.fullscreen', fullscreen);

    group('protected POST opens screens and minimizes playback');
    for (const [query, subtype] of [
        ['authorId=UC_x5XG1OV2P6uZZ5FSM9Ttw', 'ChannelView'],
        ['playlistId=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs', 'PlaylistView'],
        ['playlistId=RDjNQXAC9IVRw&videoId=jNQXAC9IVRw', 'PlaylistView']
    ]) {
        const response = await request('/api/view/open?' + query, 'POST');
        check(`${subtype} POST succeeds`, response.status === 204);
        const children = await stack();
        check(`${subtype} on top of stack`, children.at(-1)?.subtype === subtype);
        if (query.startsWith('playlistId=RD')) {
            await expectField(`#Stack.${children.length - 1}.content.videoId`, 'jNQXAC9IVRw');
        }
    }
    await expectField('#VideoContainer.fullscreen', false);
    await expectPred('#VideoPlayer.width', (width) => width > 0 && width < 1000, 'picture-in-picture width');
    await expectField('#VideoPlayer.state', 'playing');
    check('settings preserved', JSON.stringify(await (await request('/api/preferences')).json()) === JSON.stringify(prefs));
    await finish();
})().catch(async error => {
    console.error(error);
    await odc.shutdown().catch(() => {});
    process.exit(1);
});
