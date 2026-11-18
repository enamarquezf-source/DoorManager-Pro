import{expect,it,vi,beforeEach}from'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),rows:{} as Record<string,any>,queries:[] as any[]}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mock.rpc,from:mock.from},authStorageKey:'test'}));
vi.mock('../query/queryClient',()=>({queryClient:{fetchQuery:({queryFn}:any)=>queryFn()}}));
vi.mock('./model',async importOriginal=>({...await importOriginal<any>(),publicDemoEnabled:true}));
vi.mock('../services/technicianOfflineService',()=>({technicianOfflineService:{pending:async()=>[]}}));
import{publicDemoService}from'./service';
const session:any={id:'visitor',company_id:'own-company',work_order_id:'own-work',role:'Tecnico'};
beforeEach(()=>{vi.clearAllMocks();mock.queries=[];mock.rows={checks:{count:0,error:null},work_order_photos:{count:2,error:null}};mock.rpc.mockResolvedValue({data:{photos:1},error:null});mock.from.mockImplementation((table:string)=>{const query:any={table,filters:[]};mock.queries.push(query);const chain:any={select:()=>chain,maybeSingle:()=>chain,eq:(key:string,value:string)=>{query.filters.push([key,value]);return chain;},is:()=>chain,neq:(key:string,value:string)=>{query.filters.push([key,value]);return chain;},then:(resolve:any,reject:any)=>Promise.resolve(mock.rows[table]).then(resolve,reject)};return chain;});});
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

it('never treats another approved example as SAT approval of the current work',async()=>{
 mock.rpc.mockResolvedValue({data:{sat_approved:7},error:null});mock.rows.work_orders={count:0,error:null};
 const result=await publicDemoService.progress({...session,role:'SAT'},'sat_approved','current-work');
 expect(result.sat_approved).toBe(0);expect(mock.queries[0].filters).toEqual([['company_id','own-company'],['id','current-work'],['sat_review_status','approved'],['economic_review_status','approved'],['sat_review_destination','facturacion']]);
});
it('scopes technician completion, hours and signatures to the work currently opened',async()=>{
 mock.rpc.mockResolvedValue({data:{work_notes:1,times:5,signatures:2,completed_work:1,photos:8},error:null});
 mock.rows.work_orders={data:{work_performed:'',status:'Pendiente'},error:null};mock.rows.work_order_time_entries={count:0,error:null};mock.rows.work_order_signatures={count:0,error:null};mock.rows.check_photos={count:0,error:null};
 const result=await publicDemoService.progress(session,'photos','opened-work');
 expect(result).toMatchObject({work_notes:0,times:0,signatures:0,completed_work:0,photos:2});
 for(const query of mock.queries){expect(query.filters[0]).toEqual(['company_id','own-company']);expect(query.filters[1][1]).toBe('opened-work');}
});

it('recognizes a recorded customer payment for the guided work without waiting on aggregate progress', async () => {
  mock.rpc.mockRejectedValue(new Error('aggregate unavailable'));
  mock.rows.invoices={data:[{id:'issued',paid_amount:0},{id:'paid',paid_amount:'95.00'}],error:null};
  await expect(publicDemoService.progress({...session,role:'Oficina'},'payments','current-work')).resolves.toEqual({invoices:2,payments:1});
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(mock.queries[0].filters).toContainEqual(['invoice_work_orders.work_order_id','current-work']);
  expect(mock.queries[0].filters).toContainEqual(['company_id','own-company']);
  expect(mock.queries[0].filters).toContainEqual(['status','cancelada']);
  expect(mock.queries[0].filters).toContainEqual(['status','borrador']);
});

it('does not count seed invoices or payments when the guided work has no invoice', async () => {
  mock.rows.invoices={data:[],error:null};
  mock.rpc.mockResolvedValue({data:{invoices:10,payments:10},error:null});
  await expect(publicDemoService.progress({...session,role:'Oficina'},'payments','current-work')).resolves.toEqual({invoices:0,payments:0});
});

it('does not count another work assignment when SAT receives a new commercial work', async () => {
  mock.rpc.mockResolvedValue({data:{assignments:9},error:null});
  mock.rows.work_order_assignments={count:0,error:null};
  await expect(publicDemoService.progress({...session,role:'SAT'},'assignments','new-commercial-work'))
    .resolves.toEqual({assignments:0});
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(mock.queries[0].filters).toEqual([['company_id','own-company'],['work_order_id','new-commercial-work'],['status','Cancelado']]);
});
