// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect,it,vi } from 'vitest';
import { CollectionsBoard } from './CollectionsBoard';
import { localDateKey } from '../shared/localDate';
import { addCollectionDays } from '../shared/collectionsOverview';
it('keeps the calendar optional, filters urgency and opens explicit payment registration',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const pay=vi.fn();const today=localDateKey();
 const invoices=[{id:'late',code:'F-1',status:'emitida',total_amount:100,paid_amount:20,due_date:addCollectionDays(today,-3),clients:{legal_name:'Empresa con retraso'}},{id:'future',code:'F-2',status:'emitida',total_amount:200,paid_amount:0,due_date:addCollectionDays(today,10),clients:{legal_name:'Empresa futura'}}];
 try {
  await act(async()=>root.render(<MemoryRouter><CollectionsBoard invoices={invoices} loading={false} onOpen={()=>{}} onPay={pay} paymentVisibility={()=>({canOpenPayment:true,recovery:false})}/></MemoryRouter>));
  expect(host.querySelector<HTMLElement>('.collections-calendar')!.hidden).toBe(true);
  await act(async()=>host.querySelector<HTMLButtonElement>('.collections-display-tools button')!.click());expect(host.querySelector<HTMLElement>('.collections-calendar')!.hidden).toBe(false);
  await act(async()=>host.querySelector<HTMLButtonElement>('.collections-kpi.bucket-overdue')!.click());expect(host.querySelectorAll('.collections-invoice')).toHaveLength(1);expect(host.querySelector('.collections-invoice')!.textContent).toContain('3 días de retraso');expect(pay).not.toHaveBeenCalled();
  await act(async()=>host.querySelector<HTMLButtonElement>('.collections-invoice .primary')!.click());expect(pay).toHaveBeenCalledWith(invoices[0]);
 } finally {await act(async()=>root.unmount());host.remove();}
});
it('does not display a false zero-balance success when loading fails',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);
 try {await act(async()=>root.render(<MemoryRouter><CollectionsBoard invoices={[]} loading={false} error="Sin conexión" onOpen={()=>{}} onPay={()=>{}} paymentVisibility={()=>({canOpenPayment:false,recovery:false})}/></MemoryRouter>));expect(host.textContent).toContain('No se han podido consultar');expect(host.textContent).not.toContain('No hay facturas pendientes');}finally{await act(async()=>root.unmount());}
});
