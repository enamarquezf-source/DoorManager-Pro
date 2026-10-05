import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
import { alertsService } from './alertsService';
beforeEach(()=>vi.clearAllMocks());
describe('personal alert list and unread count',()=>{
 it('loads effective personal state through the dedicated RPC',async()=>{
  const rows=[{id:'recipient',is_read:false,closed_at:null,alerts:{title:'Test'}}];
  mocks.rpc.mockResolvedValue({data:rows,error:null});
  expect(await alertsService.listPersonal('test')).toEqual(rows);
  expect(mocks.rpc).toHaveBeenCalledWith('dmp_list_personal_alerts',{p_search:'test'});
 });
 it('counts only effective unread, open personal states and returns the existing notification shape',async()=>{
  const alert={code:'AVI',title:'Test',status:'Abierto'};
  mocks.rpc.mockResolvedValue({data:[
   {id:'own',company_id:'company',alert_id:'alert',is_read:false,closed_at:null,recipient_role:'Todos',alerts:alert},
   {id:'read',is_read:true,closed_at:null,alerts:alert},
   {id:'closed',is_read:false,closed_at:'date',alerts:alert},
   {id:'initially-closed',is_read:false,closed_at:null,alerts:{...alert,status:'Cerrado'}},
  ],error:null});
  expect(await alertsService.unreadPersonal()).toEqual([{...alert,company_id:'company',recipient_id:'own',alert_id:'alert',recipient_profile_id:undefined,recipient_role:'Todos'}]);
 });
});
