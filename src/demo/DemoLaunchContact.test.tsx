// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DemoLaunchContact } from './DemoLaunchContact';

it('shows contact without sending a message and copies the public link on request', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host);
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  try {
    await act(async () => root.render(<DemoLaunchContact />));
    const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    await act(async () => button('Quiero probar').click());
    expect(host.querySelector('input')?.value).toBe('enamarquezf@gmail.com');
    expect(host.querySelector('form')).toBeNull(); expect(host.querySelector('a')).toBeNull();
    await act(async () => button('Copiar correo').click());
    expect(copy).toHaveBeenLastCalledWith('enamarquezf@gmail.com');
    await act(async () => button('Copiar enlace').click());
    expect(copy).toHaveBeenLastCalledWith('https://demo-doormanager-pro.pages.dev/');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Enlace copiado');
  } finally { await act(async () => root.unmount()); host.remove(); copy.mockRestore(); }
});
