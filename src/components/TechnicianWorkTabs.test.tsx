// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TechnicianWorkTabs, type TechnicianWorkTab } from './TechnicianWorkTabs';

function Harness({ staged = false }: { staged?: boolean }) {
  const [active, setActive] = useState<TechnicianWorkTab>('work');
  return <TechnicianWorkTabs staged={staged} active={active} onChange={setActive} panels={[
    { id: 'work', label: 'Trabajo', detail: 'Intervención', icon: null, content: <textarea aria-label="Trabajo realizado" defaultValue="" /> },
    { id: 'checks', label: 'Checks', detail: '0/2', icon: null, content: <a href="/app/checks/check">Equipo</a> },
    { id: 'records', label: 'Registros', detail: 'Horas y material', icon: null, content: <input aria-label="Duración" defaultValue="" /> },
    { id: 'close', label: 'Cierre', detail: 'Firma', icon: null, content: <canvas aria-label="Firma del cliente" /> },
  ]} />;
}
afterEach(() => vi.unstubAllGlobals());

it('shows one mobile section at a time and preserves text and the signature canvas across navigation', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    const panels = () => [...host.querySelectorAll<HTMLDivElement>('[role="tabpanel"]')];
    const visible = () => panels().filter(panel => !panel.hidden);
    expect(panels()).toHaveLength(4); expect(visible()).toHaveLength(1);
    const text = host.querySelector('textarea')!; text.value = 'Motor revisado. Falta ajustar el final de carrera.';
    const canvas = host.querySelector('canvas')!; canvas.dataset.strokes = 'existing-signature';
    await act(async () => host.querySelector<HTMLButtonElement>('[data-tab="close"]')!.click());
    expect(visible()).toHaveLength(1); expect(visible()[0].contains(canvas)).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-tab="checks"]')!.click());
    expect(visible()[0].querySelector('a')?.getAttribute('href')).toBe('/app/checks/check');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-tab="work"]')!.click());
    expect(host.querySelector('textarea')).toBe(text);
    expect(text.value).toContain('Motor revisado');
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(canvas.dataset.strokes).toBe('existing-signature');
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('separates field work from reporting and remembers each stage without resetting forms', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness staged />));
    const visibleTabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter(button => !button.hidden).map(button => button.dataset.tab);
    expect(visibleTabs()).toEqual(['work', 'checks']);
    const hours = host.querySelector('input')!; hours.value = '90';
    const signature = host.querySelector('canvas')!;
    await act(async () => host.querySelector<HTMLButtonElement>('.technician-stage-switch [data-stage="report"]')!.click());
    expect(visibleTabs()).toEqual(['records', 'close']);
    expect(host.querySelector('[data-tab="records"]')?.getAttribute('aria-selected')).toBe('true');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-tab="close"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.technician-stage-switch [data-stage="field"]')!.click());
    expect(visibleTabs()).toEqual(['work', 'checks']);
    await act(async () => host.querySelector<HTMLButtonElement>('.technician-stage-next')!.click());
    expect(host.querySelector('[data-tab="close"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('input')).toBe(hours);
    expect(hours.value).toBe('90');
    expect(host.querySelector('canvas')).toBe(signature);
    expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('supports keyboard navigation with linked tab and panel semantics', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    const tab = (name: string) => host.querySelector<HTMLButtonElement>(`[data-tab="${name}"]`)!;
    await act(async () => tab('work').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(tab('checks').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('checks'));
    const panel = document.getElementById(tab('checks').getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('checks').id);
    expect(panel.hidden).toBe(false);
    await act(async () => tab('checks').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(tab('close').tabIndex).toBe(0);
    await act(async () => tab('close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(tab('work').getAttribute('aria-selected')).toBe('true');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
