// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect,it,vi } from 'vitest';
import { PlanningCalendar } from './PlanningCalendar';
import { localDateKey } from '../shared/localDate';
it('opens the selected day, filters technician agendas and programs the chosen date',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const create=vi.fn(),assign=vi.fn();const today=localDateKey();
 const work={id:'one',title:'Revisar motor',client_name:'Cliente ejemplo',scheduled_date:today,status:'Pendiente',current_responsible_id:'sales',responsible:{first_name:'Carlos',primary_area:'Comercial'},assignments:[{id:'a',assignment_date:today,technician_id:'ana',planned_start_time:'09:00',profiles:{first_name:'Ana'}}]};
 try{
 const render=async(canAssign:boolean)=>act(async()=>root.render(<MemoryRouter><PlanningCalendar works={[work]} technicians={[{id:'ana',first_name:'Ana'},{id:'leo',first_name:'Leo'}]} canCreate={canAssign} canAssign={canAssign} onCreate={create} onAssign={assign}/></MemoryRouter>));
 await render(true);
 expect(host.querySelector('.planning-agenda')?.textContent).toContain('09:00');
 expect(host.querySelector('.planning-agenda a')?.getAttribute('href')).toBe('/app/partes/one');
 expect(host.querySelector('.planning-agenda')?.textContent).toContain('Leo');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Reprogramar / asignar')!.click());
 expect(assign).toHaveBeenCalledWith(work,today);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Programar trabajo'))!.click());expect(create).toHaveBeenCalledWith(today);
 const select=host.querySelector('select')!;
 await act(async()=>{select.value='commercial';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('.planning-agenda')?.textContent).toContain('Carlos · Comercial');
 expect(host.querySelector('.planning-agenda')?.textContent).not.toContain('Ana · Técnico');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Programar visita comercial')!.click());expect(create).toHaveBeenCalledWith(today,true);
 await act(async()=>{select.value='leo';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('.planning-agenda')?.textContent).not.toContain('Revisar motor');
 expect(host.querySelector('.planning-agenda')?.textContent).toContain('Sin trabajos programados');
 await render(false);expect([...host.querySelectorAll('button')].some(b=>b.textContent?.includes('Programar trabajo'))).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();}
});
