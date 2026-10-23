// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi} from 'vitest';
import {AuthContext,ClientsPage} from '../App';
vi.mock('../query/useLoad',()=>({useLoad:()=>({data:[],loading:false,error:'',reload:vi.fn()})}));

for(const workspace of ['sat','comercial'])it(`opens the actual client wizard and portal from an empty ${workspace} list`,async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<MemoryRouter><AuthContext.Provider value={{workspace} as any}><ClientsPage/></AuthContext.Provider></MemoryRouter>));
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Crear cliente');expect(button).toBeTruthy();
 await act(async()=>button!.click());
 const dialog=document.body.querySelector('[role="dialog"]');expect(dialog).not.toBeNull();
 expect(dialog?.textContent).toContain('Crear cliente');
 expect([...dialog!.querySelectorAll('label')].some(label=>label.textContent?.includes('Razón social'))).toBe(true);
 expect(dialog?.querySelector('.guided-form')).not.toBeNull();
 await act(async()=>dialog!.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click());
 expect(document.body.querySelector('[role="dialog"]')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
