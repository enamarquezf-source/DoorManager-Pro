import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/158_atomic_planned_material_consumption.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../supabase/verification/audit_duplicate_motor_PAR_2026_000040.sql', import.meta.url), 'utf8');
describe('atomic planned material confirmation', () => {
 it('parses SQL and PL/pgSQL before deployment', async () => {
  const parser = await pgQuery();
  expect(parser.parse(sql).error).toBeFalsy();
  expect(parser.parsePlpgsql(sql).error).toBeFalsy();
  expect(parser.parse(audit).error).toBeFalsy();
 });
 it('serializes before checking the existing quote-line usage', () => {
  expect(sql.indexOf('for update;')).toBeLessThan(sql.indexOf('join public.work_order_materials u'));
  expect(sql).toContain('d.quote_line_id = v_quote_line_id');
  expect(sql).toContain('and u.company_id = d.company_id and u.work_order_id = d.work_order_id');
  expect(sql).toContain('v_id := v_usage.id');
 });
 it('returns validated retries and rejects changed validated consumption', () => {
  expect(sql).toContain("v_usage.stock_validation_status = 'validated'");
  expect(sql).toContain('v_usage.used_quantity = v_quantity and v_usage.stock_warehouse_id is not distinct from v_warehouse_id');
  expect(sql).toContain('ya tiene un consumo validado');
 });
 it('records the quote decision in the same transaction without moving stock', () => {
  expect(sql).toContain('perform public.dmp_set_work_order_planned_material_decision');
  expect(sql).toContain('returning * into v_usage');
  expect(sql).toContain('select ql.* into v_quote_line');
  expect(sql).not.toContain('insert into public.stock_movements');
  expect(sql).not.toContain('update public.warehouse_stock');
 });
});
