import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('./query',()=>({expectData:async(request:PromiseLike<any>)=>{const result=await request;if(result.error)throw result.error;return result.data;}}));
import { operationalRegistersService } from './operationalRegistersService';
beforeEach(()=>vi.clearAllMocks());
describe('operational register recovery client',()=>{
 it('retries the exact PRL creation operation after an uncertain response',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:new TypeError('Failed to fetch')}).mockResolvedValueOnce({data:'certificate',error:null});
  const payload={profile_id:'worker',title:'Certificado',kind:'Formacion'};
  await expect(operationalRegistersService.createOnce('prl','operation',payload)).rejects.toThrow('Failed to fetch');
  expect(await operationalRegistersService.createOnce('prl','operation',payload)).toBe('certificate');
  expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  expect(mocks.rpc.mock.calls[0][0]).toBe('dmp_create_operational_register_once');
 });
 it('keeps edits on the existing update RPC',async()=>{
  mocks.rpc.mockResolvedValue({data:'vehicle',error:null});
  await operationalRegistersService.save('vehicle',{id:'vehicle',name:'Vehículo'});
  expect(mocks.rpc).toHaveBeenCalledWith('dmp_save_operational_register',{p_kind:'vehicle',p_payload:{id:'vehicle',name:'Vehículo'}});
 });
 it('rejects a missing operation or a supplied existing record before sending',()=>{
  expect(()=>operationalRegistersService.createOnce('vehicle','',{})).toThrow('operación');
  expect(()=>operationalRegistersService.createOnce('prl','operation',{id:'record'})).toThrow('operación');
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
