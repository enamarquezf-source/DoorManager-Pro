import { useEffect, useRef, useState } from 'react';
type Api = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Api } }
let loader: Promise<Api> | undefined;
function load() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<Api>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('No disponible'));
    script.onerror = () => { script.remove(); loader = undefined; reject(new Error('No disponible')); };
    document.head.append(script);
  });
  return loader;
}
export function DemoTurnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string) => void; resetKey: number }) {
  const element = useRef<HTMLDivElement>(null); const callback = useRef(onToken); callback.current = onToken;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'verified' | 'failed' | 'expired'>('waiting');
  useEffect(() => {
    let active = true; let widget: string | undefined; let api: Api | undefined;
    callback.current('');
    setStatus('waiting');
    load().then(value => {
      if (!active || !element.current) return;
      api = value;
      widget = value.render(element.current, { sitekey: siteKey, theme: 'light', language: 'es', callback: (token: string) => { if (active) { callback.current(token); setStatus('verified'); } }, 'expired-callback': () => { if (active) { callback.current(''); setStatus('expired'); } }, 'error-callback': () => { if (active) { callback.current(''); setStatus('failed'); } } });
    }).catch(() => { if (active) setStatus('failed'); });
    return () => { active = false; if (widget !== undefined) api?.remove(widget); };
  }, [siteKey, resetKey, attempt]);
  return <div className="demo-captcha"><div ref={element} />{status !== 'verified' && <p role="status">{status === 'failed' ? 'No se ha podido completar la comprobación de acceso. Comprueba la conexión y vuelve a intentarlo.' : status === 'expired' ? 'La comprobación de acceso ha caducado. Verifica de nuevo para entrar.' : 'Comprobando el acceso seguro. Completa la verificación si aparece.'}</p>}{(status === 'failed' || status === 'expired') && <button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar comprobación de acceso</button>}</div>;
}
