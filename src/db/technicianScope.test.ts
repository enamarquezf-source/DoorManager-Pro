import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/015_technician_scope_search_alerts_schedule.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('technician scope migration', () => {
  it('replaces daily schedule with required fields and active assignment filtering', () => {
    expect(migration).toContain('create or replace view public.v_technician_daily_schedule');
    expect(migration).toContain('a.id as assignment_id');
    expect(migration).toContain('wo.description as work_order_description');
    expect(migration).toContain('s.address as site_address');
    expect(migration).toContain('wo.planned_material');
    expect(migration).toContain('where a.deleted_at is null');
    expect(migration).toContain('wo.deleted_at is null');
  });

  it('aggregates pending checks without multiplying journey rows', () => {
    expect(migration).toContain('left join lateral');
    expect(migration).toContain("count(*) filter (where ch.status <> 'Realizado')::integer as pending_checks_count");
    expect(app).toContain('pending_checks_count');
    expect(app).toContain('key={work.assignment_id');
  });

  it('removes direct technician alert creation while preserving backoffice roles', () => {
    expect(migration).toContain('drop policy if exists alerts_insert_authorized');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina'])");
    expect(migration).not.toContain("'Oficina','Tecnico'");
    expect(app).toContain("const canCreate = ['sat', 'gerencia', 'comercial'].includes(workspace)");
  });
});
