import {publicDemoEnabled} from './model';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function rememberDemoPurchase(companyId:string,orderId:string){if(!publicDemoEnabled||!companyId||!uuid.test(orderId))return;try{sessionStorage.setItem('dmp-demo-focus-purchase:'+companyId,orderId);}catch{}}
export function demoPurchaseInvoiceRoute(companyId:string){try{const id=sessionStorage.getItem('dmp-demo-focus-purchase:'+companyId);if(id&&uuid.test(id)){const invoice=sessionStorage.getItem('dmp-demo-purchase-invoice:'+companyId+':'+id);return invoice&&uuid.test(invoice)?'/app/modulos/facturas-proveedor?id='+invoice:'/app/modulos/facturas-proveedor?nuevo=1&order='+id;}}catch{}return '/app/modulos/compras';}

export function rememberDemoPurchaseInvoice(companyId:string,orderId:string,invoiceId:string){if(!publicDemoEnabled||!companyId||!uuid.test(orderId)||!uuid.test(invoiceId))return;rememberDemoPurchase(companyId,orderId);try{sessionStorage.setItem('dmp-demo-purchase-invoice:'+companyId+':'+orderId,invoiceId);}catch{}}
