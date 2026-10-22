import { expect,it,vi } from 'vitest';
import { cleanDemoJob } from '../../supabase/functions/_shared/demoCleanup';
const job={id:'session',auth_user_id:'user',company_id:'company',file_manifest:[{bucket:'dmp-files',path:'company/checks/photo.jpg'}]};
function mockAdmin({manifest=job.file_manifest,failRemove=false}={}){
  const remove=vi.fn(async()=>({error:failRemove?new Error('Storage down'):null}));
  const list=vi.fn(async(prefix:string)=>({data:prefix==='company'?[{name:'orphan.jpg',id:'file'}]:[],error:null}));
  const complete=vi.fn(async()=>({error:null}));
  const deleteUser=vi.fn(async()=>({error:null}));
  const admin={rpc:vi.fn(async()=>({data:{...job,file_manifest:manifest},error:null})),storage:{from:vi.fn(()=>({list,remove}))},auth:{admin:{deleteUser}},from:vi.fn(()=>({update:vi.fn(()=>({eq:complete}))}))};
  return {admin,remove,complete,deleteUser};
}
it('removes registered files and orphan uploads before deleting the identity and confirming completion',async()=>{
  const m=mockAdmin();await cleanDemoJob(m.admin,job);
  expect(m.remove.mock.calls.flat(2)).toContain('company/checks/photo.jpg');
  expect(m.remove.mock.calls.flat(2)).toContain('company/orphan.jpg');
  expect(m.deleteUser).toHaveBeenCalledExactlyOnceWith('user');expect(m.complete).toHaveBeenCalledOnce();
  expect(m.remove.mock.invocationCallOrder[0]).toBeLessThan(m.deleteUser.mock.invocationCallOrder[0]);
});
it('keeps failed storage cleanup retryable without deleting the identity or claiming completion',async()=>{
  const m=mockAdmin({failRemove:true});await expect(cleanDemoJob(m.admin,job)).rejects.toThrow('pendiente de reintento');
  expect(m.deleteUser).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
});
it('refuses a manifest referring to another visitor',async()=>{
  const m=mockAdmin({manifest:[{bucket:'dmp-files',path:'other-company/private.jpg'}]});
  await expect(cleanDemoJob(m.admin,job)).rejects.toThrow('fuera de la sesión');expect(m.remove).not.toHaveBeenCalled();
});
