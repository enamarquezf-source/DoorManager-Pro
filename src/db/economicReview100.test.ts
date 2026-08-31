import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { economicEntryRows, economicReviewSummary } from '../shared/economicReview';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/100_economic_review_billing_hardening.sql'), 'utf8');
const migration099 = readFileSync(resolve(root, 'supabase/migrations/099_economic_review_and_structured_billing.sql'), 'utf8');
const cancellation074 = readFileSync(resolve(root, 'supabase/migrations/074_invoicing_and_collections.sql'), 'utf8');
const checks = ['supabase/verification/preflight_economic_review_100.sql', 'supabase/verification/postflight_economic_review_billing_hardening_100.sql'].map((file) => readFileSync(resolve(root, file), 'utf8'));
const panel = readFileSync(resolve(root, 'src/components/EconomicReviewPanel.tsx'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/workOrdersService.ts'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

describe('100 economic review and billing hardening', () => {
  it('defines the explicit review/reopen contracts without tables', () => {
    expect(migration).toContain('p_zero_sale_confirmed boolean');
    expect(migration).toContain('dmp_reopen_work_order_economic');
    expect(migration).toContain('ECONOMIC_REVIEW_REOPEN');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).toContain('if not coalesce(w.billable,true) then sale:=0');
  });

  it('covers PAR29, warranty, reopen freeze, manual and multi-part billing contracts', () => {
    expect(migration).toContain('p_zero_sale_confirmed');
    expect(migration).toContain('coalesce(w.billable,true) and coalesce(w.sale_amount,0)>0');
    expect(migration).toContain('warranty_sale');
    expect(migration).toContain('facturabilidad explicita requerida');
    expect(migration).toContain('line_before');
    expect(migration).toContain('line_after');
    expect(migration).toContain("i.status in ('borrador','emitida','parcialmente_cobrada','cobrada')");
    expect(migration).toContain('work_order_id,description,quantity,unit_price');
    expect(migration).toContain('group by work_order_id');
    expect(migration).toContain('where invoice_id=i.id and deleted_at is null and work_order_id is not null');
    expect(migration).toContain("status in ('borrador','emitida','parcialmente_cobrada','cobrada')");
    expect(migration).toContain("status<>'cancelada'");
    expect(migration).toContain("jsonb_build_object('work_order_id'");
    expect(migration).toContain("'works'");
  });

  it('classifies invoice modes and isolates strict economic comparison', () => {
    expect(migration).toContain('v_work_count integer; v_manual_line_count integer; v_strict_single boolean');
    expect(migration).toContain('v_strict_single:=v_work_count=1 and v_manual_line_count=0');
    expect(migration).toContain('strict_single:=work_count=1 and manual_line_count=0');
    expect(migration).toContain('economic_expected_amount=expected');
    expect(migration).toContain('economic_expected_amount=case when strict_single then sale else null end');
    expect(migration).toContain("'invoice_mode'");
    expect(migration).toContain('if strict_single and round(l.subtotal,2)<>sale then stale:=true');
    expect(migration).toContain('if stale and not p_override then raise exception');
    expect(migration).toContain("if p_override and reason='' then raise exception");
    expect(migration).toContain("if not exists(select 1 from public.invoice_work_orders where invoice_id=i.id and deleted_at is null) or invalid>0 or total<=0 then raise exception");
    const hybrid = [{ workOrderId: 'PAR-001', subtotal: 200 }, { workOrderId: null, subtotal: 50 }];
    expect(hybrid.reduce((sum, line) => sum + line.subtotal, 0)).toBe(250);
    expect(hybrid.filter((line) => line.workOrderId === 'PAR-001').reduce((sum, line) => sum + line.subtotal, 0)).toBe(200);
  });

  it('calculates the PAR-29 fixture and preserves partial warranty costs', () => {
    const part = { sale_amount: 0, warranty: false, billable: true, time_entries: [{ id: 'h', duration_minutes: 120, hourly_cost: 22, hourly_price: 110, total_cost: 44, total_price: 220, source: 'manual', contributes_to_sale: true }], materials: [{ id: 'm', used_quantity: 1, unit_cost: 79, unit_price: 0, total_cost: 79, total_price: 0, source: 'manual', contributes_to_sale: false }], cost_entries: [{ id: 't', quantity: 1, unit_cost: 35, unit_price: 55, total_cost: 35, total_price: 55, source: 'manual', contributes_to_sale: true }] };
    const summary = economicReviewSummary(part, economicEntryRows(part));
    expect(summary).toMatchObject({ realCost: 158, proposedSale: 275, approvedSale: 275, margin: 117 });
    const warranty = { ...part, warranty: true };
    expect(economicReviewSummary(warranty, economicEntryRows(warranty)).proposedSale).toBe(275);
    expect(economicReviewSummary(warranty, economicEntryRows(warranty)).realCost).toBe(158);
  });

  it('requires explicit per-line choices and exposes the entered sale clearly', () => {
    expect(panel).toContain('PENDIENTE DE DECISIÓN');
    expect(panel).toContain('Facturable: Sí');
    expect(panel).toContain('Facturable: No');
    expect(panel).toContain('ENTRA EN VENTA:');
    expect(panel).toContain('NO ENTRA EN VENTA');
    expect(panel).toContain('Selecciona Facturable Sí o No para cada concepto.');
    expect(service).toContain('p_zero_sale_confirmed: zeroSaleConfirmed');
    expect(service).toContain('dmp_reopen_work_order_economic');
  });

  it('keeps the 099 security and audit invariants while adding 100 behavior', () => {
    expect(migration).not.toContain('if v_warranty then v_billable');
    expect(migration).toContain('revoke all on function public.dmp_calculate_work_order_economics(uuid) from public,anon,authenticated');
    expect(migration).toContain("'ECONOMIC_REVIEW_REOPEN'");
    expect(migration).toContain('line_before');
    expect(migration).toContain('line_after');
    expect(migration).toContain('facturabilidad explicita requerida');
    expect(migration).toContain('p_zero_sale_confirmed');
    expect(migration).toContain("array['superadmin','SAT','Gerencia']) or (public.has_any_role(array['Tecnico'])");
    expect(migration).not.toContain("array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico'])");
  });

  it('keeps guided eligibility internal because runtime uses billing RPCs', () => {
    expect(migration).toContain('revoke all on function public.dmp_guided_billing_eligible(uuid) from public,anon,authenticated');
    expect(service).not.toContain('dmp_guided_billing_eligible');
    expect(panel).not.toContain('dmp_guided_billing_eligible');
  });

  it('closes the returned freeze and cancelled rebill contracts', () => {
    expect(migration).toContain("w.economic_review_status='approved'");
    expect(migration).toContain("w.economic_review_status='not_started' and w.economic_status='pendiente_facturar' and w.office_validation_status='validated'");
    expect(migration).toContain("economic_review_status='returned'");
    expect(migration).toContain("i.status in ('borrador','emitida','parcialmente_cobrada','cobrada')");
    expect(migration).toContain("i.status<>'cancelada'");
    expect(migration).toContain("economic_review_status='approved'");
    expect(migration099).toContain("i.status <> 'cancelada'");
    expect(cancellation074).toContain('update public.invoice_work_orders set deleted_at=now()');
  });

  it('exposes unambiguous three and four argument review RPCs', () => {
    expect(migration).toContain('p_zero_sale_confirmed boolean)');
    expect(migration).not.toContain('p_zero_sale_confirmed boolean default false');
    expect(migration).toContain('p_reason text) returns jsonb language sql');
    expect(migration).toContain('$1,$2,$3,false');
    expect(migration).toContain('dmp_review_work_order_economic(uuid,jsonb,text,boolean)');
    expect(migration).toContain('grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated');
  });

  it('keeps Office out of technical finalization in SQL and UI', () => {
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia']) or (public.has_any_role(array['Tecnico'])");
    expect(app).toContain("['superadmin','SAT','Gerencia'].includes(role)");
  });

  it('keeps verification files single-statement and read-only', async () => {
    const migrationParser = await pgQuery();
    const migrationResult = migrationParser.parse(migration);
    expect(migrationResult.error).toBeNull();
    expect(migrationResult.parse_tree.stmts).toHaveLength(25);
    for (const sql of checks) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
  });
});
