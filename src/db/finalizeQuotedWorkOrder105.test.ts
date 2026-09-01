import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/105_finalize_quoted_work_order_without_quote_write.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_finalize_quoted_work_order_105.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_finalize_quoted_work_order_105.sql'), 'utf8');
const probe = readFileSync(resolve(root, 'supabase/verification/probe_postflight_finalize_105.sql'), 'utf8');
const historicalGuard = readFileSync(resolve(root, 'supabase/migrations/072_quote_immutable_canonical_integrity.sql'), 'utf8');

describe('105 quoted work-order finalization', () => {
  it('keeps terminal quote protection and removes only the redundant quote write', () => {
    expect(historicalGuard).toContain("old.status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado')");
    expect(migration).toContain("dmp_quote_transition_apply(w.quote_id,'Ejecutado en cliente'");
    expect(migration).not.toContain('update public.quotes');
    expect(migration).toContain('update public.work_orders');
    expect(migration).toContain('TECHNICAL_FINALIZE_PENDING_OFFICE');
  });

  it('preserves finalize security and technical roles', () => {
    expect(migration).toContain("array['superadmin','SAT','Gerencia']");
    expect(migration).not.toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).toContain('security definer set search_path=public');
    expect(migration).toContain('grant execute on function public.dmp_finalize_work_order_technical(uuid,jsonb) to authenticated');
  });

  it('parses migration, preflight and postflight as read-only verification contracts', async () => {
    const parser = await pgQuery();
    const migrationResult = parser.parse(migration);
    expect(migrationResult.error).toBeNull();
    expect(migrationResult.parse_tree.stmts).toHaveLength(5);
    for (const sql of [preflight, postflight]) {
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).toContain('checks(check_name,passed,detail) as');
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
    const probeResult = parser.parse(probe);
    expect(probeResult.error).toBeNull();
    expect(probeResult.parse_tree.stmts).toHaveLength(1);
    expect(probe).toContain('checks(check_name,passed,detail) as');
  });
});
