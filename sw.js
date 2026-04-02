const VERSION = "1.0.0";

const CACHE_NAME = `finances-${VERSION}`;

const APP_STATIC_RESOURCES = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/finances.json",
  "/icons/512.png",
];

// Runs every time PWA is opened
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            cache.addAll(APP_STATIC_RESOURCES);
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                    return undefined;
                }),
            );
            await clients.claim();
        })(),
    );

    // Tell all open tabs the current SW version
    self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_VERSION', version: CACHE_NAME }));
    });
});


//Intercept fetch requests
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Pass through non-GET requests — must use respondWith to avoid spec violation
    if (e.request.method !== 'GET') {
        e.respondWith(fetch(e.request));
        return;
    }

    // Always network-first for external URLs
    if (url.hostname !== self.location.hostname) {
        e.respondWith(
            fetch(e.request).catch(() => new Response('', { status: 503 }))
        );
        return;
    }

    // Skip Cloudflare Access auth paths — never cache
    if (url.pathname.includes('/cdn-cgi/') || url.searchParams.has('code')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Cache-first for local assets
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) 
                return cached;
                
            return fetch(e.request).then(res => {
                if (res.ok && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            });
        }).catch(() => caches.match('/index.html'))
    );
});