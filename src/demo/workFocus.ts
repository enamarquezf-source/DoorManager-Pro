import {publicDemoEnabled} from './model';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readDemoWork(companyId:string) {try{const id=sessionStorage.getItem('dmp-demo-focus-work:'+companyId);return id&&uuid.test(id)?id:null;}catch{return null;}}
export function expectedDemoWork(profileId:string) {try{const id=sessionStorage.getItem('dmp-demo-expected-work:'+profileId);return id&&uuid.test(id)?id:undefined;}catch{return undefined;}}
export function clearExpectedDemoWork(profileId:string) {try{sessionStorage.removeItem('dmp-demo-expected-work:'+profileId);}catch{}}
export function rememberDemoWork(companyId:string,workOrderId:unknown) {
 if(!publicDemoEnabled||!uuid.test(companyId)||typeof workOrderId!=='string'||!uuid.test(workOrderId))return;
 try{sessionStorage.setItem('dmp-demo-focus-work:'+companyId,workOrderId);}catch{}
 window.dispatchEvent(new CustomEvent('dmp-demo-work-created',{detail:{companyId,workOrderId}}));
}
