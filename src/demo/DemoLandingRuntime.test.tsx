// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import DemoLandingRuntime from './DemoLandingRuntime';

const calls = vi.hoisted(() => ({
  application: vi.fn(), ready: vi.fn(async () => true),
  getSession: vi.fn(async () => ({ data: { session: null as any }, error: null })),
  start: vi.fn(async (role: string) => ({ id: 'landing-visitor', role })),
}));
vi.mock('./service', () => ({ publicDemoService: calls }));
vi.mock('../lib/supabase/client', () => ({ supabase: { auth: { getSession: calls.getSession } } }));
vi.mock('../ApplicationRuntime', () => {
  calls.application();
  return { default: () => <main>Aplicación completa</main> };
});
vi.mock('./Turnstile', () => ({ DemoTurnstile: ({ onToken }: any) => <button onClick={() => onToken('token')}>Verificar prueba</button> }));

afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); });

it('shows roles before importing the application and retains the selection after a failed start', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('VITE_DEMO_TURNSTILE_SITE_KEY', 'test-site');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const button = (text: string) => [...host.querySelectorAll('button')].find(node => node.textContent === text)!;
  try {
    await act(async () => { root.render(<DemoLandingRuntime />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelectorAll('input[type=radio]')).toHaveLength(5);
    expect(calls.application).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLInputElement>('input[value=Tecnico]')!.click());
    await act(async () => button('Verificar prueba').click());
    calls.start.mockRejectedValueOnce(new Error('Conexión interrumpida'));
    await act(async () => button('Probar DMP').click());
    expect(host.textContent).toContain('Conexión interrumpida');
    expect(host.querySelector<HTMLInputElement>('input[value=Tecnico]')!.checked).toBe(true);
    expect(calls.application).not.toHaveBeenCalled();
    await act(async () => button('Verificar prueba').click());
    await act(async () => button('Probar DMP').click());
    expect(host.textContent).toBe('Aplicación completa');
    expect(window.location.pathname).toBe('/app/tecnico');
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('resumes an existing session without creating a new visitor', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  calls.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'test-only' } }, error: null });
  const starts = calls.start.mock.calls.length;
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => { root.render(<DemoLandingRuntime />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toBe('Aplicación completa');
    expect(calls.start.mock.calls.length).toBe(starts);
  } finally { await act(async () => root.unmount()); }
});
