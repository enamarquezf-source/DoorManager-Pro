import { supabase } from '../lib/supabase/client';
import { currentProfileCompanyId,expectData } from './query';
import { clientsService } from './clientsService';
import { sitesService } from './sitesService';
import { equipmentService } from './equipmentService';
import { profilesService } from './profilesService';
export type MaintenanceContract=Record<string,any>&{id:string;title:string;status:string;starts_on:string;ends_on:string;visits:any[];equipment:any[];definition:Record<string,any>};
export const maintenanceService={
 async list(){const company=await currentProfileCompanyId();const rows:MaintenanceContract[]=[];for(let offset=0;;offset+=500){const page=await expectData<MaintenanceContract[]>(supabase.from('maintenance_contracts').select('*,client:clients!maintenance_contracts_client_id_fkey(id,legal_name),site:sites!maintenance_contracts_site_id_fkey(id,name),equipment:maintenance_contract_equipment(equipment_id,equipment:equipment!maintenance_contract_equipment_equipment_id_fkey(id,code,brand,model,internal_location)),visits:maintenance_visits(*,work_order:work_orders!maintenance_visits_work_order_id_fkey(id,code,status))').eq('company_id',company).order('starts_on',{ascending:false}).order('id').range(offset,offset+499),{service:'maintenanceService',operation:'consultar contratos de mantenimiento'});rows.push(...page);if(page.length<500)return rows;}},
 async options(){const [clients,sites,equipment,types,technicians]=await Promise.all([clientsService.list(),sitesService.list(),equipmentService.list(),equipmentService.types(),profilesService.listTechnicians()]);return {clients,sites,equipment,types,technicians};},
 async save(id:string,payload:Record<string,any>){const saved=await expectData<string>(supabase.rpc('dmp_save_maintenance_contract',{p_id:id,p_payload:payload}),{service:'maintenanceService',operation:'guardar contrato y plan de visitas'});if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('dmp-maintenance-saved',{detail:{id:saved}}));return saved;},
 generateVisit(id:string){return expectData<string>(supabase.rpc('dmp_generate_maintenance_visit',{p_visit:id}),{service:'maintenanceService',operation:'generar parte de mantenimiento'});},
 generatePlan(id:string){return expectData<number>(supabase.rpc('dmp_generate_maintenance_plan',{p_contract:id}),{service:'maintenanceService',operation:'generar partes del plan'});},
 status(id:string,status:string){return expectData<string>(supabase.rpc('dmp_change_maintenance_contract',{p_id:id,p_status:status}),{service:'maintenanceService',operation:'actualizar estado del contrato'});},
 visit(id:string,date:string,status:string){return expectData<string>(supabase.rpc('dmp_change_maintenance_visit',{p_id:id,p_date:date,p_status:status}),{service:'maintenanceService',operation:'reprogramar visita'});},
 coverage(id:string,operationId:string,selection:any[]){return expectData<string>(supabase.rpc('dmp_set_maintenance_equipment',{p_id:id,p_operation_id:operationId,p_selection:selection}),{service:'maintenanceService',operation:'actualizar equipos del contrato'});},
};
