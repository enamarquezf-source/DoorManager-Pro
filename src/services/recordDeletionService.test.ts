import { describe,it,expect,vi,beforeEach } from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
import { recordDeletionService } from './recordDeletionService';
describe('record deletion service',()=>{
 beforeEach(()=>mock.rpc.mockReset());
 it.each(['alert','vehicle','document'] as const)('deletes %s through the authorized RPC',async(kind)=>{ mock.rpc.mockResolvedValue({data:null,error:null}); await recordDeletionService.remove(kind,'target-id'); expect(mock.rpc).toHaveBeenCalledWith('dmp_delete_operational_record',{p_kind:kind,p_id:'target-id'}); });
 it('propagates denied deletion',async()=>{mock.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'permiso: no puedes eliminar este registro'}});await expect(recordDeletionService.remove('document','target')).rejects.toThrow('permiso');});
});
