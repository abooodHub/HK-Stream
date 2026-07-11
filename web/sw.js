/* H&K Stream — Service Worker
 * استراتيجية محافظة لموقع بثّ حيّ:
 *  - الصفحات (navigate): الشبكة أولاً → عند الفشل: نسخة مخزّنة → offline.html
 *  - الأصول الثابتة (css/js/أيقونات/خطوط): stale-while-revalidate
 *  - يُتجاوَز كلياً (شبكة فقط، بلا تخزين): /tracker-api/ و /stream/ و /api/ وأي طلب غير GET
 * لرفع إصدار: غيّر SHELL_VERSION فقط.
 */
const SHELL_VERSION = 'v7';
const SHELL_CACHE  = 'hk-shell-' + SHELL_VERSION;
const ASSET_CACHE  = 'hk-assets-' + SHELL_VERSION;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/matches.html',
  '/offline.html',
  '/css/common.css?v=1',
  '/css/player.css?v=7',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// مسارات لا تُخزَّن أبداً (بيانات حيّة / بثّ / مصادقة)
const BYPASS = ['/tracker-api/', '/stream/', '/api/'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      // لا تُفشِل التثبيت لو تعذّر أصل واحد
      Promise.allSettled(SHELL_ASSETS.map((u) => c.add(u)))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // لا تتدخّل في POST/DELETE
  const url = new URL(req.url);

  // تجاوز كامل للبثّ والـAPI — شبكة فقط
  if (url.origin === self.location.origin && BYPASS.some((p) => url.pathname.startsWith(p))) return;

  // صفحات التنقّل: الشبكة أولاً، ثم المخزّن، ثم offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // أصول ثابتة same-origin: stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
  }
  // خطوط/CDN خارجية: تُترك للمتصفّح (شبكة + كاش HTTP عادي)
});
