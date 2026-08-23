import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/065_fix_time_entry_canonical_rate_resolution.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const timeForm = app.slice(app.indexOf('function WorkOrderTimeForm'), app.indexOf('function WorkOrderMaterialForm'));

describe('065 canonical time-entry rates', () => {
  it('replaces the archived legacy-hour lookup with the canonical labor concept', () => {
    const functionBody = migration.slice(migration.indexOf('as $$'), migration.indexOf('revoke all on function'));
    expect(migration).toContain("c.code = 'tecnico'");
    expect(functionBody).toContain('public.dmp_resolve_rate(v_canonical_rate_id, v_profile, v_date)');
    expect(functionBody).not.toContain('dmp_current_hour_rate');
    expect(functionBody).not.toContain('technician_hour_rates');
    expect(functionBody).not.toContain('legacy-hour-');
  });

  it('keeps the economic snapshot and server-side duration calculation', () => {
    for (const field of ['hourly_cost', 'hourly_price', 'total_cost', 'total_price', 'rate_id', 'rate_version_id']) expect(migration).toContain(field);
    expect(migration).toContain('public.dmp024_work_minutes');
    expect(migration).toContain("coalesce(nullif(p_payload->>'hour_type', ''), 'normal')");
  });

  it('sends the expected worker, date, range, pause and hour type fields from the form', () => {
    for (const field of ['work_order_id', 'profile_id', 'work_date', 'started_at', 'ended_at', 'break_minutes', 'duration_minutes', 'hour_type', 'description']) expect(timeForm).toContain(field);
    expect(timeForm).toContain('workOrdersService.upsertTimeEntry');
  });

  it('keeps client-provided economic values out of the RPC payload', () => {
    expect(timeForm).not.toContain('hourly_cost');
    expect(timeForm).not.toContain('hourly_price');
  });
});
