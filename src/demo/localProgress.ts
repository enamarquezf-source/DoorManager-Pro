import type {OfflineChange} from '../services/technicianOfflineService';
/** Guide evidence includes durable local drafts; business totals still come from the server. */
export function withLocalProgress(remote:Record<string,number>,changes:OfflineChange[],workOrderId:string) {
 const local=changes.filter(change=>change.workOrderId===workOrderId&&change.status!=='synced');
 const result:Record<string,number>={...remote,local_pending:local.length};
 result.photos=(remote.photos??0)+local.filter(change=>change.type==='photo').length;
 result.times=(remote.times??0)+local.filter(change=>change.type==='time').length;
 result.signatures=(remote.signatures??0)+local.filter(change=>change.type==='signature').length;
 result.work_notes=Math.max(remote.work_notes??0,local.some(change=>(change.type==='work-fields'&&String(change.payload.work_performed??'').trim())||(change.type==='work-note'&&String(change.payload.work??'').trim()))?1:0);
 result.checks=(remote.checks??0)+local.filter(change=>change.type==='check-block').reduce((sum,change)=>sum+(change.payload.items??[]).filter((item:any)=>item.result!=='Sin revisar').length,0);
 // A queued close is not an acknowledged hand-off to SAT.
 return result;
}
