// @vitest-environment happy-dom
import { act } from 'react';import {createRoot} from 'react-dom/client';import {afterEach,expect,it,vi} from 'vitest';
import {PublicDemoEntry} from './PublicDemoEntry';
vi.mock('./Turnstile',()=>({DemoTurnstile:({onToken}:any)=><button type="button" onClick={()=>onToken('verified-token')}>Verificación de prueba</button>}));
afterEach(()=>{sessionStorage.clear();});
it('requires a role choice and prepares the selected technician scenario rather than a shared login',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const session:any={role:'Tecnico'};const start=vi.fn(async()=>session);const onReady=vi.fn(async()=>undefined);
  try{
    await act(async()=>root.render(<PublicDemoEntry checkReady={async()=>true} start={start} onReady={onReady} siteKey="site"/>));
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    const launch=()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Probar DMP')!;
    expect(launch().disabled).toBe(true);
    await act(async()=>host.querySelector<HTMLInputElement>('input[value="Tecnico"]')!.click());
    expect(host.textContent).toContain('Un parte ficticio, tres equipos');
    expect(launch().disabled).toBe(true);
    await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Verificación de prueba')!.click());
    await act(async()=>launch().click());
    expect(start).toHaveBeenCalledExactlyOnceWith('Tecnico','verified-token');expect(onReady).toHaveBeenCalledExactlyOnceWith(session);
  }finally{await act(async()=>root.unmount());host.remove();}
});
it('shows preparation status and never creates a visitor when the backend is not enabled',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');const root=createRoot(host);const start=vi.fn();
  try{
    await act(async()=>root.render(<PublicDemoEntry checkReady={async()=>false} start={start} onReady={async()=>undefined} siteKey="site"/>));
    expect(host.textContent).toContain('Estamos preparando la demostración');expect(host.querySelector<HTMLButtonElement>('.demo-launch')!.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());}
});
