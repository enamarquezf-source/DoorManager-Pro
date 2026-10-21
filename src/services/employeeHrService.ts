import { supabase } from '../lib/supabase/client';
import { currentProfileCompanyId, expectData } from './query';
import { type EmployeeHr, type HrKind } from '../shared/employeeHr';
export const employeeHrService = {
  get(profileId:string){return expectData<EmployeeHr>(supabase.rpc('dmp_employee_hr',{p_profile_id:profileId}),{service:'employeeHrService',operation:'consultar ficha laboral'});},
  async save(id:string,profileId:string,kind:HrKind,from:string,to:string|null,payload:Record<string,any>,file?:File|null){
    let path:string|null=null;
    if(file){
      if(file.size<1||file.size>10485760||file.type!=='application/pdf'||!file.name.toLowerCase().endsWith('.pdf')||new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw new Error('Adjunta un PDF válido de hasta 10 MB.');
      const company=await currentProfileCompanyId();path=`${company}/${profileId}/${id}.pdf`;
      const {error}=await supabase.storage.from('dmp-hr').upload(path,file,{contentType:'application/pdf',upsert:false});
      if(error&&String(error.statusCode)!=='409'&&!/already exists/i.test(error.message))throw new Error('No se ha podido subir el PDF laboral.');
    }
    return expectData<string>(supabase.rpc('dmp_save_employee_hr',{p_id:id,p_profile_id:profileId,p_kind:kind,p_from:from,p_to:to,p_payload:payload,p_path:path,p_filename:file?.name??null}),{service:'employeeHrService',operation:'guardar datos laborales'});
  },
  async document(path:string){const {data,error}=await supabase.storage.from('dmp-hr').createSignedUrl(path,60);if(error||!data?.signedUrl)throw new Error('No se ha podido abrir el documento laboral.');return data.signedUrl;},
};
