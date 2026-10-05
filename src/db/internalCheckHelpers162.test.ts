import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/162_restrict_internal_check_helpers.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_162_internal_check_helpers.sql', import.meta.url), 'utf8');

describe('internal check helpers are not public RPCs', () => {
 it('has valid SQL and does not modify operational records', async () => {
  const parser = await pgQuery();
  expect(parser.parse(sql).error).toBeNull();
  expect(parser.parse(verification).error).toBeNull();
  expect(sql).not.toMatch(/^\s*(insert|update|delete)\b/im);
 });
 it('removes direct client execution while retaining the authorized wrapper', () => {
  expect(sql).toContain('dmp_ensure_work_order_equipment_check(uuid, uuid, uuid, uuid, text) from public, anon, authenticated');
  expect(sql).toContain('dmp_resolve_check_template(uuid, uuid) from public, anon, authenticated');
  const wrapper = readFileSync(new URL('../../supabase/migrations/112_ensure_preventive_work_order_equipment_checks.sql', import.meta.url), 'utf8');
  expect(wrapper).toContain('generate_pending_installation_check');
  expect(wrapper).toContain('security definer set search_path = public');
  expect(wrapper).toContain('perform public.assert_member_of_current_company');
  const services = readdirSync(new URL('../services/', import.meta.url)).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).map(n => readFileSync(new URL('../services/' + n, import.meta.url), 'utf8')).join('\n');
  expect(services).not.toMatch(/\.rpc\(['"]dmp_(ensure_work_order_equipment_check|resolve_check_template)['"]/);
 });
});
