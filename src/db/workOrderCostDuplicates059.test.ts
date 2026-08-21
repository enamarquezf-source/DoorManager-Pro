import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/059_prevent_duplicate_work_order_costs.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const previous027 = readFileSync(new URL('../../supabase/migrations/027_work_order_cost_entries.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const previous047 = readFileSync(new URL('../../supabase/migrations/047_work_order_planned_quote_lines.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const query = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');

const backfill = migration.slice(migration.indexOf('update public.work_order_cost_entries\nset source'), migration.indexOf('create or replace function public.dmp_set_work_order_quote_line_decision'));
const upsertRpc = migration.slice(migration.indexOf('create or replace function public.dmp_upsert_work_order_cost_entry'), migration.indexOf('revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from public;'));
const decisionRpc = migration.slice(migration.indexOf('create or replace function public.dmp_set_work_order_quote_line_decision'), migration.indexOf('revoke all on function public.dmp_set_work_order_quote_line_decision(jsonb) from public;'));

describe('059 prevent duplicate work order costs', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('adds explicit source/origin with check and NO unique(work_order_id, cost_type)', () => {
    expect(migration).toContain("add column if not exists source text not null default 'manual'");
    expect(migration).toContain("check (source in ('quote','manual','additional'))");
    expect(migration).not.toMatch(/create unique index[^;]*work_order_id[^;]*cost_type/);
    expect(migration).not.toContain('unique (work_order_id, cost_type)');
    expect(migration).not.toContain('create unique index');
  });

  it('backfills structural origin without touching imports (no economic backfill)', () => {
    expect(backfill).toContain("when quote_line_id is not null then 'quote' else 'manual'");
    expect(backfill).toContain("quote_line_id is not null and source is distinct from 'quote'");
    expect(backfill).not.toContain('unit_cost');
    expect(backfill).not.toContain('unit_price');
    expect(backfill).not.toContain('total_cost');
    expect(backfill).not.toContain('total_price');
    expect(backfill).not.toContain('real_cost_amount');
  });

  it('does not alter any economic import across the whole migration', () => {
    expect(migration).not.toContain('set unit_cost');
    expect(migration).not.toContain('set unit_price');
    expect(migration).not.toContain('set total_cost');
    expect(migration).not.toContain('set total_price');
    expect(migration).not.toContain('real_cost_amount');
    expect(migration).not.toContain('estimated_margin_amount');
  });

  it('persists origin quote when a planned concept is confirmed (insert, conflict update and re-confirm)', () => {
    expect(decisionRpc).toContain("'quote-line:' || v_line.id::text, 'quote')");
    expect(decisionRpc).toContain('source = excluded.source');
    expect(decisionRpc).toContain("source = 'quote',");
    expect(decisionRpc).toContain('on conflict (company_id, work_order_id, quote_line_id)');
    expect(decisionRpc).toContain('select id into v_cost_entry_id');
    expect(decisionRpc).toContain('for update');
  });

  it('protects manual INSERT when a quote concept of the same type is already accounted', () => {
    expect(upsertRpc).toContain("v_additional boolean := coalesce((p_payload->>'additional_to_planned')::boolean, false);");
    expect(upsertRpc).toContain('and cost_type = v_cost_type');
    expect(upsertRpc).toContain('and quote_line_id is not null');
    expect(upsertRpc).toContain('and deleted_at is null');
    expect(upsertRpc).toContain("raise exception 'adicional:");
  });

  it('allows manual insert without planned concept (source manual) and declared additional (source additional)', () => {
    expect(upsertRpc).toContain("case when v_additional then 'additional' else 'manual' end");
    expect(upsertRpc).not.toContain("quote_line_id = p_payload->>'quote_line_id'");
  });

  it('does NOT apply the guard on UPDATE and preserves existing source', () => {
    const updateBody = upsertRpc.slice(upsertRpc.indexOf('if v_id is not null then'), upsertRpc.indexOf('if not v_additional and exists'));
    expect(updateBody).not.toContain('adicional');
    expect(updateBody).not.toContain('additional_to_planned');
    expect(updateBody).not.toContain('quote_line_id is not null');
    expect(updateBody).toContain('update public.work_order_cost_entries set cost_type');
  });

  it('keeps soft delete behavior for no_realizado and re-confirm without economic duplication', () => {
    expect(decisionRpc).toContain('deleted_at = now()');
    expect(decisionRpc).toContain("delete_reason = coalesce(v_notes, 'Concepto previsto marcado como no realizado')");
    expect(decisionRpc).toContain('where quote_line_id is not null and deleted_at is null do update');
  });

  it('does not touch economic views, materials 058, stock, hour rates, RLS or service_role', () => {
    expect(migration).not.toContain('create or replace view public.v_work_order_economic_summary');
    expect(migration).not.toContain('work_order_materials');
    expect(migration).not.toContain('technician_hour_rates');
    expect(migration).not.toMatch(/public\.material_stock_movements/);
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('to service_role');
    expect(migration).not.toContain('delete from public.work_order_cost_entries');
  });

  it('keeps the existing permission model for economic amounts', () => {
    expect(upsertRpc).toContain('No tienes permisos para registrar importes economicos');
    expect(upsertRpc).toContain('case when public.has_any_role(array[\'superadmin\',\'SAT\',\'Gerencia\',\'Oficina\'])');
  });

  it('frontend warns about the planned concept and offers additional confirmation without text requirements', () => {
    expect(app).toContain('Coste adicional al presupuestado');
    expect(app).toContain('concepto procedente del presupuesto ya esta contabilizado');
    expect(app).toContain('Añadir como coste adicional');
    expect(app).toContain('additional_to_planned = true');
    expect(app).toContain('pendingAdditional');
    expect(app).not.toContain('Escribe ELIMINAR');
  });

  it('frontend respects cost visibility permissions', () => {
    expect(app).toContain('Tarifa: {selected.name}');
  });

  it('service forwards the upsert through the RPC', () => {
    expect(service).toContain("supabase.rpc('dmp_upsert_work_order_cost_entry'");
  });

  it('keeps the contract ready for future configurable rates without implementing them', () => {
    expect(migration).not.toContain('rate_id');
    expect(migration).not.toContain('technician_hour_rates');
  });

  it('does not modify migrations 001-058', () => {
    expect(migration).not.toContain('create table');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('drop column');
  });

  it('backend adicional signal passes through error normalization (not generic)', () => {
    expect(query).toContain('|adicional):/i.test(message)');
    expect(query).toContain("return message;");
    expect(query).not.toMatch(/adicional[^)]*\n\s*return 'No se ha podido completar/);
  });

  it('frontend detects a quote concept of the same type BEFORE saving (opens modal)', () => {
    expect(app).toContain('(row.concept_id === values.concept_id || row.rate_id === values.rate_id) && row.quote_line_id && !row.deleted_at');
    expect(app).toContain('if (planned && !asAdditional) { setPendingAdditional(true); return; }');
  });

  it('frontend opens the additional modal when backend returns the adicional signal', () => {
    expect(app).toContain("message.includes('adicional:')");
    expect(app).toContain('setPendingAdditional(true)');
  });

  it('distinguishes adicional from real backend errors', () => {
    expect(app).toContain("if (!asAdditional && message.includes('adicional:'))");
    expect(app).toContain("else setError(message || 'No se ha podido registrar el recurso o coste.');");
  });

  it('guards against double submit during saving', () => {
    expect(app).toContain('const saveCost = async (asAdditional = false) => { if (saving) return;');
    expect(app).toContain('const submit = (event: FormEvent) => { event.preventDefault(); saveCost(false); };');
  });

  it('reuses an explicit saveCost function instead of artificial submit events', () => {
    expect(app).toContain('saveCost(true);');
    expect(app).not.toContain("submit(new Event('submit')");
  });

  it('editing an existing entry does not trigger the additional guard', () => {
    expect(app).toContain('const planned = !values.id &&');
  });

  it('manual or additional source of the same type without quote_line_id does not warn', () => {
    expect(app).toContain('(row.concept_id === values.concept_id || row.rate_id === values.rate_id) && row.quote_line_id && !row.deleted_at');
  });

  it('soft-deleted quote concepts do not warn', () => {
    expect(app).toContain('!row.deleted_at');
  });

  it('keeps the backend guard and source values untouched', () => {
    expect(migration).toContain("raise exception 'adicional:");
    expect(migration).toContain("check (source in ('quote','manual','additional'))");
  });

  it('detail loading includes quote_line_id, source and deleted_at columns for cost entries', () => {
    expect(service).toContain("supabase.from('work_order_cost_entries').select('*, profiles!work_order_cost_entries_registered_by_fkey(first_name,last_name,primary_area)')");
    expect(service).toContain("is('deleted_at', null)");
    expect(service).toContain('cost_entries: costEntries');
    expect(service).toContain('work_order_cost_entries: costEntries');
  });
});
