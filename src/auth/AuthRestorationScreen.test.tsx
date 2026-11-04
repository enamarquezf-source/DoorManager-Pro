// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AuthRestorationScreen } from './AuthRestorationScreen';
vi.mock('../shared/manualAppUpdate', () => ({ requestManualAppUpdate: vi.fn() }));
vi.mock('../shared/versioning', () => ({ currentBuild: { version: 'test' } }));

it('offers recovery instead of leaving an endless restoration message', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.createElement('div'); const root = createRoot(host);
  const retry = vi.fn(); const update = vi.fn();
  try {
    await act(async () => root.render(<AuthRestorationScreen retry={retry} update={update} />));
    expect(host.textContent).toContain('Restaurando sesión');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(host.textContent).toContain('cambios pendientes siguen guardados');
    const buttons = host.querySelectorAll('button');
    await act(async () => buttons[0].click());
    await act(async () => buttons[1].click());
    expect(retry).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); vi.useRealTimers(); }
});
