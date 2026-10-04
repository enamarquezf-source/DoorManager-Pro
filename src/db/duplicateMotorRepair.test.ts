import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/repairs/correct_duplicate_motor_PAR_2026_000040.sql', import.meta.url), 'utf8');
describe('scoped duplicate motor repair', () => {
 it('parses the complete transaction and procedural block', async () => {
  const parser = await pgQuery();
  expect(parser.parse(sql).error).toBeNull();
  expect(parser.parsePlpgsql(sql).error).toBeNull();
 });
 it('retains movements and uses the canonical idempotent refund', () => {
  expect(sql).toContain('perform public.dmp_refund_work_order_material_stock');
  expect(sql).toContain('La duplicidad ya esta corregida');
  expect(sql).toContain("'work-order-material-return:' || duplicate_usage.id");
  expect(sql).not.toMatch(/delete from|disable trigger|grant|create or replace function/i);
  expect(sql).toContain('stock_after <> stock_before + 3');
 });
 it('preserves the linked usage, approved sale and invoice records', () => {
  expect(sql).toContain('d.work_order_material_id = valid_usage.id');
  expect(sql).toContain('where id = duplicate_usage.id and company_id = w.company_id and work_order_id = w.id');
  expect(sql).toContain('cost_after <> round(w.real_cost_amount - 630,2)');
  expect(sql).not.toMatch(/update public.(invoices|invoice_lines|quotes)/);
  expect(sql).not.toMatch(/set sale_amount|set status/);
  expect(sql).toContain("'SOFT_DELETE'");
 });
});
