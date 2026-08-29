import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/091_remove_legacy_office_gate_from_guided_billing.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_guided_billing_without_office_091.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_guided_billing_without_office_091.sql'), 'utf8');
const probe = readFileSync(resolve(root, 'supabase/verification/probe_guided_billing_candidates_091.sql'), 'utf8');

describe('091 guided billing without duplicate Office validation', () => {
  it('keeps modern routing and the legacy Office branch in the shared SQL helper', () => {
    expect(migration).toContain("sat_review_status='approved' and w.sat_review_destination='facturacion'");
    expect(migration).toContain("sat_review_destination='comercial' and w.commercial_review_status='approved'");
    expect(migration).toContain("w.office_validation_status='validated' and w.economic_status='pendiente_facturar'");
    expect(migration).toContain("economic_status in ('pendiente_facturar','pendiente_validacion')");
  });

  it('routes all billing RPC gates through the helper and keeps grants', () => {
    expect(migration).toContain('dmp_guided_billing_eligible');
    expect(migration).toContain('fiscal_snapshot');
    expect(migration).toContain("grant execute on function public.dmp_issue_invoice(uuid) to authenticated");
  });

  it('keeps verification scripts read-only and single-result-set', () => {
    for (const sql of [preflight, postflight, probe]) expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop)\b/im);
    expect(preflight).toContain('select check_name, passed, detail from checks');
    expect(postflight).toContain('select check_name, passed, detail from checks');
  });

  it('parses all 091 SQL files', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight, probe]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });
});
