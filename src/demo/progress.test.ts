import{expect,it,vi,beforeEach}from'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),rows:{} as Record<string,any>,queries:[] as any[]}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mock.rpc,from:mock.from},authStorageKey:'test'}));
vi.mock('../query/queryClient',()=>({queryClient:{fetchQuery:({queryFn}:any)=>queryFn()}}));
vi.mock('./model',async importOriginal=>({...await importOriginal<any>(),publicDemoEnabled:true}));
vi.mock('../services/technicianOfflineService',()=>({technicianOfflineService:{pending:async()=>[]}}));
import{publicDemoService}from'./service';
const session:any={id:'visitor',company_id:'own-company',work_order_id:'own-work',role:'Tecnico'};
beforeEach(()=>{vi.clearAllMocks();mock.queries=[];mock.rows={checks:{count:0,error:null},work_order_photos:{count:2,error:null}};mock.rpc.mockResolvedValue({data:{photos:1},error:null});mock.from.mockImplementation((table:string)=>{const query:any={table,filters:[]};mock.queries.push(query);const chain:any={select:()=>chain,eq:(key:string,value:string)=>{query.filters.push([key,value]);return chain;},is:()=>chain,then:(resolve:any,reject:any)=>Promise.resolve(mock.rows[table]).then(resolve,reject)};return chain;});});
it('counts photos from the work as well as checks and scopes all reads to the current company and work',async()=>{
const result=await publicDemoService.progress(session,'photos');expect(result.photos).toBe(3);expect(result.work_checks).toBe(0);
for(const query of mock.queries)expect(query.filters).toEqual([['company_id','own-company'],['work_order_id','own-work']]);});
it('does not interpret unavailable check metadata as an empty work',async()=>{
mock.rpc.mockResolvedValue({data:{photos:1,checks:9},error:null});mock.rows.checks={count:null,error:{message:'network'}};mock.rows.work_order_photos={count:null,error:{message:'network'}};
const result=await publicDemoService.progress(session,'photos');expect(result.work_checks).toBeUndefined();expect(result.checks).toBe(0);expect(result.photos).toBe(1);});
it('does not request technical metadata for business profiles',async()=>{await publicDemoService.progress({...session,role:'SAT'},'clients');expect(mock.from).not.toHaveBeenCalled();});
it('counts finished checks instead of individual reviewed items',async()=>{
 mock.rpc.mockResolvedValue({data:{checks:9},error:null});mock.rows.checks={count:3,data:[{status:'Realizado'},{status:'En curso'},{status:'Por realizar'}],error:null};
 expect(await publicDemoService.progress(session,'checks')).toMatchObject({checks:1,work_checks:3});
});
