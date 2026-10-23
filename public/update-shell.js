// Kept outside the app bundle so an old installed app can still update itself.
export async function publishedShellCache(fetcher = fetch) {
  const response = await fetcher(`/sw.js?check=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('No se ha podido comprobar la versión publicada.');
  const source = await response.text();
  const match = source.match(/const CACHE = ("[^"\n]+");/);
  if (!match) throw new Error('La versión publicada no contiene un arranque offline válido.');
  return JSON.parse(match[1]);
}

export function verifyActiveShell(registration, expectedCache, makeChannel = () => new MessageChannel()) {
  return new Promise((resolve, reject) => {
    const worker = registration.active;
    if (!worker) { reject(new Error('La nueva versión todavía no está activa.')); return; }
    const channel = makeChannel();
    const finish = (error) => {
      clearTimeout(timer); channel.port1.close(); channel.port2.close();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('La actualización no se ha confirmado. Guarda tu trabajo, cierra las otras pestañas de DMP y vuelve a intentarlo.')), 4000);
    channel.port1.onmessage = event => {
      finish(event.data?.cache === expectedCache ? null : new Error('Sigue activa una versión anterior. Vuelve a pulsar Actualizar DMP.'));
    };
    try { worker.postMessage({ type: 'DMP_SHELL_INFO' }, [channel.port2]); }
    catch (error) { finish(error); }
  });
}
