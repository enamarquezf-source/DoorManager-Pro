// @vitest-environment happy-dom
import {expect,it,afterEach} from 'vitest';
import {demoPurchaseInvoiceRoute} from './purchaseFocus';
afterEach(()=>sessionStorage.clear());
it('carries the purchase into invoice preparation without sharing another company context',()=>{
 const id='00000000-0000-4000-8000-000000000001';sessionStorage.setItem('dmp-demo-focus-purchase:own',id);
 expect(demoPurchaseInvoiceRoute('own')).toBe('/app/modulos/facturas-proveedor?nuevo=1&order='+id);
 expect(demoPurchaseInvoiceRoute('other')).toBe('/app/modulos/compras');
 sessionStorage.setItem('dmp-demo-focus-purchase:own','../../other');expect(demoPurchaseInvoiceRoute('own')).toBe('/app/modulos/compras');
});
