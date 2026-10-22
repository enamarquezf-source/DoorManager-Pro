let shellReady: Promise<boolean> | undefined;
export function prepareOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return Promise.resolve(false);
  shellReady ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No se ha podido preparar el arranque offline.')), 45_000); }),
      ]);
      return true;
    } catch { shellReady = undefined; return false; }
    finally { clearTimeout(timer); }
  })();
  return shellReady;
}
void prepareOfflineShell();
