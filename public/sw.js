/*
 * ilikepdfs service worker: lets the tools work without internet.
 * - /build and /vendor files (scripts, styles, fonts, engines) are kept the first time they are used.
 * - Pages are loaded from the network, and from the saved copy when offline.
 * - "Save for offline use" stores every page and every engine in one go.
 */
const STATIC = 'ilikepdfs-static';
const PAGES = 'ilikepdfs-pages';
const META = 'ilikepdfs-meta';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/sw.js' || url.pathname === '/offline-assets.json') {
        return;
    }

    if (/^\/(build|vendor|icons)\//.test(url.pathname)) {
        event.respondWith(cacheFirst(request));

        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstPage(request));

        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
    const cache = await caches.open(STATIC);
    const hit = await cache.match(request);

    if (hit) {
        return hit;
    }

    const response = await fetch(request);

    if (response.ok) {
        cache.put(request, response.clone());
    }

    return response;
}

async function networkFirstPage(request) {
    const cache = await caches.open(PAGES);
    const key = new URL(request.url).pathname.replace(/\/$/, '') || '/';

    try {
        const response = await fetch(request);

        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
            cache.put(key, response.clone());
        }

        // Too many requests or a server error: the saved copy is better than an error page.
        if (response.status === 429 || response.status >= 500) {
            const saved = await cache.match(key);

            if (saved) {
                return saved;
            }
        }

        return response;
    } catch {
        return (await cache.match(key))
            ?? new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline</title><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>You are offline</h1><p>This page was not saved. Open ilikepdfs once while online and press "Save for offline use" in the footer, then every tool works without internet.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(STATIC);
    const hit = await cache.match(request);
    const refresh = fetch(request).then((response) => {
        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    }).catch(() => hit);

    return hit ?? refresh;
}

async function savedVersion() {
    const response = await (await caches.open(META)).match('/__version');

    return response ? response.text() : null;
}

async function precache(client) {
    try {
        const listing = await (await fetch('/offline-assets.json', { cache: 'no-store' })).json();
        const statics = await caches.open(STATIC);
        const pages = await caches.open(PAGES);
        const jobs = [...listing.pages.map((path) => ({ path, cache: pages, key: path })), ...listing.assets.map((path) => ({ path, cache: statics, key: path }))];
        let done = 0;
        let failed = 0;

        for (let start = 0; start < jobs.length; start += 4) {
            await Promise.all(jobs.slice(start, start + 4).map(async (job) => {
                try {
                    if (job.cache === statics && await statics.match(job.path)) {
                        return;
                    }

                    let response = await fetch(job.path, { cache: 'reload' });

                    // If the site asks us to slow down, wait a moment and try once more.
                    if (response.status === 429) {
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                        response = await fetch(job.path, { cache: 'reload' });
                    }

                    if (response.ok) {
                        await job.cache.put(job.key, response);
                    } else {
                        failed += 1;
                    }
                } catch {
                    failed += 1;
                }
            }));

            done = Math.min(jobs.length, start + 4);
            client?.postMessage({ type: 'progress', done, total: jobs.length });
        }

        // Forget files from older builds.
        const wanted = new Set(listing.assets);

        for (const request of await statics.keys()) {
            const path = new URL(request.url).pathname;

            if (/^\/(build|vendor)\//.test(path) && !wanted.has(path) && !path.startsWith('/vendor/tesseract/lang/')) {
                await statics.delete(request);
            }
        }

        if (failed === 0) {
            await (await caches.open(META)).put('/__version', new Response(listing.version));
        }

        client?.postMessage({ type: failed === 0 ? 'done' : 'failed', failed, version: listing.version });
    } catch {
        client?.postMessage({ type: 'failed', failed: -1 });
    }
}

self.addEventListener('message', (event) => {
    if (event.data?.type === 'precache') {
        event.waitUntil(precache(event.source));
    }

    if (event.data?.type === 'status') {
        event.waitUntil((async () => {
            let current = null;

            try {
                current = (await (await fetch('/offline-assets.json', { cache: 'no-store' })).json()).version;
            } catch {
                current = null;
            }

            event.source?.postMessage({ type: 'status', saved: (await savedVersion()) !== null, upToDate: current !== null && current === await savedVersion() });
        })());
    }
});
