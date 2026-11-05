// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AuthContext, ClientsPage } from '../App';
vi.mock('../query/useLoad', () => ({ useLoad: () => ({ data: [{ id: 'one', legal_name: 'Empresa Uno', code: 'CLI-1', status: 'Activo' }, { id: 'two', legal_name: 'Empresa Dos', code: 'CLI-2', status: 'Activo' }], loading: false, error: '', reload: vi.fn() }) }));

it('identifies each clickable client by its own company name for assistive navigation', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<MemoryRouter><AuthContext.Provider value={{ workspace: 'sat' } as any}><ClientsPage /></AuthContext.Provider></MemoryRouter>));
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a[aria-labelledby]')];
    expect(links).toHaveLength(2);
    expect(links.map(link => document.getElementById(link.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['Empresa Uno', 'Empresa Dos']);
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/app/clientes/one', '/app/clientes/two']);
    for (const link of links) expect(document.getElementById(link.getAttribute('aria-describedby')!)?.textContent).toContain('Código');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
