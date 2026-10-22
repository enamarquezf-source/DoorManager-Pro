// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AppearancePreferences } from './AppearancePreferences';
import { useUserAppearance } from '../shared/useUserAppearance';
import { applyAppearance, appearanceKey } from '../shared/appearance';

const first = { id: 'user-a', company_id: 'company' };
function Harness({ profile, onClose }: { profile: typeof first | null; onClose: () => void }) {
  const appearance = useUserAppearance(profile);
  return profile ? <AppearancePreferences name={profile.id} theme={appearance.theme} stored={appearance.stored} onChoose={appearance.choose} onClose={onClose} /> : null;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); applyAppearance('dmp'); });

it('previews and saves a choice, restores it on reopening and isolates the next user', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const close = vi.fn();
  try {
    const render = (profile: typeof first | null) => root.render(<Harness profile={profile} onClose={close} />);
    await act(async () => render(first));
    expect(document.querySelectorAll('[type="radio"]')).toHaveLength(5);
    const choose = async (id: string) => act(async () => document.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.click());
    await choose('blue');
    expect(document.documentElement.dataset.dmpTheme).toBe('blue');
    expect(localStorage.getItem(appearanceKey({ companyId: 'company', profileId: first.id }))).toBe('blue');
    await act(async () => render({ id: 'user-b', company_id: 'company' }));
    expect(document.documentElement.dataset.dmpTheme).toBeUndefined();
    await act(async () => render(first));
    expect(document.querySelector<HTMLInputElement>('input[value="blue"]')!.checked).toBe(true);
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Restaurar verde DMP')!.click());
    expect(document.documentElement.dataset.dmpTheme).toBeUndefined();
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Listo')!.click());
    expect(close).toHaveBeenCalledOnce();
    await act(async () => render(null));
    expect(document.documentElement.dataset.dmpTheme).toBeUndefined();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('reports a blocked save while keeping the selected colour usable for the session', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness profile={first} onClose={() => undefined} />));
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Full'); } });
    await act(async () => document.querySelector<HTMLInputElement>('input[value="sand"]')!.click());
    expect(document.documentElement.dataset.dmpTheme).toBe('sand');
    expect(document.querySelector('[role="status"]')!.textContent).toContain('no ha permitido guardar');
  } finally { await act(async () => root.unmount()); }
});
