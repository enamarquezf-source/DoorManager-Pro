import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { offlineWorkerSource } from './workerSource';

it('reopens deep routes and loads assets from the installed shell without a network', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const contents = new Map<string, any>();
  const cache = { addAll: async (urls: string[]) => { for (const url of urls) contents.set(url, `downloaded:${url}`); }, match: async (url: string) => contents.get(url) };
  const fetch = vi.fn(() => { throw new Error('Offline'); });
  runInNewContext(offlineWorkerSource('dmp-shell-test', ['/index.html', '/assets/app.js']), { self: { location: { origin: 'https://dmp.test' }, clients: { claim: vi.fn() }, addEventListener: (name: string, callback: any) => { handlers[name] = callback; } }, caches: { open: async () => cache, keys: async () => [], delete: vi.fn() }, fetch, URL });
  let installed!: Promise<void>;
  handlers.install({ waitUntil: (promise: any) => { installed = promise; } });
  await installed;
  for (const [path, mode, expected] of [['/app/checks/check/bloque/motor', 'navigate', '/index.html'], ['/assets/app.js', 'cors', '/assets/app.js']]) {
    let response: any;
    handlers.fetch({ request: { url: `https://dmp.test${path}`, method: 'GET', mode }, respondWith: (promise: any) => { response = promise; } });
    expect(await response).toBe(`downloaded:${expected}`);
  }
  expect(fetch).not.toHaveBeenCalled();
  // Private APIs and signed Storage URLs must never enter the shared shell cache.
  const respondWith = vi.fn();
  handlers.fetch({ request: { url: 'https://project.supabase.co/rest/v1/profiles', method: 'GET' }, respondWith });
  handlers.fetch({ request: { url: 'https://dmp.test/api/private', method: 'GET' }, respondWith });
  handlers.fetch({ request: { url: 'https://dmp.test/actualizar.html', method: 'GET', mode: 'navigate' }, respondWith });
  handlers.fetch({ request: { url: 'https://dmp.test/actualizar', method: 'GET', mode: 'navigate' }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});

it('serves Cloudflare redirected cached HTML as a non-redirected navigation response', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const stored = new Response('<main>DMP offline</main>', { headers: { 'Content-Type': 'text/html', 'X-DMP': 'preserved' } });
  Object.defineProperty(stored, 'redirected', { value: true });
  Object.defineProperty(stored, 'url', { value: 'https://dmp.test/' });
  const fetch = vi.fn(() => { throw new Error('Offline'); });
  runInNewContext(offlineWorkerSource('dmp-shell-test', ['/index.html']), {
    self: { location: { origin: 'https://dmp.test' }, addEventListener: (name: string, callback: any) => { handlers[name] = callback; } },
    caches: { open: async () => ({ match: async () => stored }) }, fetch, URL, Response,
  });
  let result!: Promise<Response>;
  handlers.fetch({ request: { url: 'https://dmp.test/app/superadmin/sincronizacion', method: 'GET', mode: 'navigate', redirect: 'manual' }, respondWith: (promise: Promise<Response>) => { result = promise; } });
  const response = await result;
  expect(response.redirected).toBe(false);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('text/html');
  expect(response.headers.get('X-DMP')).toBe('preserved');
  expect(await response.text()).toBe('<main>DMP offline</main>');
  expect(fetch).not.toHaveBeenCalled();
});

it('falls back to the server when the device shell cache is unavailable', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const fetch = vi.fn(async () => new Response('DMP online'));
  runInNewContext(offlineWorkerSource('dmp-shell-test', ['/index.html']), {
    self: { location: { origin: 'https://dmp.test' }, addEventListener: (name: string, callback: any) => { handlers[name] = callback; } },
    caches: { open: async () => { throw new Error('Storage unavailable'); } }, fetch, URL, Response,
  });
  let result!: Promise<Response>;
  const request = { url: 'https://dmp.test/app/inicio', method: 'GET', mode: 'navigate' };
  handlers.fetch({ request, respondWith: (promise: Promise<Response>) => { result = promise; } });
  expect(await (await result).text()).toBe('DMP online');
  expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
});

it('activates an update only after the explicit update message', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const skipWaiting = vi.fn(async () => undefined);
  runInNewContext(offlineWorkerSource('dmp-shell-test', []), {
    self: { skipWaiting, addEventListener: (name: string, callback: any) => { handlers[name] = callback; } },
    caches: { open: async () => ({ addAll: async () => undefined }) },
  });
  await new Promise<void>(resolve => handlers.install({ waitUntil: async (promise: Promise<void>) => { await promise; resolve(); } }));
  expect(skipWaiting).not.toHaveBeenCalled();
  const waitUntil = vi.fn();
  handlers.message({ data: { type: 'UNRELATED' }, waitUntil });
  expect(waitUntil).not.toHaveBeenCalled();
  handlers.message({ data: { type: 'DMP_ACTIVATE_UPDATE' }, waitUntil });
  expect(skipWaiting).toHaveBeenCalledOnce();
  await waitUntil.mock.calls[0][0];
});

it('never intercepts version checks or updater files, even when present in the precache manifest',()=>{
 const handlers:Record<string,(event:any)=>void>={};
 const paths=['/build-info.json','/sw.js','/update-shell.js','/actualizar.html'];
 runInNewContext(offlineWorkerSource('dmp-shell-current',paths),{self:{location:{origin:'https://dmp.test'},addEventListener:(name:string,fn:any)=>{handlers[name]=fn;}},URL});
 for(const path of paths){const respondWith=vi.fn();handlers.fetch({request:{url:'https://dmp.test'+path+'?ts=123',method:'GET'},respondWith});expect(respondWith).not.toHaveBeenCalled();}
 const postMessage=vi.fn();handlers.message({data:{type:'DMP_SHELL_INFO'},ports:[{postMessage}]});
 expect(postMessage).toHaveBeenCalledExactlyOnceWith({cache:'dmp-shell-current'});
});
