// @vitest-environment happy-dom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi,afterEach} from 'vitest';
import type {DemoTour} from './model';
import {DemoGuide,PublicDemoBoundary} from './PublicDemoBoundary';
const mocks=vi.hoisted(()=>({progress:vi.fn(async()=>({clients:0})),session:vi.fn(),journeysAvailable:vi.fn(),prepareJourney:vi.fn()}));
vi.mock('./service',()=>({publicDemoService:mocks}));
const session:any={id:'demo',role:'SAT',work_order_id:null};
afterEach(()=>{vi.clearAllMocks();mocks.progress.mockResolvedValue({clients:0});});
it('stays on the task after saving and advances only when Next is pressed',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[progress,setProgress]=useState({step:0,open:true});return <DemoGuide session={session} progress={progress} setProgress={setProgress} onRole={async()=>{}}/>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/clientes']}><Harness/></MemoryRouter>));
  expect(host.querySelector('aside')?.getAttribute('data-expanded')).toBe('false');
  expect(host.querySelector('h2')?.textContent).toBe('Crea tu primer cliente');
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-expand')!.click());
  expect(host.querySelector('aside')?.getAttribute('data-expanded')).toBe('true');
  expect(host.querySelector('h2')?.textContent).toBe('Crea tu primer cliente');
  mocks.progress.mockResolvedValue({clients:1});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('h2')?.textContent).toBe('Crea tu primer cliente');
  expect(host.textContent).toContain('Acción guardada. Pulsa Siguiente paso');
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Siguiente paso')!.click());
  expect(host.querySelector('h2')?.textContent).toBe('Añade el centro de trabajo');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('offers the next role explicitly rather than changing permissions automatically',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);const onRole=vi.fn(async()=>{});
 try{
  await act(async()=>root.render(<MemoryRouter><DemoGuide session={session} progress={{step:4,open:true}} setProgress={()=>{}} onRole={onRole}/></MemoryRouter>));
  expect(onRole).not.toHaveBeenCalled();
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
  expect(onRole).toHaveBeenCalledExactlyOnceWith('Tecnico');
 }finally{await act(async()=>root.unmount());}
});
it('refreshes the initial role without redirecting a check deep link to the home page',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const own:any={...session,id:'test-session',profile_id:'profile',expires_at:new Date(Date.now()+600000).toISOString(),ended:false};
 mocks.session.mockResolvedValue(own);mocks.journeysAvailable.mockResolvedValue(true);mocks.prepareJourney.mockResolvedValue(own);
 const host=document.createElement('div');const root=createRoot(host);const onRoleChanged=vi.fn(async()=>{});
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/checks/example']}><PublicDemoBoundary userId="visitor" onRoleChanged={onRoleChanged} onFinish={async()=>{}}><main>Revisión abierta</main></PublicDemoBoundary></MemoryRouter>));
  expect(onRoleChanged).toHaveBeenCalledExactlyOnceWith(own,false);
  expect(host.textContent).toContain('Revisión abierta');
 }finally{await act(async()=>root.unmount());localStorage.clear();}
});
it('makes the procurement tour selectable without forcing users through the invoicing tour',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);
 function Harness(){const[tour,setTour]=useState<DemoTour>('work');return <DemoGuide session={{...session,role:'Oficina'}} progress={{step:0,open:true}} setProgress={()=>{}} onRole={async()=>{}} tour={tour} onTour={setTour}/>;}
 try{
 await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));
 expect(host.querySelector('h2')?.textContent).toBe('Recibe un trabajo revisado');
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Materiales y compras')!;
 await act(async()=>button.click());
 expect(host.querySelector('h2')?.textContent).toBe('Crea un material');
 expect(button.getAttribute('aria-pressed')).toBe('true');
 }finally{await act(async()=>root.unmount());}
});
