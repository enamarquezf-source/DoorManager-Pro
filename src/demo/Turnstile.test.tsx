// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DemoTurnstile } from './Turnstile';

it('explains failed or expired verification and requires a new token after retry', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host);
  const token = vi.fn(); const callbacks: Record<string, any>[] = [];
  const remove = vi.fn();
  window.turnstile = { render: (_element, options) => { callbacks.push(options); return String(callbacks.length); }, remove };
  try {
    await act(async () => root.render(<DemoTurnstile siteKey="test" onToken={token} resetKey={0} />));
    await act(async () => callbacks[0].callback('first-token'));
    expect(token).toHaveBeenLastCalledWith('first-token');
    await act(async () => callbacks[0]['error-callback']());
    expect(token).toHaveBeenLastCalledWith('');
    expect(host.textContent).toContain('No se ha podido completar');
    await act(async () => host.querySelector('button')!.click());
    expect(remove).toHaveBeenCalledWith('1');
    expect(token).toHaveBeenLastCalledWith('');
    await act(async () => callbacks[0].callback('obsolete-token'));
    expect(token).toHaveBeenLastCalledWith('');
    await act(async () => callbacks[1]['expired-callback']());
    expect(host.textContent).toContain('ha caducado');
    await act(async () => callbacks[1].callback('fresh-token'));
    expect(token).toHaveBeenLastCalledWith('fresh-token');
    expect(host.querySelector('button')).toBeNull();
  } finally { await act(async () => root.unmount()); delete window.turnstile; }
});
