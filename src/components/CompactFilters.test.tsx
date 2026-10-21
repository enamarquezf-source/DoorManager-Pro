// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { CompactFilters } from './CompactFilters';
it('starts closed, signals active filters and preserves values when closed',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const reset=vi.fn();
 try {
  await act(async()=>root.render(<CompactFilters count={2} onReset={reset}><label>Desde<input defaultValue="2026-10-01"/></label></CompactFilters>));
  const details=host.querySelector('details')!;expect(details.open).toBe(false);expect(host.textContent).toContain('Filtros2');
  details.open=true;await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Cerrar filtros"]')!.click());expect(details.open).toBe(false);expect(host.querySelector('input')!.value).toBe('2026-10-01');
  details.open=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(details.open).toBe(false);
  details.open=true;document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));expect(details.open).toBe(false);
 } finally {await act(async()=>root.unmount());host.remove();}
});
