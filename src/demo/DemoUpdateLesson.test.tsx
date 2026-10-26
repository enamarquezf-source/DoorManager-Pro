// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {DemoUpdateLesson} from './DemoUpdateLesson';
const api=vi.hoisted(()=>({check:vi.fn(),update:vi.fn()}));
vi.mock('../shared/versioning',()=>({checkForNewVersion:api.check}));
vi.mock('../shared/manualAppUpdate',()=>({requestManualAppUpdate:api.update}));
afterEach(()=>vi.resetAllMocks());
async function lesson(run:(host:HTMLElement)=>Promise<void>){
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<DemoUpdateLesson role="Tecnico"/>));await run(host);}finally{await act(async()=>root.unmount());host.remove();}
}
it('checks the real status only on request and never invents an available update',async()=>{
 api.check.mockResolvedValue({status:'current'});
 await lesson(async host=>{
  expect(api.check).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());
  expect(host.textContent).toContain('Estás al día');
  expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Actualizar DMP')).toBe(false);
  expect(api.update).not.toHaveBeenCalled();
 });
});
it('uses the guarded updater only after explicit confirmation of an actual new version',async()=>{
 api.check.mockResolvedValue({status:'update-available',latest:{version:'new'}});
 await lesson(async host=>{
  await act(async()=>host.querySelector('button')!.click());expect(api.update).not.toHaveBeenCalled();
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Actualizar DMP')!.click());
  expect(api.update).toHaveBeenCalledWith('tecnico','new');
 });
});
it('explains failed checks without claiming the application is up to date',async()=>{
 api.check.mockResolvedValue({status:'unavailable'});
 await lesson(async host=>{await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('Comprueba tu conexión');expect(host.textContent).not.toContain('Estás al día');});
});
