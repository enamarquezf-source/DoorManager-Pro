// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext, SuppliersModule, navForWorkspace } from '../App';
import { canAccessModule, canAccessRoute } from '../auth/permissions';

const service = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), savePrimaryBankAccount: vi.fn() }));
vi.mock('../services/suppliersService', () => ({ suppliersService: service }));
vi.mock('../query/useLoad', () => ({ useLoad: () => ({ data: [], loading: false, error: '', reload: vi.fn() }) }));
afterEach(() => vi.resetAllMocks());

it('shows suppliers to all business workspaces and keeps technicians excluded', () => {
 for (const [workspace, role] of [['superadmin','superadmin'], ['sat','SAT'], ['comercial','Comercial'], ['oficina','Oficina'], ['gerencia','Gerencia']] as const) {
  const profile:any = { id:'p', company_id:'c', active:true, roles:[role] };
  expect(navForWorkspace(workspace).filter(item => item.id === 'proveedores')).toHaveLength(1);
  expect(canAccessModule(profile, workspace, 'proveedores')).toBe(true);
  expect(canAccessRoute(profile, '/app/modulos/proveedores')).toBe(true);
 }
 expect(navForWorkspace('tecnico').some(item => item.id === 'proveedores')).toBe(false);
 expect(canAccessRoute({id:'p',active:true,roles:['Tecnico']} as any, '/app/modulos/proveedores')).toBe(false);
});

async function withOfficeForm(run: (dialog: Element) => Promise<void>) {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
 try {
  await act(async()=>root.render(<MemoryRouter><AuthContext.Provider value={{workspace:'oficina',profile:{id:'office',company_id:'c',active:true,roles:['Oficina']}} as any}><SuppliersModule/></AuthContext.Provider></MemoryRouter>));
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Crear proveedor')!.click());
  const dialog = document.body.querySelector('[role="dialog"]')!; expect(dialog).not.toBeNull();
  await run(dialog);
 } finally { await act(async()=>root.unmount()); host.remove(); }
}
async function fill(dialog: Element, label: string, value: string) {
 const input = [...dialog.querySelectorAll('label')].find(element=>element.textContent?.includes(label))!.querySelector('input')!;
 await act(async()=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); });
}
async function submit(dialog: Element) {
 for(let n=0; !dialog.querySelector('.guided-review') && n<10; n++) await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(dialog.querySelector('.guided-review')).not.toBeNull();
 await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
}

it('explains the duplicate code and preserves the draft so the office can correct it', async()=>{
 service.create.mockRejectedValue({code:'23505',message:'duplicate key value violates unique constraint "suppliers_company_internal_code_unique"'});
 await withOfficeForm(async dialog=>{
  await fill(dialog,'Razón social','Proveedor de prueba'); await fill(dialog,'Código interno','PRO-1');
  await submit(dialog);
  expect(service.create).toHaveBeenCalledOnce();
  expect(dialog.textContent).toContain('Ese código interno ya está en uso');
  expect(dialog.querySelector('input')?.value).toBe('Proveedor de prueba');
 });
});
it('creates a supplier from Office without requiring banking details and closes after success', async()=>{
 service.create.mockResolvedValue({id:'supplier',company_id:'c'});
 await withOfficeForm(async dialog=>{
  await fill(dialog,'Razón social','Proveedor sin banco');
  await submit(dialog);
  expect(service.create).toHaveBeenCalledOnce();
  expect(service.savePrimaryBankAccount).not.toHaveBeenCalled();
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
 });
});
it('retries the saved supplier rather than creating it twice if bank-account persistence fails', async()=>{
 const saved = {id:'supplier',company_id:'c'};
 service.create.mockResolvedValue(saved); service.update.mockResolvedValue(saved);
 service.savePrimaryBankAccount.mockRejectedValueOnce(new Error('Bank save failed')).mockResolvedValueOnce({id:'bank'});
 await withOfficeForm(async dialog=>{
  await fill(dialog,'Razón social','Proveedor de prueba'); await fill(dialog,'Titular','Empresa ficticia');
  await submit(dialog);
  expect(dialog.textContent).toContain('La ficha del proveedor está guardada');
  await submit(dialog);
  expect(service.create).toHaveBeenCalledOnce();
  expect(service.update).toHaveBeenCalledWith('supplier',expect.objectContaining({name:'Proveedor de prueba'}));
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
 });
});
