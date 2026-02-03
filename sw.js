const CACHE_NAME = "img2dmg-cache-v1";
const BASE_URL = new URL(self.registration.scope).pathname;
const withBase = (path) => new URL(path, self.registration.scope).pathname;
const APP_SHELL = [
    BASE_URL,
    withBase("index.html"),
    withBase("manifest.webmanifest"),
    withBase("icons/icon-192.svg"),
    withBase("icons/icon-512.svg")
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(BASE_URL, copy));
                    return response;
                })
                .catch(() => caches.match(BASE_URL))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
