const CACHE_NAME = "rj-notes-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.html",
  "/login.html",
  "/signup.html",
  "/styles.css",
  "/landing.css",
  "/app.js",
  "/cloud.js",
  "/auth.js",
  "/capture.js",
  "/transcript-import.js",
  "/assemblyai-stream.js",
  "/hindi-recorder.js",
  "/manifest.webmanifest",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function shouldBypassCache(request) {
  const url = new URL(request.url);
  if (request.method !== "GET") return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.endsWith("firebase-config.js")) return true;
  if (url.pathname.endsWith("firebase-config.local.js")) return true;
  if (url.origin.includes("gstatic.com")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (shouldBypassCache(event.request)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
