// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DemoExample} from './DemoExample';
it('offers fictitious values on explicit request, without saving or injecting related record identities',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');const root=createRoot(host);const fill=vi.fn();
 try{
  await act(async()=>root.render(<DemoExample title="Crear proveedor" enabled onFill={fill}/>));
  expect(fill).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());
  expect(fill).toHaveBeenCalledWith(expect.objectContaining({name:'Suministros Horizonte · ejemplo'}));
  expect(fill.mock.calls[0][0]).not.toHaveProperty('company_id');expect(fill.mock.calls[0][0]).not.toHaveProperty('internal_code');
  await act(async()=>root.render(<DemoExample title="Crear proveedor" enabled={false} onFill={fill}/>));
  expect(host.querySelector('button')).toBeNull();
 }finally{await act(async()=>root.unmount());}
});
