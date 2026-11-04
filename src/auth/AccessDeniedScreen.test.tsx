// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AccessDeniedScreen } from './AccessDeniedScreen';
vi.mock('./AuthRestorationScreen', () => ({ AuthRestorationScreen: () => <p>Comprobando</p> }));

it('rechecks a denied route once, keeps it blocked, and offers retry without logout', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host);
  const retry = vi.fn(async () => {}); const signOut = vi.fn(async () => {});
  try {
    await act(async () => root.render(<AccessDeniedScreen retry={retry} signOut={signOut} home="/app/inicio" homeLabel="Volver al inicio" />));
    expect(retry).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('No tienes permiso');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/app/inicio');
    await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent === 'Reintentar acceso')!.click());
    expect(retry).toHaveBeenCalledTimes(2);
    expect(signOut).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Tu sesión sigue abierta');
  } finally { await act(async () => root.unmount()); }
});
