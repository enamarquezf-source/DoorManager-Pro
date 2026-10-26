// @vitest-environment happy-dom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {useLocation} from 'react-router-dom';
import {it,expect,vi,afterEach} from 'vitest';
import type {DemoTour} from './model';
import {DemoGuide,PublicDemoBoundary} from './PublicDemoBoundary';
const mocks=vi.hoisted(()=>({progress:vi.fn(async()=>({clients:0})),session:vi.fn(),journeysAvailable:vi.fn(),prepareJourney:vi.fn()}));
vi.mock('./service',()=>({publicDemoService:mocks}));
const session:any={id:'demo',role:'SAT',work_order_id:null};
afterEach(()=>{vi.clearAllMocks();mocks.progress.mockResolvedValue({clients:0});localStorage.clear();document.body.innerHTML='';});
it('automatically advances after a new record is saved without needing a Next click',async()=>{
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
it('requires an explicit successful role change before opening another role mission and can minimize without advancing',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let allowed=false;
 const onRole=vi.fn(async()=>allowed);
 function Harness(){const location=useLocation();return <><output>{location.pathname}</output><DemoGuide session={session} tour="discover" progress={{step:0,open:true}} setProgress={()=>{}} onRole={onRole}/></>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/inicio']}><Harness/></MemoryRouter>));
  expect(onRole).not.toHaveBeenCalled();
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
  expect(host.querySelector('output')?.textContent).toBe('/app/inicio');
  allowed=true;
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
  expect(host.querySelector('output')?.textContent).toBe('/app/tecnico');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Reducir')!.click());
  expect(host.querySelector('[aria-label="Guía reducida"]')).not.toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-mini button')!.click());
  expect(host.querySelector('h2')?.textContent).toBe('Un aviso, tres equipos');
 }finally{await act(async()=>root.unmount());host.remove();localStorage.clear();}
});

it('can pause automatic progression and never treats seeded records as newly saved',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);mocks.progress.mockResolvedValue({clients:12});
function Harness(){const[p,setP]=useState({step:0,open:true});return <DemoGuide session={session} progress={p} setProgress={setP} onRole={async()=>{}}/>;}
try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Crea tu primer cliente');
await act(async()=>host.querySelector<HTMLButtonElement>('.demo-auto-toggle')!.click());mocks.progress.mockResolvedValue({clients:13});await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.querySelector('h2')?.textContent).toBe('Crea tu primer cliente');
await act(async()=>host.querySelector<HTMLButtonElement>('.demo-auto-toggle')!.click());expect(host.querySelector('h2')?.textContent).toBe('Añade el centro de trabajo');
}finally{await act(async()=>root.unmount());host.remove();}});
it('waits for an open form to close before advancing and retracts the panel while editing',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
function Harness(){const[p,setP]=useState({step:0,open:true});return <DemoGuide session={session} progress={p} setProgress={setP} onRole={async()=>{}}/>;}
try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));const dialog=document.createElement('div');dialog.setAttribute('role','dialog');await act(async()=>document.body.append(dialog));
expect(host.querySelector('[aria-label="Guía reducida"]')).not.toBeNull();mocks.progress.mockResolvedValue({clients:1});await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.textContent).toContain('Crea tu primer cliente');
await act(async()=>dialog.remove());expect(host.querySelector('h2')?.textContent).toBe('Añade el centro de trabajo');
}finally{await act(async()=>root.unmount());host.remove();}});

it('recognizes an app action before React changes the button label on that same click',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
function Harness(){const[p,setP]=useState({step:3,open:true});const[open,setOpen]=useState(false);return <><main><button onClick={()=>setOpen(!open)}>{open?'Ocultar calendario':'Ver calendario'}</button></main><DemoGuide session={{...session,role:'Gerencia'}} tour="discover" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('h2')?.textContent).toBe('Entiende el margen');}finally{await act(async()=>root.unmount());host.remove();}});

it('opens the indicated creation form directly rather than requiring a second tutorial click',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const create=vi.fn();
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/clientes']}><main><button onClick={create}>Crear cliente</button></main><DemoGuide session={session} progress={{step:0,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));const target=host.querySelector<HTMLButtonElement>('main button')!;target.getClientRects=()=>[{width:100,height:40}] as any;await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(create).toHaveBeenCalledOnce();expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Crear cliente');}finally{await act(async()=>root.unmount());host.remove();}});
it('never records a payment by clicking a matching financial action automatically',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const pay=vi.fn();
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/modulos/facturacion']}><main><button onClick={pay}>Registrar cobro</button></main><DemoGuide session={{...session,role:'Oficina'}} progress={{step:3,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));const target=host.querySelector<HTMLButtonElement>('main button')!;target.getClientRects=()=>[{width:100,height:40}] as any;target.scrollIntoView=vi.fn();await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(pay).not.toHaveBeenCalled();expect(target.scrollIntoView).toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}});
