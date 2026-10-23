export function offlineWorkerSource(cache: string, files: string[]) {
  return `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
// Updates wait until existing tabs close so an in-progress form is never reloaded.
self.addEventListener('message', event => {
  if (event.data?.type === 'DMP_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'DMP_SHELL_INFO') event.ports?.[0]?.postMessage({ cache: CACHE });
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('dmp-shell-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/actualizar.html' || url.pathname === '/actualizar' || url.pathname === '/build-info.json' || url.pathname === '/sw.js' || url.pathname === '/update-shell.js') return;
  const navigation = event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/app' || url.pathname.startsWith('/app/'));
  if (!navigation && !FILES.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const stored = await cache.match(navigation ? '/index.html' : url.pathname);
    const response = stored || await fetch(event.request);
    // Pages redirects /index.html to /. A redirected cached response cannot be
    // returned for a navigation whose redirect mode is manual (Fetch network error).
    // Rebuild only the navigation response; retain its HTML and response headers.
    return navigation && response.redirected
      ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
      : response;
  }).catch(() => fetch(event.request)));
});
`;
}
