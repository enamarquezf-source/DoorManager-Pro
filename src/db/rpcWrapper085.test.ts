import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/085_create_work_order_rpc_wrapper.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_rpc_wrapper_085.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_rpc_wrapper_085.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('RPC wrapper 085', () => {
  it('parses the wrapper and keeps verification read-only', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table)\b/i);
  });

  it('defines only a delegating uuid wrapper with authenticated execute', () => {
    expect(migration).toContain('create or replace function public.dmp_create_work_order_full(p_payload jsonb)');
    expect(migration).toContain('returns uuid');
    expect(migration).toContain('select public.create_work_order_full(p_payload);');
    expect(migration).toContain('grant execute on function public.dmp_create_work_order_full(jsonb) to authenticated;');
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toContain('insert into public.');
    expect(migration).not.toContain('create table');
  });

  it('calls the wrapper with the intact p_payload and mixed equipment selection', () => {
    expect(service).toContain("supabase.rpc('dmp_create_work_order_full', { p_payload: rpcPayload })");
    expect(service).not.toContain("supabase.rpc('create_work_order_full'");
    const equipment_selection = [{ existing_equipment_id: 'existing' }, { new: { equipment_type_id: 'type-a' } }, { new: { equipment_type_id: 'type-b' } }];
    const payload = { equipment_selection };
    expect(payload.equipment_selection).toEqual(equipment_selection);
    expect(payload.equipment_selection).toHaveLength(3);
  });
});
