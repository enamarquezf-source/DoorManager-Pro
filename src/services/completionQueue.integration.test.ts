import 'fake-indexeddb/auto';import{beforeEach,afterEach,expect,it,vi}from'vitest';
const remote=vi.hoisted(()=>({order:[] as string[],photoFails:false,rpc:vi.fn()}));
vi.mock('./checksService',()=>({checksService:{syncOfflineBlock:vi.fn(async()=>{remote.order.push('block')}),syncOfflinePhoto:vi.fn(async()=>{remote.order.push('photo');if(remote.photoFails)throw Error('upload failed')}),finish:vi.fn()}}));
vi.mock('./workOrdersService',()=>({workOrdersService:{}}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:remote.rpc}}));
import{setOfflineIdentity,technicianOfflineService}from'./technicianOfflineService';import{completeAndSyncWork,completeAndSyncCheck}from'./checkCompletionService';
beforeEach(async()=>{vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{onLine:true});remote.order=[];remote.photoFails=false;remote.rpc.mockImplementation(async(_name:string,args:any)=>{remote.order.push(args.p_kind);return{data:{},error:null}});await new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase('doormanager-pro-tecnico');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});setOfflineIdentity({companyId:'company',profileId:'technician'});});afterEach(()=>{setOfflineIdentity(null);vi.unstubAllGlobals();});
it('sends blocks, photos, other work data, check closures and finally the work closure',async()=>{
await technicianOfflineService.upsert({type:'photo',workOrderId:'work',checkId:'check',payload:{dataUrl:'image'}});
await technicianOfflineService.upsert({type:'time',workOrderId:'work',payload:{duration_minutes:60}});
await technicianOfflineService.upsert({type:'check-block',workOrderId:'work',checkId:'check',blockId:'block',payload:{}});
await technicianOfflineService.upsert({type:'check-finish',workOrderId:'work',checkId:'check',payload:{result:'Todo favorable'}});
const result=await completeAndSyncWork('work','En intervencion');expect(result.synced).toBe(true);expect(remote.order).toEqual(['block','photo','time','check-finish','work-finish']);expect(await technicianOfflineService.pending()).toHaveLength(0);
});
it('does not finalize a check after its photo fails and retains both for retry',async()=>{
remote.photoFails=true;await technicianOfflineService.upsert({type:'photo',workOrderId:'work',checkId:'check',payload:{dataUrl:'image'}});
const result=await completeAndSyncCheck('check','work','Problema leve');expect(result.synced).toBe(false);expect(remote.order).toEqual(['photo']);expect((await technicianOfflineService.pending()).map(c=>c.type)).toEqual(['photo','check-finish']);
remote.photoFails=false;expect((await completeAndSyncCheck('check','work','Problema leve')).synced).toBe(true);expect(await technicianOfflineService.pending()).toHaveLength(0);
});
