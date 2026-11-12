// Huddle's service worker, copied into dist/app/sw.js by web/build.mjs (which fills in BUILD).
// It keeps the app's own files on the phone, so Huddle opens at once and even with no signal, and it never touches
// calls to Google (the Apps Script back end, sign-in, fonts): those always go to the network.
//
// Updates: each build has its own cache ("huddle-<build>"). The browser notices a new sw.js, this worker downloads the
// new files and then waits. The page applies it straight away when the app was only just opened, or shows
// "Update Ready · Reload"; Reload sends "skip-waiting".

const BUILD = "fc7cf09";
const CACHE = 'huddle-' + BUILD;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's own HTTP cache, so a new version never stores an old copy of a file.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.indexOf('huddle-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

// Push notifications (Nov 12). Huddle's server sends data-only messages through Firebase Cloud Messaging:
// { data: { title, body, url, tag } }. Every push must show a notification (iPhone turns push off for apps that don't).
self.addEventListener('push', event => {
  let d = {};
  try { const j = event.data ? event.data.json() : {}; d = j.data || j.notification || j || {}; }
  catch (err) { d = { body: event.data ? event.data.text() : '' }; }
  const opts = { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' } };
  if (d.tag === 'meeting') opts.tag = 'huddle-meeting';   // a newer "meeting started" replaces the old one
  event.waitUntil(self.registration.showNotification(d.title || 'Huddle', opts));
});

// Tapping one opens Huddle where it points (a task, the live meeting, My Tasks). An open Huddle window is reused: it gets a
// message and goes there without reloading; otherwise Huddle opens at that address. Only Huddle's own addresses are used.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url = self.registration.scope;
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope);
    if (u.href.indexOf(self.registration.scope) === 0) url = u.href;
  } catch (err) {}
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (win) { win.postMessage({ type: 'open-url', url: url }); return win.focus ? win.focus() : null; }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.href.indexOf(self.registration.scope) !== 0) return;
  if (req.mode === 'navigate') {
    // Every address inside the app (?view=review, ?meeting=…) opens the same page; it reads the address itself.
    event.respondWith(caches.open(CACHE)
      .then(cache => cache.match('index.html'))
      .then(hit => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.open(CACHE)
    .then(cache => cache.match(req, { ignoreSearch: true }))
    .then(hit => hit || fetch(req)));
});
