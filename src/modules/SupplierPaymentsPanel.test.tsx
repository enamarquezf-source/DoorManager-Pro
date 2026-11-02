// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),list:vi.fn(async()=>[])}));
vi.mock('../services/supplierInvoicesService',()=>({supplierInvoicesService:{get:mocks.get}}));
vi.mock('../services/supplierPaymentsService',()=>({supplierPaymentMethods:['efectivo'],supplierPaymentSummary:()=>({total_amount:100,paid_amount:0,outstanding_amount:100}),supplierPaymentsService:{list:mocks.list}}));
vi.mock('../services/treasuryService',()=>({treasuryService:{accounts:async()=>[]}}));
vi.mock('../auth/permissions',()=>({hasPermission:()=>true}));
vi.mock('../services/paymentOperations',()=>({pendingPaymentAttempt:()=>null}));
import {SupplierPaymentsPanel} from './SupplierPaymentsPanel';
it('shows payment immediately after this invoice is registered without a page reload',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 mocks.get.mockResolvedValue({id:'own',status:'draft',currency_code:'EUR'});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<SupplierPaymentsPanel profile={{id:'actor',company_id:'company'} as any} invoiceId="own"/>));
  expect(host.querySelector('.supplier-payment-entry')).toBeNull();
  await act(async()=>window.dispatchEvent(new CustomEvent('dmp-supplier-invoice-registered',{detail:{id:'other'}})));
  expect(mocks.get).toHaveBeenCalledTimes(1);
  mocks.get.mockResolvedValue({id:'own',status:'registered',currency_code:'EUR'});
  await act(async()=>window.dispatchEvent(new CustomEvent('dmp-supplier-invoice-registered',{detail:{id:'own'}})));
  expect(host.querySelector('.supplier-payment-entry')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
