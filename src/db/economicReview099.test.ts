import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { economicEntryRows, economicReviewSummary } from '../shared/economicReview';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/099_economic_review_and_structured_billing.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_economic_review_099.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_economic_review_099.sql'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/billingService.ts'), 'utf8');
const workOrdersService = readFileSync(resolve(root, 'src/services/workOrdersService.ts'), 'utf8');
const component = readFileSync(resolve(root, 'src/components/EconomicReviewPanel.tsx'), 'utf8');

describe('099 economic review and structured billing', () => {
  it('uses one canonical calculator and applies contributes_to_sale to all entry families', () => {
    expect(migration).toContain('dmp_calculate_work_order_economics');
    for (const table of ['work_order_time_entries', 'work_order_materials', 'work_order_cost_entries']) expect(migration).toContain(table);
    expect(migration).toContain('and contributes_to_sale');
    expect(migration).not.toContain('create table public.invoice_lines');
    expect(migration).not.toContain('create table public.economic');
  });

  it('preserves cost independently from sale and blocks zero-price sellable entries', () => {
    expect(migration).toContain("total_cost");
    expect(migration).toContain('un concepto vendible necesita precio snapshot positivo');
    expect(migration).toContain("v_sale := 0");
    expect(migration).toContain("v_margin := round(v_sale - v_real_cost, 2)");
    expect(migration).toContain('total_price is null');
    expect(migration).toContain('duration_minutes is null');
    expect(migration).toContain('used_quantity is null');
    expect(migration).toContain('quantity is null');
  });

  it('keeps the calculator tenant-scoped and private from direct authenticated calls', () => {
    expect(migration).toContain('assert_member_of_current_company(v_work.company_id)');
    expect(migration).toContain('revoke all on function public.dmp_calculate_work_order_economics(uuid) from public, anon, authenticated');
    expect(postflight).toContain('calculate_direct_access_denied');
    expect(postflight).toContain('technician_direct_access_denied');
  });

  it('preserves source and applies the source-aware no-quote formula', () => {
    expect(migration).not.toContain('source = v_source');
    expect(migration).toContain('source pertenece al snapshot historico');
    expect(migration).toContain("coalesce(source, 'manual') <> 'quote'");
    expect(migration).toContain("coalesce(m.source, 'manual') <> 'quote'");
    expect(migration).toContain("source = 'additional' and contributes_to_sale");
  });

  it('requires complete unique review coverage and freezes linked economics', () => {
    expect(migration).toContain('la revision debe cubrir todos los conceptos economicos');
    expect(migration).toContain('no se puede repetir un concepto economico');
    expect(migration).toContain('concepto ajeno al parte');
    expect(migration).toContain('no se puede modificar un parte asociado a un borrador o factura');
    expect(migration).toContain("v_work.economic_review_status = 'approved'");
  });

  it('removes the old unique index while retaining a scoped lookup index', () => {
    expect(migration).toContain('drop index if exists public.invoice_work_orders_active_work_unique');
    expect(migration).toContain('invoice_work_orders_active_work_lookup');
  });

  it('keeps candidate lines on mismatch and gates issue behind an audited override', () => {
    const prepare = migration.slice(migration.indexOf('create or replace function public.dmp_prepare_invoice_from_work_order'), migration.indexOf('create or replace function public.dmp_update_invoice_draft'));
    expect(prepare).not.toContain('delete from public.invoice_work_orders');
    expect(prepare).toContain("v_detail_status := 'inconsistent'");
    expect(migration).toContain('INVOICE_ISSUE_OVERRIDE');
    expect(migration).toContain('requiere excepción autorizada');
    expect(migration).toContain('motivo de excepcion es obligatorio');
  });

  it('preserves 091 eligibility and the 092/093 deletion RPC', () => {
    expect(migration).toContain('dmp_guided_billing_eligible');
    expect(migration).not.toContain('drop function if exists public.dmp_delete_invoice_draft');
    expect(migration).not.toContain('drop function if exists public.dmp_issue_invoice(uuid)');
    expect(migration).toContain('create or replace function public.dmp_issue_invoice(p_invoice_id uuid)');
    expect(migration).toContain('dmp_issue_invoice(uuid, boolean, text)');
  });

  it('keeps technical status and every sale-contributing entry family in billing', () => {
    expect(migration).toContain("set status = 'Finalizado tecnicamente'");
    expect(migration).toContain("c.source = 'additional' and c.contributes_to_sale");
    expect(migration).toContain('nullif(ql.total_price, 0), nullif(ql.total, 0)');
    expect(migration).toContain('dmp_guided_billing_eligible(v_work.id)');
  });

  it('exposes structured economic review without granting technical permissions', () => {
    expect(component).toContain('Revisión económica del parte');
    expect(component).toContain('Precio venta snapshot');
    expect(component).toContain('Facturable');
    expect(component).toContain('Precio snapshot obligatorio');
    expect(workOrdersService).toContain("dmp_review_work_order_economic");
    expect(service).toContain("dmp_issue_invoice', { p_invoice_id: invoiceId, p_override");
  });

  it('calculates the contractual fixture from snapshots, not catalog data', () => {
    const workOrder = {
      sale_amount: 660,
      time_entries: [{ id: 'h', duration_minutes: 360, hourly_cost: 22, hourly_price: 110, total_cost: 132, total_price: 660, contributes_to_sale: true, source: 'manual', description: 'Horas' }],
      materials: [{ id: 'm', used_quantity: 1, unit_cost: 200, unit_price: 0, total_cost: 200, total_price: 0, contributes_to_sale: false, source: 'manual', description: 'TS970' }],
      cost_entries: [{ id: 't', quantity: 1, unit_cost: 35, unit_price: 55, total_cost: 35, total_price: 55, contributes_to_sale: false, source: 'manual', cost_type: 'desplazamiento' }],
    };
    const rows = economicEntryRows(workOrder);
    expect(economicReviewSummary(workOrder, rows).realCost).toBe(367);
    expect(economicReviewSummary(workOrder, rows).proposedSale).toBe(660);
    const withTravel = rows.map((row) => row.id === 't' ? { ...row, contributes_to_sale: true } : row);
    expect(economicReviewSummary(workOrder, withTravel).proposedSale).toBe(715);
    const withMaterial = withTravel.map((row) => row.id === 'm' ? { ...row, contributes_to_sale: true, unit_price: 350, sale_total: 350 } : row);
    expect(economicReviewSummary(workOrder, withMaterial).proposedSale).toBe(1065);
  });

  it('calculates accepted-quote additions separately from quote-origin snapshots', () => {
    const workOrder = { quote_id: 'q', quoted_sale_amount: 500, time_entries: [{ id: 'q-time', duration_minutes: 60, unit_price: 100, total_price: 100, source: 'quote', contributes_to_sale: true }], materials: [{ id: 'extra', used_quantity: 1, unit_price: 55, total_price: 55, source: 'additional', contributes_to_sale: true }] };
    expect(economicReviewSummary(workOrder).proposedSale).toBe(555);
  });

  it('preserves structured multiline associations and aggregate invoiced amount', () => {
    expect(migration).not.toContain('case when not v_attached then v_work.id else null end');
    expect(migration).toContain('group by work_order_id');
    expect(migration).toContain('invoiced_amount = totals.subtotal');
    expect(migration).toContain('requiere exactamente un parte por factura');
    expect(migration).toContain('todas las lineas activas deben conservar el parte asociado');
  });

  it('guards every invoice tax total against the malformed round signature', () => {
    expect(migration).not.toMatch(/\(1 \+ v_tax \/ 100,\s*2\)\)/);
    expect(migration.match(/round\(v_line\.subtotal \* \(1 \+ v_tax \/ 100\), 2\)/g) ?? []).toHaveLength(6);
    expect(migration.match(/round\(v_line\.subtotal \* v_tax \/ 100, 2\)/g) ?? []).toHaveLength(6);
  });

  it('revalidates stale drafts and only allows override for a real mismatch', () => {
    expect(migration).toContain('v_current_economics := public.dmp_calculate_work_order_economics(v_work.id)');
    expect(migration).toContain('v_stale :=');
    expect(migration).toContain('el borrador esta obsoleto');
    expect(migration).toContain('la excepcion solo aplica a una inconsistencia economica real');
    expect(migration).toContain("'expected_amount', v_current_sale");
    expect(migration).toContain("'actual_amount', v_subtotal");
    expect(migration).toContain("'previous_expected_amount', v_invoice.economic_expected_amount");
    expect(migration).toContain('INVOICE_ISSUE_OVERRIDE');
  });

  it('keeps verification SQL read-only, single-result-set, and parseable', async () => {
    const migrationParser = await pgQuery();
    const migrationResult = migrationParser.parse(migration);
    expect(migrationResult.error).toBeNull();
    expect(migrationResult.parse_tree.stmts).toHaveLength(32);
    for (const [sql, statements] of [[preflight, 1], [postflight, 1]] as const) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(statements);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
      expect(sql).toContain('select check_name, passed, detail from checks');
    }
  });
});
