// @vitest-environment happy-dom
import { act } from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import {RateCatalogForm} from '../App';
const api=vi.hoisted(()=>({createCatalog:vi.fn(async(payload:any)=>({id:'new-rate',...payload}))}));
vi.mock('../services/hourRatesService',()=>({hourRatesService:api}));
it('creates labor with matching kind and classification and hands its identity to the price step',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onSaved=vi.fn();
 try{
  await act(async()=>root.render(<MemoryRouter><RateCatalogForm initial={{}} mode="concept" onClose={()=>{}} onSaved={onSaved}/></MemoryRouter>));
  const dialog=document.body.querySelector('[role="dialog"]')!;
  for(const [label,value] of [['Código','labor-demo'],['Nombre','Hora de prueba']]){
   const input=[...dialog.querySelectorAll('label')].find(el=>el.textContent===label)!.querySelector('input')!;
   await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  const select=dialog.querySelector('select')!;
  await act(async()=>{select.value='labor';select.dispatchEvent(new Event('change',{bubbles:true}));});
  for(let n=0;n<2;n++)await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(api.createCatalog).toHaveBeenCalledWith(expect.objectContaining({kind:'labor',classification:'labor'}));
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({id:'new-rate'}));
 }finally{await act(async()=>root.unmount());host.remove();}
});
