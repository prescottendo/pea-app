// Huddle's service worker, copied into dist/app/sw.js by web/build.mjs (which fills in BUILD).
// It keeps the app's own files on the phone, so Huddle opens at once and even with no signal, and it never touches
// calls to Google (the Apps Script back end, sign-in, fonts): those always go to the network.
//
// Updates: each build has its own cache ("huddle-<build>"). The browser notices a new sw.js, this worker downloads the
// new files and then waits. The page applies it straight away when the app was only just opened, or shows
// "Update Ready · Reload"; Reload sends "skip-waiting".

const BUILD = "943157e";
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
