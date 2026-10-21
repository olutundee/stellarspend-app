const CACHE_NAME = 'stellarspend-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/favicon.ico',
    '/globals.css',
    '/vercel.svg',
];

// Install event: Precache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Precaching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all open pages immediately
    self.clients.claim();
});

// Fetch event: Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request)
                    .then((networkResponse) => {
                        // Update the cache with the fresh response
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // If network fails, the cached response (if any) will be returned
                        console.log('[Service Worker] Network failed, serving from cache');
                    });

                return cachedResponse || fetchedResponse;
            });
        })
    );
});
