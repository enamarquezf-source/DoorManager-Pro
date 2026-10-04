import { describe,it,expect,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
import { alertsService } from './alertsService';
describe('recipient actions',()=>{
 beforeEach(()=>mocks.rpc.mockReset());
 it('closes and reopens using the authorized server operation',async()=>{
  mocks.rpc.mockResolvedValue({data:{id:'recipient'},error:null});
  await alertsService.close('recipient');expect(mocks.rpc).toHaveBeenLastCalledWith('dmp_update_alert_recipient',{p_recipient_id:'recipient',p_action:'close'});
  await alertsService.reopen('recipient');expect(mocks.rpc).toHaveBeenLastCalledWith('dmp_update_alert_recipient',{p_recipient_id:'recipient',p_action:'reopen'});
 });
 it('surfaces denied closure instead of pretending it succeeded',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'permiso: aviso no disponible para este usuario'}});
  await expect(alertsService.close('recipient')).rejects.toThrow('permiso');
 });
});
