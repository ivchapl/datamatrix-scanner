// Offline support: each release precaches its full set of files under its own
// version and the app is served from that set only. A new release arrives as a
// whole with the next sw.js (bump VERSION on every release), so files of
// different releases never mix.
// Several copies of the app can share the ivchapl.github.io origin (/v2/, /orgs/),
// so every cache name carries this worker's scope.
const SCOPE = self.registration.scope;
const VERSION = "dm-orgs-1.1.1@" + SCOPE;
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "xlsx.js",
  "worker.js",
  "vendor/zxing-reader.js",
  "zxing_reader.wasm",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener("install", (e) => {
  // cache: "reload" skips the HTTP cache so a new version never precaches stale files.
  // addAll is all-or-nothing: if one file fails, the previous release stays in charge.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("dm-") && k.endsWith("@" + SCOPE) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  if (sameOrigin && !url.href.startsWith(SCOPE)) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      let cached = await cache.match(req, sameOrigin ? MATCH : { ignoreVary: true });
      // Any page address inside the app (with or without index.html, with a query) opens the app.
      if (!cached && req.mode === "navigate") cached = await cache.match("index.html", MATCH);
      if (cached) return cached;
      const res = await fetch(req);
      // Fonts are not part of the release, so they are kept as they arrive.
      if (isFont && res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    })
  );
});
