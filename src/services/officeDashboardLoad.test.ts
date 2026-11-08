import { expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),company:vi.fn(async()=>'company')}));
vi.mock('../lib/supabase/client',()=>({supabase:{from:mocks.from}}));
vi.mock('./query',()=>({currentProfileCompanyId:mocks.company,currentProfileId:vi.fn(),expectStep:(_name:string,load:any)=>load(),expectData:async(query:any)=>{const result=await query;if(result.error)throw result.error;return result.data;}}));
import { dashboardService } from './dashboardService';
it('loads office data without fetching the unused entire material catalog or document attachments',async()=>{
 const projections:Record<string,string>={};
 mocks.from.mockImplementation((table:string)=>{
  const q:any={then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};
  for(const method of ['select','eq','is','order'])q[method]=(...args:any[])=>{if(method==='select')projections[table]=args[0];return q;};
  return q;
 });
 const data=await dashboardService.getOfficeDashboardData();
 expect(mocks.from).toHaveBeenCalledTimes(6);
 expect(mocks.from).not.toHaveBeenCalledWith('materials');
 expect(projections.documents).not.toContain('document_links');
 expect(data).toMatchObject({documents:[],suppliers:[],workOrders:[]});
});
