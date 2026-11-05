export function offlineWorkerSource(cache: string, files: string[]) {
  return `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
const ONLINE_CACHE_PREFIX = 'dmp-shell-online-';
const isLegacyCache = name => name.startsWith('dmp-shell-') && !name.startsWith(ONLINE_CACHE_PREFIX);
self.addEventListener('install', event => event.waitUntil((async () => {
  const existing = await caches.keys();
  await (await caches.open(CACHE)).addAll(FILES);
  // Retire the cache-first worker even if a browser restores its old tabs.
  if (existing.some(isLegacyCache) && !existing.some(name => name !== CACHE && name.startsWith(ONLINE_CACHE_PREFIX))) {
    await self.skipWaiting();
  }
})()));
// Updates wait until existing tabs close so an in-progress form is never reloaded.
self.addEventListener('message', event => {
  if (event.data?.type === 'DMP_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'DMP_SHELL_INFO') event.ports?.[0]?.postMessage({ cache: CACHE });
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  const replacingOnlineWorker = names.some(name => name !== CACHE && name.startsWith(ONLINE_CACHE_PREFIX));
  for (const name of names) {
    if (name !== CACHE && name.startsWith('dmp-shell-') && (replacingOnlineWorker || !isLegacyCache(name))) {
      await caches.delete(name);
    }
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/actualizar.html' || url.pathname === '/actualizar' || url.pathname === '/build-info.json' || url.pathname === '/sw.js' || url.pathname === '/update-shell.js') return;
  const navigation = event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/app' || url.pathname.startsWith('/app/'));
  const asset = url.pathname.startsWith('/assets/');
  if (!navigation && !asset && !FILES.includes(url.pathname)) return;
  event.respondWith((async () => {
    let networkResponse;
    let networkError;
    if (navigation) {
      try {
        networkResponse = await fetch(event.request, {
          cache: 'no-cache',
          signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
        });
        if (networkResponse.status < 500) return networkResponse;
      } catch (error) {
        networkError = error;
      }
    }
    let stored = await caches.open(CACHE)
      .then(cache => cache.match(navigation ? '/index.html' : url.pathname))
      .catch(() => undefined);
    // A tab opened before the migration may still import its original chunks.
    if (!stored && asset && !navigation) stored = await caches.match(url.pathname).catch(() => undefined);
    if (!stored && networkError) throw networkError;
    const response = stored || networkResponse || await fetch(event.request);
    // Pages redirects /index.html to /. A redirected cached response cannot be
    // returned for a navigation whose redirect mode is manual (Fetch network error).
    // Rebuild only the navigation response; retain its HTML and response headers.
    return navigation && response.redirected
      ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
      : response;
  })());
});
`;
}
