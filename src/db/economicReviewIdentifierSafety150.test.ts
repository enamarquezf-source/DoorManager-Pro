import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { economicReviewSummary } from '../shared/economicReview';

const root = new URL('../../supabase/migrations/', import.meta.url);
const migration = readFileSync(new URL('150_restore_economic_review_identifier_safety.sql', root), 'utf8');
const definitions = readdirSync(root).filter((name) => name.endsWith('.sql')).sort().map((name) => ({ name, sql: readFileSync(new URL(name, root), 'utf8') })).filter(({ sql }) => /create or replace function public\.dmp_review_work_order_economic\(p_work_order_id uuid,p_decisions jsonb,p_reason text,p_zero_sale_confirmed boolean\)/i.test(sql));
const latest = definitions.at(-1)!;

describe('effective economic approval definition', () => {
  it('parses the migration and its PL/pgSQL body', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).error).toBeNull();
    expect(parser.parsePlpgsql(migration).error).toBeNull();
  });

  it('keeps collision-free identifiers in the last function definition, including future replacements', () => {
    const declaration = latest.sql.match(/declare\s+([\s\S]*?)\bbegin\b/i)![1];
    const names = declaration.split(';').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
    expect(names.every((name) => name.startsWith('v_'))).toBe(true);
    expect(latest.sql).toContain('group by decision_rows.kind,decision_rows.entry_id');
    expect(latest.sql).toContain('decision_element.value');
    expect(latest.sql).toContain('order by economic_entries.entry_kind,economic_entries.entry_id');
  });

  it('retains Commercial assignment, tenant, invoice, audit and source protections', () => {
    expect(migration).toContain("not public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain("v_work.sat_review_destination is distinct from 'comercial'");
    expect(migration).toContain('v_work.current_responsible_id is distinct from v_actor.id');
    expect(migration).toContain("v_work.commercial_review_status is distinct from 'pending'");
    expect(migration).toContain('assert_member_of_current_company(v_work.company_id)');
    expect(migration).toContain("invoice_record.status<>'cancelada'");
    expect(migration).toContain('where id=v_entry_id and company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null; end if;');
    expect(migration).toContain('(v_decision->>\'source\') is distinct from v_source');
    expect(migration).toContain("'ECONOMIC_REVIEW_APPROVE'");
    expect(migration).toContain('from public,anon');
  });

  it('preserves the reported part totals and a 150 euro approved margin', () => {
    const work = { economic_review_status: 'approved', sale_amount: 412.5, time_entries: [
      { duration_minutes: 360, hourly_cost: 35, hourly_price: 55, total_cost: 210, total_price: 330, contributes_to_sale: true, source: 'manual' },
      { duration_minutes: 90, hourly_cost: 35, hourly_price: 55, total_cost: 52.5, total_price: 82.5, contributes_to_sale: true, source: 'manual' },
    ] };
    expect(economicReviewSummary(work)).toEqual({ realCost: 262.5, proposedSale: 412.5, approvedSale: 412.5, margin: 150 });
  });
});
