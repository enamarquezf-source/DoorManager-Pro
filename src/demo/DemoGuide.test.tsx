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
it('waits for the destination action instead of consuming a loading page heading',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const create=vi.fn();let reveal:()=>void=()=>{};
function Harness(){const location=useLocation();const[loaded,setLoaded]=useState(false);reveal=()=>setLoaded(true);return <><main>{location.pathname==='/app/centros'?<><header className="page-head">Centros</header>{loaded&&<button onClick={create}>Crear centro</button>}</>:<header className="page-head">Clientes</header>}</main><DemoGuide session={session} progress={{step:1,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
const original=HTMLElement.prototype.getClientRects;HTMLElement.prototype.getClientRects=function(){return [{width:100,height:40}] as any;};
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/clientes']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(create).not.toHaveBeenCalled();expect(host.querySelector('.demo-guide-next')?.textContent).toContain('Preparando');await act(async()=>reveal());expect(create).toHaveBeenCalledOnce();}finally{HTMLElement.prototype.getClientRects=original;await act(async()=>root.unmount());host.remove();}});
it('continues after confirmed economic approval on the same work page',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let approve:()=>void=()=>{};
function Harness(){const[p,setP]=useState({step:13,open:true});const[approved,setApproved]=useState(false);approve=()=>setApproved(true);return <><main><section data-economic-review={approved?'approved':'pending'}/></main><DemoGuide session={{...session,role:'Oficina'}} tour="connected" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/partes/work']}><Harness/></MemoryRouter>));expect(host.querySelector('h2')?.textContent).toBe('Comprueba los conceptos');await act(async()=>approve());expect(host.querySelector('h2')?.textContent).toBe('Prepara la factura');}finally{await act(async()=>root.unmount());host.remove();}});
it('finishes the study mission only after persistence confirms success',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
function Harness(){const[p,setP]=useState({step:19,open:true});return <><main><button>Guardar estudio</button></main><DemoGuide session={{...session,role:'Gerencia'}} tour="connected" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('h2')?.textContent).toBe('Haz un estudio de costes');await act(async()=>window.dispatchEvent(new CustomEvent('dmp-cost-study-saved')));expect(host.querySelector('h2')?.textContent).toBe('Del aviso al resultado');}finally{await act(async()=>root.unmount());host.remove();}});

it.each([
 ['Comercial',1,'Prepara un presupuesto','dmp-quote-line-saved','Registra el envío del presupuesto'],
 ['SAT',6,'Explora el contrato de mantenimiento','dmp-maintenance-saved','Continúa en Oficina'],
] as const)('advances %s only when the operation confirms persistence',async(role,step,title,event,next)=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const[p,setP]=useState({step,open:true});return <><main><button>Guardar</button></main><DemoGuide session={{...session,role}} tour="work" progress={p} setProgress={setP} onRole={async()=>{}}/></>;}
 try{await act(async()=>root.render(<MemoryRouter><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('main button')!.click());expect(host.querySelector('h2')?.textContent).toBe(title);await act(async()=>window.dispatchEvent(new CustomEvent(event)));expect(host.querySelector('h2')?.textContent).toBe(next);expect(host.querySelector('aside')?.getAttribute('data-finale')).toBe(role==='SAT'?'true':'false');}finally{await act(async()=>root.unmount());host.remove();}
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
 function Harness(){const location=useLocation();return <><output>{location.search}</output><main><nav className="technician-work-tabs">{location.search==='?vista=records'?'Registro':'En campo'}</nav>{location.search==='?vista=records'&&<textarea aria-label="Trabajo realizado" className="technician-work-textarea"/>}</main><DemoGuide session={{...session,role:'Tecnico',work_order_id:'work'}} tour="connected" progress={{step:8,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
 try{await act(async()=>root.render(<MemoryRouter initialEntries={['/app/tecnico/trabajo/work?vista=checks']}><Harness/></MemoryRouter>));await act(async()=>host.querySelector<HTMLButtonElement>('.demo-guide-next')!.click());expect(host.querySelector('output')?.textContent).toBe('?vista=records');expect(host.querySelector('textarea')).not.toBeNull();expect(focus).toHaveBeenCalled();}finally{HTMLElement.prototype.getClientRects=original;focus.mockRestore();await act(async()=>root.unmount());host.remove();}
});

it('keeps the closure on the technician work currently opened rather than the initial example',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Harness(){const location=useLocation();return <><output>{location.pathname+location.search}</output><main><div className="technician-close-review">Resumen de cierre</div></main><DemoGuide session={{...session,role:'Tecnico',work_order_id:'initial-example'}} tour="connected" progress={{step:11,open:true}} setProgress={()=>{}} onRole={async()=>{}}/></>;}
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
  expect(host.textContent).toContain('selecciona su componente');
  mocks.progress.mockResolvedValue({checks:1,work_checks:3});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('h2')?.textContent).toBe('De campo a Oficina');
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
