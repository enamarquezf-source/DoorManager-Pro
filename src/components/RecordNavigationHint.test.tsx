// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { RecordNavigationHint } from './RecordNavigationHint';

function CurrentLocation() { return <output>{useLocation().pathname}</output>; }

it('opens the record through a native link while its editing action stays independent', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const edit = vi.fn();
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/app/inicio']}>
      <article className="record-surface"><strong>Parte PAR-44</strong>
        <RecordNavigationHint to="/app/partes/44" label="Parte PAR-44" />
        <div className="record-surface-actions"><button onClick={edit}>Editar</button></div>
      </article><CurrentLocation />
    </MemoryRouter>));
    const link = host.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/app/partes/44');
    expect(link.getAttribute('aria-label')).toBe('Parte PAR-44');
    expect(link.querySelector('button')).toBeNull();
    await act(async () => host.querySelector('button')!.click());
    expect(edit).toHaveBeenCalledOnce();
    expect(host.querySelector('output')!.textContent).toBe('/app/inicio');
    // Modified link gestures keep the native browser destination without SPA navigation.
    await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, cancelable: true })));
    expect(host.querySelector('output')!.textContent).toBe('/app/inicio');
    await act(async () => link.click());
    expect(host.querySelector('output')!.textContent).toBe('/app/partes/44');
    expect(edit).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('uses a real button for a local detail and respects its disabled state', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host); const open = vi.fn();
  try {
    const render = (disabled: boolean) => root.render(<article className="record-surface">
      <RecordNavigationHint label="Borrador de cliente" onOpen={open} disabled={disabled} />
    </article>);
    await act(async () => render(true));
    const button = host.querySelector('button')!;
    expect(button.type).toBe('button');
    await act(async () => button.click());
    expect(open).not.toHaveBeenCalled();
    await act(async () => render(false));
    await act(async () => button.click());
    expect(open).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});
