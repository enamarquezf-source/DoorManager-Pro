import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const sql = readFileSync(new URL('../../supabase/migrations/149_repair_legacy_time_rate_snapshots.sql', import.meta.url), 'utf8');

describe('legacy time rate recovery 149', () => {
  it('parses PostgreSQL and the function body', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });

  it('limits repairs to unreviewed and uninvoiced parts in the current company', () => {
    expect(sql).toContain("array['superadmin','SAT','Gerencia']");
    expect(sql).toContain('assert_member_of_current_company(w.company_id)');
    expect(sql).toContain("w.economic_review_status = 'approved'");
    expect(sql).toContain("i.status <> 'cancelada'");
    expect(sql).toContain('order by id for update');
    expect(sql).toContain('from public,anon');
  });

  it('resolves the actual worker and historical date, keeping existing rate snapshots intact', () => {
    expect(sql).toContain('dmp_resolve_rate(catalog_id,e.profile_id,e.work_date)');
    expect(sql).toContain('duration_minutes > 0 and rate_version_id is null');
    expect(sql).toContain("coalesce(source,'manual') = 'manual'");
    expect(sql).toContain('coalesce(hourly_cost,0) = 0 and coalesce(hourly_price,0) = 0');
    expect(sql).toContain('coalesce(total_cost,0) = 0 and coalesce(total_price,0) = 0');
    expect(sql).toContain('lines is distinct from p_expected_lines');
    expect(sql).toContain('if blocked or jsonb_array_length(lines) = 0');
  });

  it('writes only on explicit apply, leaves technical quantities intact and audits the recovery', () => {
    const writes = sql.slice(sql.indexOf('if p_apply then'));
    expect(sql.slice(0,sql.indexOf('if p_apply then'))).not.toMatch(/\n\s*update public\./);
    expect(writes).not.toMatch(/set\s+(duration_minutes|profile_id|work_date)\s*=/);
    expect(writes).toContain('duration_minutes::numeric/60');
    expect(writes).toContain("'action','LEGACY_TIME_RATE_RECOVERY'");
    expect(writes).toContain('public.dmp_calculate_work_order_economics(w.id)');
  });
});
