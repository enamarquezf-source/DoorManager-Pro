import { beforeEach,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),upload:vi.fn(),remove:vi.fn(),eq:vi.fn(),result:null as any}));
vi.mock('../lib/supabase/client',()=>({supabase:{rpc:mock.rpc,from:()=>{const chain:any={select:()=>chain,eq:(...args:any[])=>{mock.eq(...args);return chain;},maybeSingle:async()=>({data:mock.result,error:null})};return chain;},storage:{from:()=>({upload:mock.upload,remove:mock.remove})}}}));
vi.mock('./query',()=>({currentCompanyId:async()=> 'company',currentProfileId:async()=> 'profile',contains:()=>'',expectData:async(value:any)=>{const result=await value;if(result.error)throw result.error;return result.data;}}));
vi.mock('../shared/signedFiles',()=>({filesBucket:'dmp-files',withSignedFileUrl:(value:any)=>value}));
import { checksService } from './checksService';
const change=()=>({id:'photo-op',type:'photo' as const,checkId:'check',workOrderId:'work',blockId:'block',sectionId:'section',payload:{id:'local-photo',itemId:'motor',sectionId:'section',name:'motor.jpg',dataUrl:'data:image/jpeg;base64,YQ==',description:'Motor roto'},createdAt:'2026-10-22',updatedAt:'2026-10-22',status:'pending' as const});
beforeEach(()=>{vi.clearAllMocks();mock.result={id:'result'};mock.upload.mockResolvedValue({error:null});mock.rpc.mockResolvedValue({data:'photo-remote',error:null});});
it('passes the exact component and zone to photo registration',async()=>{
 expect(await checksService.syncOfflinePhoto(change())).toBe('photo-remote');expect(mock.eq).toHaveBeenCalledWith('check_id','check');expect(mock.eq).toHaveBeenCalledWith('item_id','motor');
 expect(mock.rpc).toHaveBeenCalledWith('register_check_photo',expect.objectContaining({p_payload:expect.objectContaining({check_id:'check',item_id:'motor',metadata:expect.objectContaining({item_id:'motor',section_id:'section'})})}));
});
it('keeps a photo pending before upload when its component result is missing',async()=>{
 mock.result=null;await expect(checksService.syncOfflinePhoto(change())).rejects.toThrow(/primero el resultado del componente/);expect(mock.upload).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
