import { useEffect, useRef } from 'react';
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
  useEffect(() => {
    let active = true; let widget: string | undefined; let api: Api | undefined;
    callback.current('');
    load().then(value => {
      if (!active || !element.current) return;
      api = value;
      widget = value.render(element.current, { sitekey: siteKey, theme: 'light', language: 'es', callback: (token: string) => callback.current(token), 'expired-callback': () => callback.current(''), 'error-callback': () => callback.current('') });
    }).catch(() => { if (active && element.current) element.current.textContent = 'No se ha podido cargar la comprobación de acceso. Recarga la página para reintentar.'; });
    return () => { active = false; if (widget !== undefined) api?.remove(widget); };
  }, [siteKey, resetKey]);
  return <div className="demo-captcha" ref={element} />;
}
