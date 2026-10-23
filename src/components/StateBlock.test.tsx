// @vitest-environment happy-dom
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {StateBlock} from './StateBlock';

function EmptyClientList({loading=false,error}:{loading?:boolean;error?:string}) {
 const [creating,setCreating]=useState(false);const[clients,setClients]=useState<string[]>([]);
 return <><button onClick={()=>setCreating(true)}>Crear cliente</button><StateBlock keepChildrenMounted empty={!clients.length} loading={loading} error={error}><ul>{clients.map(name=><li key={name}>{name}</li>)}</ul>{creating&&<form role="dialog" onSubmit={event=>{event.preventDefault();const input=event.currentTarget.querySelector('input')!;setClients([input.value]);setCreating(false);}}><label>Razón social<input name="legal_name" required/></label><button type="submit">Guardar</button></form>}</StateBlock></>;
}
it('opens the creation form on an empty list and lets the first record replace the empty notice',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);
 try{
 await act(async()=>root.render(<EmptyClientList/>));
 expect(host.textContent).toContain('No hay registros');
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 const form=host.querySelector<HTMLFormElement>('[role="dialog"]');expect(form).not.toBeNull();
 form!.querySelector('input')!.value='Primer cliente de prueba';
 await act(async()=>form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.querySelector('li')?.textContent).toBe('Primer cliente de prueba');
 expect(host.textContent).not.toContain('No hay registros');
 expect(host.querySelector('[role="dialog"]')).toBeNull();
 }finally{await act(async()=>root.unmount());}
});
it('preserves the open form and its draft through a refresh and a list loading error',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);
 try{
 await act(async()=>root.render(<EmptyClientList/>));
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 const input=host.querySelector('input')!;input.value='Borrador sin guardar';
 await act(async()=>root.render(<EmptyClientList loading/>));
 expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('Borrador sin guardar');
 await act(async()=>root.render(<EmptyClientList error="Error de conexión"/>));
 expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('Borrador sin guardar');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Error de conexión');
 }finally{await act(async()=>root.unmount());}
});
it('still hides unready detail content unless preservation is requested',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');const root=createRoot(host);
 try{
 await act(async()=>root.render(<StateBlock loading><p>Detalle no disponible</p></StateBlock>));
 expect(host.textContent).toContain('Cargando datos');expect(host.textContent).not.toContain('Detalle no disponible');
 }finally{await act(async()=>root.unmount());}
});
