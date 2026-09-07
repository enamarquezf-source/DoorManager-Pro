import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/115_fix_work_order_creator_auto_assignment.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_fix_work_order_creator_auto_assignment_115.sql', import.meta.url), 'utf8');
const previous = readFileSync(new URL('../../supabase/migrations/111_ensure_work_order_equipment_checks.sql', import.meta.url), 'utf8');
const commercial = readFileSync(new URL('../../supabase/migrations/009_real_creation_codes_templates.sql', import.meta.url), 'utf8');

describe('fix creator auto-assignment in work order creation 115', () => {
  it('parses the isolated migration', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(migration).not.toMatch(/\b(create|alter|drop)\s+(table|column)\b/i);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+public\.work_order_assignments\b/i);
    expect(postflight).not.toMatch(/^\s*(insert|update|delete|alter|drop|create)\b/im);
  });

  it('leaves creator metadata intact and removes the responsible fallback', () => {
    expect(migration).toContain('create or replace function public.create_work_order_full(p_payload jsonb)');
    expect(migration).toContain('created_by, created_role, updated_by, current_responsible_id)');
    expect(migration).toContain('v_created_by, p_payload->>\'created_role\', v_created_by, v_technician_id) returning id into v_id;');
    expect(migration).not.toContain('coalesce(v_technician_id, v_created_by)');
    expect(migration).toContain('if v_technician_id is not null then perform public.assign_technician');
    expect(previous).toContain('coalesce(v_technician_id, v_created_by)) returning id into v_id;');
  });

  it('preserves the explicit commercial assignment flow', () => {
    expect(commercial).toContain('create or replace function public.assign_commercial_work_order(');
    expect(commercial).toContain('set current_responsible_id = p_commercial_id');
    expect(migration).not.toContain('assign_commercial_work_order');
  });
});
