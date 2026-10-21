import { beforeEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({pages:[] as any[][],eq:vi.fn(),range:vi.fn()}));
vi.mock('../lib/supabase/client',()=>({supabase:{from:()=>{const chain:any={select:()=>chain,eq:(...args:any[])=>{state.eq(...args);return chain;},order:()=>chain,range:(from:number,to:number)=>{state.range(from,to);return Promise.resolve({data:state.pages.shift()??[],error:null});}};return chain;}}}));
vi.mock('./query',()=>({currentProfileCompanyId:async()=> 'company-profile',currentCompanyId:async()=> 'company-operating',expectData:async(query:any)=>{const result=await query;if(result.error)throw result.error;return result.data;}}));
import { billingService } from './billingService';
beforeEach(()=>{state.eq.mockReset();state.range.mockReset();state.pages=[];});
it('loads every invoice page scoped to the authenticated company',async()=>{
 state.pages=[Array.from({length:500},(_,index)=>({id:`first-${index}`,invoice_payments:[]})),[{id:'old-overdue',invoice_payments:[{paid_at:'2026-01-01'},{paid_at:'2026-02-01'}]}]];
 const invoices=await billingService.invoices();expect(invoices).toHaveLength(501);expect(state.eq).toHaveBeenNthCalledWith(1,'company_id','company-profile');expect(state.eq).toHaveBeenNthCalledWith(2,'company_id','company-profile');expect(state.range.mock.calls).toEqual([[0,499],[500,999]]);expect(invoices[500].invoice_payments[0].paid_at).toBe('2026-02-01');
});
