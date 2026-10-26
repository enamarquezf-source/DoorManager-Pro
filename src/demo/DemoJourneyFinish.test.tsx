// @vitest-environment happy-dom
import {act} from 'react';import{createRoot}from'react-dom/client';import{expect,it}from'vitest';import{DemoJourneyFinish}from'./DemoJourneyFinish';
it('shows only detected actions and opens the owner contact without sending any message',async()=>{
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');const root=createRoot(host);
try{await act(async()=>root.render(<DemoJourneyFinish steps={[{title:'Cliente',goal:'clients',route:'/',target:''},{title:'Factura',goal:'invoices',route:'/',target:''}]} evidence={{0:{baseline:0,saved:true},1:{baseline:1,saved:false}}}/>));
expect(host.textContent).toContain('1 acciones con cambios detectados');expect(host.querySelector('ul')?.textContent).toBe('Cliente');expect(host.textContent).toContain('no significa que hayas guardado');
expect(host.querySelector('a')?.getAttribute('href')).toContain('mailto:enamarquezf@gmail.com?subject=');expect(host.querySelector('form')).toBeNull();
}finally{await act(async()=>root.unmount());}});
