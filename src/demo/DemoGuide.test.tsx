// @vitest-environment happy-dom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Link,MemoryRouter} from 'react-router-dom';
import {useLocation} from 'react-router-dom';
import {it,expect,vi,afterEach} from 'vitest';
import {demoTourSteps,type DemoTour} from './model';
import {DemoGuide,PublicDemoBoundary} from './PublicDemoBoundary';
const mocks=vi.hoisted(()=>({progress:vi.fn<(...args:any[])=>Promise<Record<string,number>>>(async()=>({clients:0})),session:vi.fn(),journeysAvailable:vi.fn(),prepareJourney:vi.fn()}));
vi.mock('./service',()=>({publicDemoService:mocks}));
const session:any={id:'demo',role:'SAT',work_order_id:null};

it('does not poll the server every two seconds while the mission is only reading',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter><DemoGuide session={{...session,role:'Oficina'}} progress={{step:0,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));
  expect(mocks.progress).toHaveBeenCalledTimes(1);
  await act(async()=>vi.advanceTimersByTimeAsync(10000));
  expect(mocks.progress).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());vi.useRealTimers();}
});

it('follows a deliberate sidebar visit to billing without marking skipped tasks as saved',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[progress,setProgress]=useState({step:0,open:true});return <><aside className="sidebar"><nav><a href="/app/modulos/facturacion" onClick={e=>e.preventDefault()}>Facturación</a></nav></aside><DemoGuide session={{...session,role:'Oficina'}} progress={progress} setProgress={setProgress} onRole={async()=>{}}/></>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/inicio']}><Harness/></MemoryRouter>));
  expect(host.textContent).toContain('Recibe un trabajo revisado');
  await act(async()=>host.querySelector<HTMLAnchorElement>('.sidebar a')!.click());
  expect(host.querySelector('.demo-guide h2')?.textContent??host.textContent).toContain('Prepara la factura');
  expect(localStorage.getItem('dmp-demo-evidence')).toBeNull();
 }finally{await act(async()=>root.unmount());}
});
afterEach(()=>{vi.clearAllMocks();mocks.progress.mockResolvedValue({clients:0});localStorage.clear();document.body.innerHTML='';});
it.each([390,576,760])('starts collapsed at %ipx and returns to the bar after dismissing the instructions',async(width)=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('innerWidth',width);
 const host=document.createElement('div');
 document.body.append(host);
 const root=createRoot(host);
 try {
  await act(async()=>root.render(<MemoryRouter><DemoGuide session={session} progress={{step:0,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));
  expect(host.querySelector('.demo-guide-mini')?.textContent).toContain('Crea tu primer cliente');
  expect(host.querySelector('.demo-guide-v2')).toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-mini button')!.click());
  expect(host.querySelector('.demo-guide-v2 h2')?.textContent).toBe('Crea tu primer cliente');
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-expand')!.click());
  expect(host.querySelector('.demo-guide-mini')).not.toBeNull();
 } finally {
  await act(async()=>root.unmount());
  host.remove();
  vi.unstubAllGlobals();
 }
});
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

it('prepares the next mission when the calendar opens without leaving collections',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
function Harness(){const location=useLocation();const[p,setP]=useState({step:10,open:true});const[open,setOpen]=useState(false);return <><main><button onClick={()=>setOpen(!open)}>{open?'Ocultar calendario':'Ver calendario'}</button><section className="collections-calendar" hidden={!open}/><output>{location.pathname}</output></main><DemoGuide session={{...session,role:'Gerencia'}} tour="discover" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/modulos/cobros']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('main button')?.textContent).toBe('Ocultar calendario');expect(host.querySelector('output')?.textContent).toBe('/app/modulos/cobros');expect(host.querySelector('.collections-calendar')?.hasAttribute('hidden')).toBe(false);expect(host.querySelector('h2')?.textContent).toBe('Compara margen y costes');}finally{await act(async()=>root.unmount());host.remove();}});

it('opens the indicated creation form directly rather than requiring a second tutorial click',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const create=vi.fn();
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/clientes']}><main><button onClick={create}>Crear cliente</button></main><DemoGuide session={session} progress={{step:0,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));const target=host.querySelector<HTMLButtonElement>('main button')!;target.getClientRects=()=>[{width:100,height:40}] as any;await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(create).toHaveBeenCalledOnce();expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Crear cliente');}finally{await act(async()=>root.unmount());host.remove();}});
it('never records a payment by clicking a matching financial action automatically',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const pay=vi.fn();
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/modulos/facturacion']}><main><button onClick={pay}>Registrar cobro</button></main><DemoGuide session={{...session,role:'Oficina'}} progress={{step:3,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));const target=host.querySelector<HTMLButtonElement>('main button')!;target.getClientRects=()=>[{width:100,height:40}] as any;target.scrollIntoView=vi.fn();await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(pay).not.toHaveBeenCalled();expect(target.scrollIntoView).toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}});
it('waits for the destination action instead of consuming a loading page heading',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const create=vi.fn();let reveal:()=>void=()=>{};
function Harness(){const location=useLocation();const[loaded,setLoaded]=useState(false);reveal=()=>setLoaded(true);return <><main>{location.pathname==='/app/centros'?<><header className="page-head">Centros</header>{loaded&&<button onClick={create}>Crear centro</button>}</>:<header className="page-head">Clientes</header>}</main><DemoGuide session={session} progress={{step:1,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
const original=HTMLElement.prototype.getClientRects;HTMLElement.prototype.getClientRects=function(){return [{width:100,height:40}] as any;};
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/clientes']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(create).not.toHaveBeenCalled();expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Preparando');await act(async()=>reveal());expect(create).toHaveBeenCalledOnce();}finally{HTMLElement.prototype.getClientRects=original;await act(async()=>root.unmount());host.remove();}});
it('continues after confirmed economic approval on the same work page',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let approve:()=>void=()=>{};
function Harness(){const[p,setP]=useState({step:12,open:true});const[approved,setApproved]=useState(false);approve=()=>setApproved(true);return <><main><section data-economic-review={approved?'approved':'pending'}/></main><DemoGuide session={{...session,role:'Oficina'}} tour="connected" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/partes/work']}><Harness/></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Comprueba los conceptos');await act(async()=>approve());expect(host.querySelector('h2')?.textContent).toBe('Prepara la factura');}finally{await act(async()=>root.unmount());host.remove();}});
it('finishes the study mission only after persistence confirms success',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
function Harness(){const[p,setP]=useState({step:18,open:true});return <><main><button>Guardar estudio</button></main><DemoGuide session={{...session,role:'Gerencia'}} tour="connected" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('h2')?.textContent).toBe('Haz un estudio de costes');await act(async()=>window.dispatchEvent(new CustomEvent('dmp-cost-study-saved')));expect(host.querySelector('h2')?.textContent).toBe('Del aviso al resultado');}finally{await act(async()=>root.unmount());host.remove();}});

it.each([
 ['Comercial',1,'Prepara un presupuesto','dmp-quote-line-saved','Registra el envío del presupuesto'],
] as const)('advances %s only when the operation confirms persistence',async(role,step,title,event,next)=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step,open:true});return <><main><button>Guardar</button></main><DemoGuide session={{...session,role}} tour="work" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
 try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('h2')?.textContent).toBe(title);await act(async()=>window.dispatchEvent(new CustomEvent(event)));expect(host.querySelector('h2')?.textContent).toBe(next);expect(host.querySelector('aside')?.getAttribute('data-finale')).toBe('false');}finally{await act(async()=>root.unmount());host.remove();}
});

it('retracts the mobile guide while reviewing results and lets the visitor reopen help',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('innerWidth',390);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<MemoryRouter><main><div data-demo-check-results><button>Todo favorable</button></div></main><DemoGuide session={{...session,role:'Tecnico',work_order_id:'work'}} progress={{step:2,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></MemoryRouter>));expect(host.querySelector('[aria-label="Guía reducida"]')?.textContent).toContain('Elige el resultado de este bloque');await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-mini button')!.click());expect(host.querySelector('h2')?.textContent).toBe('Revisa los componentes');}finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('waits for the matching persisted quote transition, not another status or a click',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step:2,open:true});return <DemoGuide session={{...session,role:'Comercial'}} progress={p} setProgress={setP} onRole={async()=>{}}/>;}
 try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Registra el envío del presupuesto');await act(async()=>window.dispatchEvent(new CustomEvent('dmp-quote-status-saved',{detail:{status:'Borrador'}})));expect(host.querySelector('h2')?.textContent).toBe('Registra el envío del presupuesto');await act(async()=>window.dispatchEvent(new CustomEvent('dmp-quote-status-saved',{detail:{status:'Enviado'}})));expect(host.querySelector('h2')?.textContent).toBe('Simula la aceptación del cliente');await act(async()=>window.dispatchEvent(new CustomEvent('dmp-quote-status-saved',{detail:{status:'Aceptado'}})));expect(host.querySelector('h2')?.textContent).toBe('Convierte el presupuesto en trabajo');expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Generar parte del presupuesto');}finally{await act(async()=>root.unmount());host.remove();}
});

it('hands the commercial work to SAT at assignment instead of restarting client creation',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const setProgress=vi.fn();const onRole=vi.fn(async()=>true);
 try{await act(async()=>root.render(<MemoryRouter><DemoGuide session={{...session,role:'Comercial',work_order_id:'work'}} progress={{step:5,open:true}} setProgress={setProgress} onRole={onRole}/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(onRole).toHaveBeenCalledWith('SAT',{step:3,route:'/app/partes/work'});expect(setProgress).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});

it('persists the destination mission before refreshing the profile during a commercial to SAT handoff',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const own:any={...session,id:'handoff-session',role:'Comercial',profile_id:'commercial-profile',company_id:'company',work_order_id:'work',expires_at:new Date(Date.now()+600000).toISOString(),ended:false};
 mocks.session.mockResolvedValue(own);mocks.journeysAvailable.mockResolvedValue(true);mocks.prepareJourney.mockImplementation(async(role:string)=>({...own,role,profile_id:role+'-profile'}));
 localStorage.setItem('dmp-demo-tour:handoff-session:Comercial:work',JSON.stringify({step:5,open:true}));
 const changed=vi.fn(async(next:any)=>{if(next.role==='SAT')expect(JSON.parse(localStorage.getItem('dmp-demo-tour:handoff-session:SAT:work')!)).toEqual({step:3,open:true});});
 try{await act(async()=>root.render(<MemoryRouter><PublicDemoBoundary userId="visitor" onRoleChanged={changed} onFinish={async()=>{}}><main/></PublicDemoBoundary></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Coordina la ejecución con SAT');await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(host.querySelector('h2')?.textContent).toBe('Asigna el técnico');expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({role:'SAT'}),false);}finally{await act(async()=>root.unmount());host.remove();}
});

it('continues the standalone office tour when the loaded economic review is already approved',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step:1,open:true});return <><main><section data-economic-review="approved"/></main><DemoGuide session={{...session,role:'Oficina'}} tour="work" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
 try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/partes/work']}><Harness/></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Prepara la factura');}finally{await act(async()=>root.unmount());host.remove();}
});

it('opens Registro from the checks view for connected mission 9 rather than pointing at the field tabs',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const original=HTMLElement.prototype.getClientRects;HTMLElement.prototype.getClientRects=function(){return [{width:100,height:40}] as any;};const focus=vi.spyOn(HTMLElement.prototype,'focus');
 function Harness(){const location=useLocation();return <><output>{location.search}</output><main><nav className="technician-work-tabs">{location.search==='?vista=records'?'Registro':'En campo'}</nav>{location.search==='?vista=records'&&<textarea aria-label="Trabajo realizado" className="technician-work-textarea"/>}</main><DemoGuide session={{...session,role:'Tecnico',work_order_id:'work'}} tour="connected" progress={{step:7,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
 try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/tecnico/trabajo/work?vista=checks']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(host.querySelector('output')?.textContent).toBe('?vista=records');expect(host.querySelector('textarea')).not.toBeNull();expect(focus).toHaveBeenCalled();}finally{HTMLElement.prototype.getClientRects=original;focus.mockRestore();await act(async()=>root.unmount());host.remove();}
});

it('keeps the closure on the technician work currently opened rather than the initial example',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const location=useLocation();return <><output>{location.pathname+location.search}</output><main><div className="technician-close-review">Resumen de cierre</div></main><DemoGuide session={{...session,role:'Tecnico',work_order_id:'initial-example'}} tour="connected" progress={{step:10,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
 const original=HTMLElement.prototype.getClientRects;HTMLElement.prototype.getClientRects=function(){return [{width:100,height:40}] as any;};const scroll=vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
 try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/tecnico/trabajo/current-work?vista=records']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(host.querySelector('output')?.textContent).toBe('/app/tecnico/trabajo/current-work?vista=close');expect(mocks.progress).toHaveBeenCalledWith(expect.anything(),'completed_work','current-work');}finally{HTMLElement.prototype.getClientRects=original;scroll.mockRestore();await act(async()=>root.unmount());host.remove();}
});

it('keeps the quick tour on the check until an equipment review is finished',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 mocks.progress.mockResolvedValue({checks:0,work_checks:3});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[progress,setProgress]=useState({step:1,open:true});return <DemoGuide session={{...session,role:'Tecnico',work_order_id:'own'}} progress={progress} setProgress={setProgress} onRole={async()=>{}} tour="discover"/>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/checks/first']}><Harness/></MemoryRouter>));
  expect(host.querySelector('h2')?.textContent).toBe('Revisión componente a componente');
  expect(host.textContent).toContain('Marca Todo favorable');
  mocks.progress.mockResolvedValue({checks:1,work_checks:3});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('h2')?.textContent).toBe('Explica el trabajo realizado');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('waits for payment on the supplier invoice currently displayed rather than another invoice',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step:6,open:true});return <DemoGuide session={{...session,role:'Oficina'}} progress={p} setProgress={setP} onRole={async()=>{}} tour="purchases"/>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/modulos/facturas-proveedor?id=own']}><Harness/></MemoryRouter>));
  await act(async()=>window.dispatchEvent(new CustomEvent('dmp-supplier-invoice-registered',{detail:{id:'own'}})));
  expect(host.querySelector('h2')?.textContent).toBe('Registra la factura del proveedor');
  await act(async()=>window.dispatchEvent(new CustomEvent('dmp-supplier-payment-recorded',{detail:{id:'other'}})));
  expect(host.querySelector('h2')?.textContent).toBe('Registra la factura del proveedor');
  await act(async()=>window.dispatchEvent(new CustomEvent('dmp-supplier-payment-recorded',{detail:{id:'own'}})));
  expect(host.querySelector('h2')?.textContent).toBe('Utiliza el material en el parte');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('collapses the mission map after choosing a task so it cannot cover the save action',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step:0,open:true});return <DemoGuide session={{...session,role:'Tecnico',work_order_id:'own'}} progress={p} setProgress={setP} onRole={async()=>{}}/>;}
 try{
  await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-expand')!.click());
  expect(host.querySelector('aside')?.getAttribute('data-expanded')).toBe('true');
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.demo-mission-map button')].find(button=>button.textContent?.includes('Explica el trabajo realizado'))!.click());
  expect(host.querySelector('h2')?.textContent).toBe('Explica el trabajo realizado');expect(host.querySelector('aside')?.getAttribute('data-expanded')).toBe('false');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('hands the reviewed work to Office instead of requiring a maintenance contract first',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onRole=vi.fn(async()=>{});
 try{
  await act(async()=>root.render(<MemoryRouter><DemoGuide session={{...session,role:'SAT',work_order_id:'reviewed-work'}} progress={{step:6,open:true}} setProgress={()=>{}} onRole={onRole}/></MemoryRouter>));
  expect(host.querySelector('h2')?.textContent).toBe('Continúa en Oficina');
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
  expect(onRole).toHaveBeenCalledExactlyOnceWith('Oficina',{step:1,route:'/app/partes/reviewed-work'});
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('waits for all equipment checks in the complete technical journey',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 mocks.progress.mockResolvedValue({checks:0,work_checks:3});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[progress,setProgress]=useState({step:2,open:true});return <DemoGuide session={{...session,role:'Tecnico',work_order_id:'own'}} progress={progress} setProgress={setProgress} onRole={async()=>{}} tour="work"/>;}
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/app/tecnico/trabajo/own?vista=checks']}><Harness/></MemoryRouter>));
  mocks.progress.mockResolvedValue({checks:1,work_checks:3});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('h2')?.textContent).toBe('Revisa los componentes');
  expect(host.textContent).toContain('1 de 3 checks finalizados');
  mocks.progress.mockResolvedValue({checks:3,work_checks:3});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('h2')?.textContent).toBe('Explica el trabajo realizado');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('explains parts without identified equipment before explicitly continuing',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 mocks.progress.mockResolvedValue({checks:0,work_checks:0});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[progress,setProgress]=useState({step:2,open:true});return <DemoGuide session={{...session,role:'Tecnico',work_order_id:'own'}} progress={progress} setProgress={setProgress} onRole={async()=>{}}/>;}
 try{
  await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));
  expect(host.querySelector('h2')?.textContent).toBe('Revisa los componentes');
  expect(host.textContent).toContain('sin equipo identificado');
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-skip')!.click());
  expect(host.querySelector('h2')?.textContent).toBe('Explica el trabajo realizado');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it.each(['discover','connected'] as const)('leaves billing after a saved payment in %s', async tour => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const office={...session,role:'Oficina',work_order_id:'guided-work'};
  const steps=demoTourSteps(office,tour);
  const invoiceStep=steps.findIndex(step=>step.goal==='invoices');
  const paymentStep=steps.findIndex(step=>step.goal==='payments');
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  function Harness(){
    const [progress,setProgress]=useState({step:invoiceStep,open:true});
    return <><output>{progress.step}</output><DemoGuide session={office} progress={progress} setProgress={setProgress} onRole={async()=>{}} tour={tour}/></>;
  }
  mocks.progress.mockImplementation(async (_session:any,goal?:string) => goal==='invoices' ? {invoices:1,payments:0} : {invoices:1,payments:1});
  try {
    await act(async()=>root.render(<MemoryRouter initialEntries={['/app/modulos/facturacion']}><Harness/></MemoryRouter>));
    expect(host.querySelector('output')?.textContent).toBe(String(paymentStep+1));
    expect(mocks.progress).toHaveBeenCalledWith(office,'payments','guided-work');
  } finally {
    await act(async()=>root.unmount());
    host.remove();
  }
});

it.each(['discover','connected'] as const)('resumes %s after SAT already sent the guided part to billing', async tour => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const sat={...session,role:'SAT',work_order_id:'guided-work'};
  const reviewStep=demoTourSteps(sat,tour).findIndex(step=>step.goal==='sat_approved');
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const setProgress=vi.fn();
  mocks.progress.mockResolvedValue({sat_approved:1});
  try {
    await act(async()=>root.render(<MemoryRouter initialEntries={['/app/partes/guided-work']}><DemoGuide session={sat} progress={{step:reviewStep,open:true}} setProgress={setProgress} onRole={async()=>{}} tour={tour}/></MemoryRouter>));
    expect(setProgress).toHaveBeenCalledExactlyOnceWith({step:reviewStep+1,open:true});
    expect(mocks.progress).toHaveBeenCalledWith(sat,'sat_approved','guided-work');
  } finally {
    await act(async()=>root.unmount());
    host.remove();
  }
});

it.each([
  ['discover', false, true, true],
  ['discover', true, true, false],
  ['discover', false, false, false],
  ['connected', false, true, false],
] as const)('recovers the billing board in %s with pending=%s and paid=%s', async (tour, pending, paid, advances) => {
  const office = { ...session, role: 'Oficina', work_order_id: 'guided-work' };
  const steps = demoTourSteps(office, tour);
  const invoiceStep = steps.findIndex(step => step.goal === 'invoices');
  const paymentStep = steps.findIndex(step => step.goal === 'payments');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mocks.progress.mockResolvedValue({ invoices: 0, payments: 0 });
  function Harness() {
    const [progress, setProgress] = useState({ step: invoiceStep, open: true });
    return <>
      <main data-demo-billing-state={JSON.stringify({ pending, issued: [{ workIds: ['office-example'], paid }] })} />
      <output>{progress.step}</output>
      <DemoGuide session={office} progress={progress} setProgress={setProgress} onRole={async () => {}} tour={tour} />
    </>;
  }
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/app/modulos/facturacion']}><Harness /></MemoryRouter>));
    expect(host.querySelector('output')?.textContent).toBe(String(advances ? paymentStep + 1 : invoiceStep));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each(['/app/modulos/cobros', '/app/partes/office-example?vista=horas'])(
  'prepares the cost study and keeps the work open from %s', async initialPath => {
    const officeWork = '/app/partes/office-example?vista=horas';
    const manager = { ...session, role: 'Gerencia' };
    const steps = demoTourSteps(manager, 'discover');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 40 }] as any);
    function Harness() {
      const location = useLocation();
      const [progress, setProgress] = useState({ step: steps.findIndex(step => step.title === 'Compara margen y costes'), open: true });
      return <>
        <main>{location.pathname === '/app/modulos/rentabilidad' && <Link to={officeWork}>Abrir parte de Oficina</Link>}</main>
        <output>{location.pathname + location.search}</output>
        <DemoGuide session={manager} progress={progress} setProgress={setProgress} onRole={async () => {}} tour="discover" />
      </>;
    }
    try {
      await act(async () => root.render(<MemoryRouter initialEntries={[initialPath]}><Harness /></MemoryRouter>));
      if (initialPath !== officeWork) {
        expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Ver rentabilidad');
        await act(async () => host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
      }
      expect(host.querySelector('output')?.textContent).toBe(officeWork);
      expect(host.querySelector('h2')?.textContent).toBe('Haz un estudio de costes');
    } finally {
      rects.mockRestore();
      await act(async () => root.unmount());
      host.remove();
    }
  },
);

it.each(['connected', 'work'] as const)('prepares the cost study after selecting the quarter in %s', async tour => {
  const manager = { ...session, role: 'Gerencia' };
  const steps = demoTourSteps(manager, tour);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const location = useLocation();
    const [quarter, setQuarter] = useState(false);
    const [progress, setProgress] = useState({ step: steps.findIndex(step => step.title === 'Analiza el tiempo'), open: true });
    return <>
      <main><button data-demo-study-quarter onClick={() => setQuarter(true)}>Últimos 3 meses</button></main>
      <output>{location.pathname}:{String(quarter)}</output>
      <DemoGuide session={manager} progress={progress} setProgress={setProgress} onRole={async () => {}} tour={tour} />
    </>;
  }
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/app/gerencia']}><Harness /></MemoryRouter>));
    expect(host.querySelector('h2')?.textContent).toBe('Analiza el tiempo');
    await act(async () => host.querySelector<HTMLButtonElement>('main button')!.click());
    expect(host.querySelector('output')?.textContent).toBe('/app/gerencia:true');
    expect(host.querySelector('h2')?.textContent).toBe('Haz un estudio de costes');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('prepares profitability after opening the management example without skipping that mission', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const location = useLocation();
    const [progress, setProgress] = useState({ step: 0, open: true });
    return <>
      <main><Link to="/app/partes/example">Parte de ejemplo</Link></main>
      <output>{location.pathname}</output>
      <DemoGuide session={{ ...session, role: 'Gerencia' }} progress={progress} setProgress={setProgress} onRole={async () => {}} tour="work" />
    </>;
  }
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/app/partes']}><Harness /></MemoryRouter>));
    await act(async () => host.querySelector<HTMLAnchorElement>('main a')!.click());
    expect(host.querySelector('output')?.textContent).toBe('/app/partes/example');
    expect(host.querySelector('h2')?.textContent).toBe('Compara margen y costes');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each([
  ['SAT', 'work', 1, '/app/centros', 'Crear centro'],
  ['Comercial', 'work', 0, '/app/clientes', 'Crear cliente'],
  ['Oficina', 'purchases', 1, '/app/modulos/proveedores', 'Crear proveedor'],
] as const)('waits for an existing disabled action to become available for %s', async (role, tour, step, path, label) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const create = vi.fn();
  const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 40 }] as any);
  let enableAction: () => void = () => {};
  function Action() {
    const [enabled, setEnabled] = useState(false);
    enableAction = () => setEnabled(true);
    return <button disabled={!enabled} onClick={create}>{label}</button>;
  }
  try {
    await act(async () => root.render(
      <MemoryRouter initialEntries={[path]}>
        <main><header className="page-head">Cargando</header><Action /></main>
        <DemoGuide session={{ ...session, role }} progress={{ step, open: true }} setProgress={() => {}} onRole={async () => {}} tour={tour} />
      </MemoryRouter>,
    ));
    await act(async () => host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());
    expect(create).not.toHaveBeenCalled();
    expect(host.querySelector('.demo-guide-next')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => enableAction());
    expect(create).toHaveBeenCalledOnce();
    expect(host.querySelector('.demo-guide-next')?.getAttribute('aria-busy')).toBe('false');
  } finally {
    rects.mockRestore();
    await act(async () => root.unmount());
    host.remove();
  }
});

it('does not reuse aggregate counts from economic review as proof of billing the guided work', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let resolveInvoice: (value: Record<string, number>) => void = () => {};
  const invoiceResult = new Promise<Record<string, number>>(resolve => { resolveInvoice = resolve; });
  mocks.progress.mockImplementation(async (_session: any, goal?: string) =>
    goal === 'invoices' ? invoiceResult : { invoices: 3, payments: 1 });
  function Harness() {
    const [progress, setProgress] = useState({ step: 1, open: true });
    return <>
      <main><section data-economic-review="approved" /></main>
      <DemoGuide session={{ ...session, role: 'Oficina', work_order_id: 'guided-work' }}
        progress={progress} setProgress={setProgress} onRole={async () => {}} tour="work" />
    </>;
  }
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/app/partes/guided-work']}><Harness /></MemoryRouter>));
    expect(host.querySelector('h2')?.textContent).toBe('Prepara la factura');
    await act(async () => resolveInvoice({ invoices: 0, payments: 0 }));
    expect(host.querySelector('h2')?.textContent).toBe('Prepara la factura');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
