// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { DashboardList } from '../App';
it('Ver todos opens the list even when empty, never an arbitrary detail or home',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter><DashboardList title="Facturas" rows={[["FAC-1","Ejemplo","info","/app/partes/one"]]} empty="Sin facturas" allRoute="/app/modulos/facturacion"/></MemoryRouter>));
  expect([...host.querySelectorAll('a')].find(a=>a.textContent==='Ver todos')?.getAttribute('href')).toBe('/app/modulos/facturacion');
  await act(async()=>root.render(<MemoryRouter><DashboardList title="Facturas" rows={[]} empty="Sin facturas" allRoute="/app/modulos/facturacion"/></MemoryRouter>));
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/app/modulos/facturacion');
  await act(async()=>root.render(<MemoryRouter><DashboardList title="Sin listado" rows={[]} empty="Sin datos"/></MemoryRouter>));
  expect(host.querySelector('a')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
