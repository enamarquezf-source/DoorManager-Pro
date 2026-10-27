import {technicianOfflineService} from './technicianOfflineService';
import {checksService} from './checksService';

type Completion = {synced:boolean;queued:boolean;message:string};
/** Save the close intent before sending: blocks and photos keep their dependency order. */
export async function completeAndSyncCheck(checkId:string,workOrderId:string|null|undefined,result:string,onProgress?:(message:string)=>void):Promise<Completion> {
 const pending=await technicianOfflineService.pending();
 if(workOrderId&&!pending.some(change=>change.checkId===checkId&&change.type==='check-finish')) {
  await technicianOfflineService.upsert({type:'check-finish',checkId,workOrderId,payload:{result,autoSync:true}});
 }
 if(!navigator.onLine)return {synced:false,queued:Boolean(workOrderId),message:workOrderId?'Check guardado en este dispositivo. Se enviará automáticamente cuando vuelva la conexión.':'Bloques guardados en este dispositivo. Conecta y vuelve a finalizar este check sin parte asociado.'};
 try {
  const sent=await technicianOfflineService.sync(onProgress,workOrderId?{workOrderId}:{checkId},true);
  if(sent.failed||sent.pending)return {synced:false,queued:Boolean(workOrderId),message:'El trabajo sigue guardado. Quedan datos del parte sin enviar: '+(sent.errors[0]??`${sent.pending} cambios pendientes. Revisa Pendientes y reintenta.`)};
  if(!workOrderId)await checksService.finish(checkId,result);
  return {synced:true,queued:Boolean(workOrderId),message:'Check finalizado y sincronizado, incluidas sus respuestas y fotos.'};
 }catch(error) {
  return {synced:false,queued:Boolean(workOrderId),message:'El trabajo sigue guardado; no se ha confirmado la sincronización. '+(error instanceof Error?error.message:'Revisa la conexión y reintenta.')};
 }
}
let retrying=false;
/** Only closures explicitly submitted with autoSync may resume in the background. */
export async function retryPendingCheckFinishes() {
 if(retrying||!navigator.onLine)return;
 retrying=true;
 try {
  const pending=await technicianOfflineService.pending();
  const works=[...new Set(pending.filter(change=>change.type==='work-finish'&&change.payload.autoSync===true).map(change=>change.workOrderId))];
  for(const workOrderId of works)await technicianOfflineService.sync(undefined,{workOrderId});
  const checks=pending.filter(change=>change.type==='check-finish'&&change.payload.autoSync===true&&!works.includes(change.workOrderId));
  const sentWorks=new Set<string>();
  for(const change of checks){if(change.workOrderId){if(sentWorks.has(change.workOrderId))continue;sentWorks.add(change.workOrderId);await technicianOfflineService.sync(undefined,{workOrderId:change.workOrderId});}else if(change.checkId)await technicianOfflineService.sync(undefined,{checkId:change.checkId});}
 }finally{retrying=false;}
}

/** A work closure drains the whole work, including every check's prerequisites. */
export async function completeAndSyncWork(workOrderId:string,currentStatus:string,onProgress?:(message:string)=>void):Promise<Completion> {
 const pending=await technicianOfflineService.pending();
 if(!pending.some(change=>change.workOrderId===workOrderId&&change.type==='work-finish')) {
  await technicianOfflineService.upsert({type:'work-finish',workOrderId,payload:{reason:'Cierre técnico confirmado por usuario',currentStatus,autoSync:true}});
 }
 if(!navigator.onLine)return {synced:false,queued:true,message:'Parte completo guardado en este dispositivo. Se enviará automáticamente a SAT cuando vuelva la conexión.'};
 try {
  const sent=await technicianOfflineService.sync(onProgress,{workOrderId},true);
  if(sent.failed||sent.pending)return {synced:false,queued:true,message:'El parte sigue guardado. Hay datos sin enviar y el cierre no se ha confirmado: '+(sent.errors[0]??`${sent.pending} cambios pendientes. Revisa Pendientes y reintenta.`)};
  return {synced:true,queued:true,message:'Parte finalizado y enviado a SAT con sus checks, fotos, horas, materiales, recursos y firma registrados.'};
 }catch(error){return {synced:false,queued:true,message:'El parte sigue guardado; no se ha confirmado el envío. '+(error instanceof Error?error.message:'Revisa la conexión y reintenta.')};}
}
