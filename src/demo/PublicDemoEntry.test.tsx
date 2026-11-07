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
    expect(host.querySelector('dialog')?.textContent).toContain('Prueba de Técnico');
    expect(host.querySelector('dialog video')?.getAttribute('src')).toBe('/demo-intros/tecnico-pantalla-completa.mp4');
    expect(start).not.toHaveBeenCalled();
    await act(async()=>host.querySelector<HTMLButtonElement>('dialog .demo-preview-start')!.click());
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

it('uses the selected business role guide instead of forcing the quick technician route',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const start=vi.fn(async()=>({id:'role-choice',role:'Oficina'} as any));
 try{
  await act(async()=>root.render(<PublicDemoEntry checkReady={async()=>true} start={start} onReady={async()=>{}} siteKey="site"/>));
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent?.includes('Descubrir DMP'))!.click());
  await act(async()=>host.querySelector<HTMLInputElement>('input[value="Oficina"]')!.click());
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Verificación de prueba')!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-launch')!.click());
  expect(host.querySelector('dialog')?.textContent).toContain('Prueba de Oficina');
  expect(host.querySelector('dialog video')?.getAttribute('src')).toBe('/demo-intros/oficina-pantalla-completa.mp4');
  await act(async()=>host.querySelector<HTMLButtonElement>('dialog .demo-preview-start')!.click());
  expect(start).toHaveBeenCalledExactlyOnceWith('Oficina','verified-token');expect(localStorage.getItem('dmp-demo-tour-choice:role-choice')).toBe('work');
 }finally{await act(async()=>root.unmount());host.remove();localStorage.clear();}
});
it.each([
 ['Descubrir DMP','/demo-intros/descubrir-dmp-20261107.mp4'],
 ['Crear mi propio recorrido','/demo-intros/crear-recorrido-dmp-20261107.mp4'],
] as const)('plays a dedicated complete movie for %s without replacing it with a role video',async(label,source)=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<PublicDemoEntry checkReady={async()=>true} start={vi.fn()} onReady={async()=>{}} siteKey="site"/>));
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent?.includes(label))!.click());
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Verificación de prueba')!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('.demo-launch')!.click());
  expect(host.querySelector('dialog video')?.getAttribute('src')).toBe(source);
  expect(host.querySelector('dialog video')?.getAttribute('poster')).toBe(source.replace('.mp4','.jpg'));
  await act(async()=>host.querySelector('dialog video')!.dispatchEvent(new Event('ended')));
  expect(host.querySelector('dialog video')?.getAttribute('src')).toBe(source);
 } finally {await act(async()=>root.unmount());host.remove();}
});
