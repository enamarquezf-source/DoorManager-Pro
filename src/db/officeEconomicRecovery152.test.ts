import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/152_office_economic_review_and_sat_recovery.sql', 'utf8');
describe('Office and SAT economic recovery', () => {
  it('allows Office to approve and reopen while preserving scoped financial guards', () => {
    expect(sql).toContain("array['superadmin','SAT','Comercial','Gerencia','Oficina']");
    expect(sql).toContain('assert_member_of_current_company');
    expect(sql).toContain('economic_review_status=\'approved\'');
    expect(sql).toContain('v_expected_count<>v_actual_count');
    expect(sql).toContain('v_kind');
    expect(sql).toContain('invoice_record.status<>\'cancelada\'');
    expect(sql).toContain('ECONOMIC_REVIEW_REOPEN');
  });
  it('shows approved technical work with unfinished economics in the SAT queue', () => {
    expect(sql).toContain("then 'Corrección económica'");
    expect(sql).toContain("wo.economic_review_status is distinct from 'approved'");
    expect(sql).toContain('coalesce(wo.sale_amount,0)<=0');
    expect(sql).toContain("wo.status in ('Finalizado tecnicamente','Devuelto por SAT')");
  });
  it('keeps approved nonbillable work outside billing and does not rewrite historical approvals', () => {
    expect(sql).toContain("p_queue='billing' and wo.sat_review_status='approved' and (wo.economic_review_status is distinct from 'approved' or (coalesce(wo.billable,true) and coalesce(wo.sale_amount,0)>0))");
    expect(sql).not.toMatch(/^update public\.work_orders/im);
    expect(sql).toContain('p_billable is null or p_warranty is null');
    expect(sql).toContain("economic_review_status='pending'");
  });
  it('parses the complete transaction', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
  });
});
