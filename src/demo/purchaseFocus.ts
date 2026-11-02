import {publicDemoEnabled} from './model';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function rememberDemoPurchase(companyId:string,orderId:string){if(!publicDemoEnabled||!companyId||!uuid.test(orderId))return;try{sessionStorage.setItem('dmp-demo-focus-purchase:'+companyId,orderId);}catch{}}
export function demoPurchaseInvoiceRoute(companyId:string){try{const id=sessionStorage.getItem('dmp-demo-focus-purchase:'+companyId);if(id&&uuid.test(id))return '/app/modulos/facturas-proveedor?nuevo=1&order='+id;}catch{}return '/app/modulos/compras';}
