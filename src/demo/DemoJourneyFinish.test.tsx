// @vitest-environment happy-dom
import {act} from 'react';import{createRoot}from'react-dom/client';import{expect,it}from'vitest';import{DemoJourneyFinish}from'./DemoJourneyFinish';
it('shows only detected actions and shows contact inside DMP without launching another app or sending a message',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');const root=createRoot(host);
try{await act(async()=>root.render(<DemoJourneyFinish steps={[{title:'Cliente',goal:'clients',route:'/',target:''},{title:'Factura',goal:'invoices',route:'/',target:''}]} evidence={{0:{baseline:0,saved:true},1:{baseline:1,saved:false}}}/>));
expect(host.textContent).toContain('1 acciones con cambios detectados');expect(host.querySelector('ul')?.textContent).toBe('Cliente');expect(host.textContent).toContain('no significa que hayas guardado');
expect(host.querySelector('a')).toBeNull();await act(async()=>host.querySelector<HTMLButtonElement>('.demo-trial-contact')!.click());expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('enamarquezf@gmail.com');expect(host.textContent).toContain('no envía correos ni abre otra aplicación');expect(host.querySelector('a')).toBeNull();expect(host.querySelector('form')).toBeNull();
}finally{await act(async()=>root.unmount());}});
