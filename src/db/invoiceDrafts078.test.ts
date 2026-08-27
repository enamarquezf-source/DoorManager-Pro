import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/078_invoice_draft_review_and_issue.sql');
const preflight = read('../../supabase/verification/preflight_invoice_drafts_078.sql');
const postflight = read('../../supabase/verification/postflight_invoice_drafts_078.sql');
const billingService = read('../services/billingService.ts');
const billingModule = read('../modules/BillingModule.tsx');
const draftLifecycle = migration.split('create or replace function public.dmp_record_invoice_payment')[0];

describe('078 invoice drafts', () => {
  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('separates prepare, edit and issue without fiscal or payment side effects', () => {
    expect(migration).toContain("status in('borrador','emitida','parcialmente_cobrada','cobrada','cancelada')");
    expect(migration).toContain('alter column code drop not null');
    expect(migration).toContain('dmp_prepare_invoice_from_work_order');
    expect(migration).toContain('dmp_update_invoice_draft');
    expect(migration).toContain('dmp_issue_invoice');
    expect(migration).toContain('revoke all on function public.dmp_create_invoice_from_work_order(uuid,numeric,date,text) from public,anon,authenticated');
    expect(migration).toContain("if v_invoice.status<>'borrador'");
    expect(migration).toContain('el borrador debe conservar su parte asociado');
    expect(migration).toContain('v_total<=0');
    expect(migration).toContain("v_invoice.status in('borrador','cancelada')");
    expect(migration).toContain('INVOICE_DRAFT_CREATE');
    expect(migration).toContain('INVOICE_DRAFT_UPDATE');
    expect(migration).not.toContain('estimated_sale_amount=');
    expect(draftLifecycle).not.toContain('insert into public.invoice_payments');
    expect(migration).not.toContain('dmp_adjust_material_stock');
  });

  it('supports zero-sale historical preparation and keeps candidate/issue gates distinct', () => {
    expect(migration).toContain("if v_work.office_validation_status<>'validated' or v_work.economic_status<>'pendiente_facturar'");
    expect(migration).toContain("if coalesce(v_work.warranty,false) or not coalesce(v_work.billable,true)");
    expect(migration).toContain("v_sale:=case when coalesce(v_work.sale_amount,0)>0 then round(v_work.sale_amount,2) else 0 end");
    expect(migration).toContain("insert into public.invoice_work_orders");
    expect(preflight).toContain('candidate_sale_zero');
    expect(preflight).toContain('candidate_estimated_only');
    expect(preflight).toContain('candidate_without_amount');
    expect(postflight).toContain('ambiguous_candidates');
    expect(billingService).not.toContain('.gt(\'sale_amount\', 0)');
    expect(billingService).toContain("invoice_work_orders').select('work_order_id')");
    expect(billingModule).toContain('Preparar factura');
    expect(billingModule).toContain('Emitir factura');
  });

  it('keeps verification scripts read-only and preserves existing invoice/payment flows', () => {
    for (const sql of [preflight, postflight]) expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
    expect(postflight).toContain('from (select * from checks union all select * from summary) result');
    expect(postflight).toContain('postcheck_078');
    expect(billingService).toContain('recordPayment');
    expect(billingService).toContain('reversePayment');
    expect(billingService).toContain('cancelInvoice');
    expect(billingModule).toContain("!['borrador', 'cancelada']");
  });
});
