// kau. — Service Worker（オフラインでも開けるようにする）
// ファイルを更新したら VERSION を変更すること。

const VERSION = 'kau-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/utils.js',
  './js/icons.js',
  './js/ui.js',
  './js/seed.js',
  './js/actions.js',
  './js/views/list.js',
  './js/views/editor.js',
  './js/views/history.js',
  './js/views/product-detail.js',
  './js/views/manage.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// キャッシュをすぐ返し、裏で最新版を取得して更新する
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate';
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = isPage
      ? (await cache.match('./index.html')) || (await cache.match('./'))
      : await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          cache.put(isPage ? './index.html' : req, res.clone());
        }
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
