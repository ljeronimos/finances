const VERSION = '1.0.1';
const CACHE_NAME = `finances-${VERSION}`;

const APP_STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/finances.json',
    '/icons/512.png',
];

self.addEventListener('install', event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(APP_STATIC_RESOURCES);
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Pass through non-GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network-first for external URLs (fonts, APIs)
    if (url.hostname !== self.location.hostname) {
        event.respondWith(
            fetch(event.request).catch(() => new Response('', { status: 503 }))
        );
        return;
    }

    // Skip Cloudflare auth paths — never cache
    if (url.pathname.includes('/cdn-cgi/') || url.searchParams.has('code')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network-first for Pages Functions API calls — always want fresh data
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => new Response(
                JSON.stringify({ error: 'Offline' }), 
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }

    // Cache-first for all other local assets
    event.respondWith(
        (async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;

            try {
                const res = await fetch(event.request);
                if (res.ok && res.type === 'basic') {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, res.clone());
                }
                return res;
            } catch {
                return await caches.match('/index.html');
            }
        })()
    );
});

// Background sync — flush queued offline expenses (Chrome/Android only)
self.addEventListener('sync', event => {
    if (event.tag === 'pending-expenses') {
        event.waitUntil(flushPending());
    }
});

async function flushPending() {
    const db = await openDB();
    const pending = await getAllPending(db);
    for (const item of pending) {
        try {
            const res = await fetch(item.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: item.body,
            });
            if (res.ok) await deletePending(db, item.id);
        } catch (_) { /* will retry on next sync */ }
    }
}

// ── IndexedDB helpers (mirrored in app.js for Firefox fallback) ──

function openDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('expenses-offline', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}

function getAllPending(db) {
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readonly');
        const req = tx.objectStore('pending').getAll();
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}

function deletePending(db, id) {
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readwrite');
        const req = tx.objectStore('pending').delete(id);
        req.onsuccess = res;
        req.onerror = rej;
    });
}
