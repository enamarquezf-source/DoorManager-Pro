import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasUsableRateVersion } from '../services/hourRatesService';
import { serverResolvedEconomicPayload } from '../services/workOrdersService';

const migration = readFileSync(new URL('../../supabase/migrations/060_generic_rates_and_economic_integrity.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration059 = readFileSync(new URL('../../supabase/migrations/059_prevent_duplicate_work_order_costs.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const ratesService = readFileSync(new URL('../services/hourRatesService.ts', import.meta.url), 'utf8');
const economicService = readFileSync(new URL('../services/economicService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const costForm = app.slice(app.indexOf('function WorkOrderCostForm'), app.indexOf('function WorkProgress'));

describe('060 generic rate architecture', () => {
  it('parses as PostgreSQL and does not alter prior migrations', async () => {
    expect(migration).toContain('begin;');
    expect(migration).toContain('commit;');
    expect(migration).not.toContain('058_');
    expect(migration).not.toContain('059_');
  });

  it('models stable concepts, versioned units and billing modes', () => {
    expect(migration).toContain('create table if not exists public.rate_catalog');
    expect(migration).toContain('create table if not exists public.rate_versions');
    for (const value of ["'unit'", "'hour'", "'day'", "'period'"]) expect(migration).toContain(value);
    expect(migration).toContain('period_days integer');
    expect(migration).toContain('rate_version_id uuid references public.rate_versions(id)');
    expect(migration).toContain('rate_versions_no_overlap');
    expect(migration).toContain('exclude using gist');
    expect(migration).toContain("classification text not null default 'cost'");
    expect(migration).toContain("classification='labor'");
    expect(migration).toContain('rate_versions_catalog_company_fk');
    expect(migration).toContain('dmp_rate_version_update_guard');
    for (const constraint of ['work_order_time_entries_company_rate_fk', 'work_order_cost_entries_company_concept_fk', 'quote_lines_company_rate_version_fk']) expect(migration).toContain(constraint);
    expect(migration).toContain('060 preflight: work_order_cost_entries contiene rate_id de otra empresa');
  });

  it('keeps 059 source semantics and makes concepts dynamic without losing legacy codes', () => {
    expect(migration059).toContain("check (source in ('quote','manual','additional'))");
    expect(migration).toContain("('desplazamiento','Desplazamiento')");
    expect(migration).toContain('drop constraint if exists work_order_cost_entries_cost_type_check');
    expect(migration).toContain('concept_id uuid references public.rate_catalog(id)');
    expect(migration).toContain("case when v_additional then 'additional' else 'manual' end");
    expect(migration).toContain("(e.source='quote') and (e.concept_id=v_concept or e.rate_id=v_concept or e.cost_type=v_type)");
    expect(migration).toContain('source is null and e.quote_line_id is not null');
  });

  it('resolves rates on the server and never accepts economic overrides from the client service', () => {
    expect(migration).toContain('public.dmp_resolve_rate');
    expect(migration).toContain("p_payload->>'rate_id'");
    expect(migration).toContain('coalesce(v_rate.cost_amount,0)');
    expect(service).toContain('delete next.hourly_cost');
    expect(service).toContain('delete next.hourly_price');
    expect(service).toContain('delete next.unit_cost');
    expect(service).toContain('delete next.unit_price');
    expect(migration).toContain("code='legacy-hour-' || v_legacy.rate_id::text");
    expect(migration).toContain('v.id as rate_version_id');
    expect(serverResolvedEconomicPayload({ rate_id: 'r', quantity: 2, hourly_cost: 99, hourly_price: 100, unit_cost: 88, unit_price: 89 })).toEqual({ rate_id: 'r', quantity: 2 });
  });

  it('separates quoted and additional sale while preserving quote snapshots', () => {
    for (const column of ['quoted_sale_amount', 'additional_sale_amount', 'sale_amount']) expect(migration).toContain(column);
    expect(migration).toContain("source='additional' and contributes_to_sale");
    expect(migration).toContain('q.taxable_base,q.subtotal_sale,q.subtotal');
    expect(migration).toContain('create or replace view public.v_work_order_economic_summary');
    expect(migration).toContain("source='additional' and contributes_to_sale");
    expect(migration).toContain('(q.id = wo.quote_id or q.work_order_id = wo.id)');
    expect(migration).toContain('case when q.id = wo.quote_id then 0 else 1 end');
    expect(migration).toContain("source='additional' and contributes_to_sale");
    expect(migration).not.toContain("source in ('manual','additional')");
  });

  it('filters normal catalog results by a currently usable active version', () => {
    const today = '2026-08-20';
    expect(hasUsableRateVersion({ rate_versions: [{ active: true, deleted_at: null, valid_from: '2026-01-01', valid_to: null }] }, today)).toBe(true);
    expect(hasUsableRateVersion({ rate_versions: [{ active: false, deleted_at: null, valid_from: '2026-01-01', valid_to: null }] }, today)).toBe(false);
    expect(hasUsableRateVersion({ rate_versions: [{ active: true, deleted_at: null, valid_from: '2026-09-01', valid_to: null }] }, today)).toBe(false);
    expect(hasUsableRateVersion({ rate_versions: [{ active: true, deleted_at: null, valid_from: '2026-01-01', valid_to: '2026-08-19' }] }, today)).toBe(false);
    expect(ratesService).toContain('return rows.filter((row) => hasUsableRateVersion(row) || row.id === includeId)');
    expect(ratesService).toContain('if (includeArchived) return rows');
  });

  it('uses catalog concepts in the normal cost form with optional observations only', () => {
    expect(costForm).toContain("hourRatesService.catalog('', undefined, 'cost', false, selectedId)");
    expect(costForm).toContain('concept_id: values.concept_id');
    expect(costForm).toContain('rate_id: values.rate_id');
    expect(costForm).toContain('Observaciones opcionales');
    expect(costForm).not.toContain('values.cost_type');
    expect(costForm).not.toContain('values.unit');
    expect(costForm).not.toContain('values.unit_cost');
  });

  it('does not silently price unconfigured legacy cost concepts', () => {
    expect(migration).toContain('el concepto no tiene una version vigente configurada por Gerencia');
    expect(migration).toContain('where h.deleted_at is null');
    expect(migration).toContain('Snapshot legacy de technician_hour_rates');
    expect(migration).toContain('Placeholder 060: unidad/categoria legacy ambigua');
    expect(migration).toContain("'labor', 'h', 'hour'");
    expect(migration).toContain("code='legacy-hour-' || v_legacy.rate_id::text");
    expect(migration).toContain("c.classification='labor'");
  });

  it('protects catalog tables with RLS, soft-delete policy and scoped grants', () => {
    expect(migration).toContain('alter table public.rate_catalog enable row level security');
    expect(migration).toContain('alter table public.rate_versions enable row level security');
    expect(migration).toContain('rate_catalog_no_delete');
    expect(migration).toContain('rate_versions_no_delete');
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']");
    expect(migration).toContain('dmp_rate_catalog_for_selection');
    expect(migration).toContain("revoke all on function public.dmp_resolve_rate(uuid,uuid,date) from authenticated");
    expect(migration).toContain('grant execute on function public.dmp_upsert_work_order_cost_entry(jsonb) to authenticated');
  });

  it('exposes catalog and version operations for the management UI', () => {
    expect(ratesService).toContain("supabase.from('rate_catalog')");
    expect(ratesService).toContain("supabase.from('rate_versions')");
    expect(ratesService).toContain('billing_mode');
    expect(ratesService).toContain('async updateCatalog');
    expect(app).toContain('Facturable como venta adicional');
    expect(app).toContain('contributes_to_sale');
  });

  it('separates origin from explicit additional-sale eligibility', () => {
    expect(migration).toContain('contributes_to_sale boolean not null default false');
    expect(migration).toContain("source='additional' and contributes_to_sale");
    expect(migration).toContain("case when v_additional then 'additional' else 'manual' end");
    expect(migration).not.toContain("source in ('manual','additional')");
  });

  it('freezes quote, additional, cost and margin snapshots at technical close', () => {
    expect(migration).toContain('quoted_sale_amount=v_quote');
    expect(migration).toContain('additional_sale_amount=v_additional');
    expect(migration).toContain('sale_amount=v_sale');
    expect(migration).toContain('real_cost_amount=v_real_cost');
    expect(migration).toContain('margin_amount=v_margin');
    expect(migration).toContain("status in ('Finalizado tecnicamente','Enviado','Cerrado')");
  });

  it('rejects missing hourly versions and preserves valid zero-price versions', () => {
    expect(migration).toContain('no existe una tarifa horaria vigente aplicable al tecnico');
    expect(migration).toContain('if v_rate.rate_version_id is null then raise exception');
    expect(migration).not.toContain("v_rate.cost_amount := 0; v_rate.sale_amount := 0");
  });

  it('preserves cost concepts on edits and resolves only explicit changes', () => {
    expect(migration).toContain('v_concept := coalesce(v_old.concept_id,v_old.rate_id)');
    expect(migration).toContain('cost_type=case when v_changed then v_type else v_old.cost_type end');
    expect(migration).toContain('v_changed := v_id is null or v_requested is not null');
  });

  it('does not assign future rate versions to historical quote lines', () => {
    expect(migration).toContain('v.valid_from <= coalesce(q.issue_date, current_date)');
    expect(migration).toContain('v.valid_to is null or v.valid_to >= coalesce(q.issue_date, current_date)');
    expect(migration).toContain("if v_count <> 1 then raise exception 'tarifa: linea historica sin una unica version vigente; no se inventa relacion'");
  });

  it('keeps rate economics private while exposing selector metadata', () => {
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']" );
    expect(migration).toContain('dmp_rate_catalog_for_selection');
    expect(migration).toContain('never economic amounts');
    expect(ratesService).toContain("supabase.rpc('dmp_rate_catalog_for_selection'");
  });

  it('uses one canonical view and documents explicit period quantities', () => {
    expect(migration).not.toContain('v_work_order_economic_summary_060');
    expect(migration).toContain('create or replace view public.v_work_order_economic_summary');
    expect(app).toContain('la cantidad es el numero explicito de dias o periodos');
    expect(app).toContain('Venta adicional');
  });

  it('qualifies quote columns in joined economic aggregates', () => {
    const clientViewStart = migration.indexOf('create or replace view public.v_client_economic_summary');
    const managementViewStart = migration.indexOf('create or replace view public.v_management_metrics');
    const clientView = migration.slice(clientViewStart, managementViewStart);
    const managementView = migration.slice(managementViewStart, migration.indexOf('revoke all on function public.dmp_resolve_rate'));
    expect(clientView).toContain("count(*) filter (where q.status='Aceptado')");
    expect(clientView).toContain("count(*) filter (where q.status='Ejecutado en cliente')");
    expect(clientView).toContain('q.total_amount,q.total');
    expect(clientView).toContain('q.tax_amount');
    expect(clientView).not.toMatch(/filter\s*\(where\s+status\s*=/i);
    expect(managementView).not.toMatch(/filter\s*\(where\s+status\s*=/i);
  });

  it('keeps audit fields and protects used versions from destructive edits', () => {
    expect(migration).toContain('created_by uuid references public.profiles(id)');
    expect(migration).toContain('updated_by uuid references public.profiles(id)');
    expect(migration).toContain('no se puede modificar una version ya utilizada');
  });

  it('keeps PEMP as a configurable period concept without inventing history', () => {
    expect(migration).toContain("where code='pemp' and classification='cost'");
    expect(migration).toContain("set unit='period', billing_mode='period'");
    expect(migration).toContain('period_days');
    expect(migration).not.toContain('ceil(');
    expect(migration).not.toContain("code='pemp' and classification='labor'");
    expect(app).toContain('period_days: values.period_days');
  });

  it('does not duplicate 060 historical note markers on rerun', () => {
    expect(migration).toContain("position('Archivada por clasificacion 060' in coalesce(v.notes,'')) = 0");
    expect(migration).toContain("position('Placeholder corregido por clasificacion 060' in coalesce(c.notes,'')) = 0");
  });

  it('uses the SQL economic source semantics for client summaries', () => {
    expect(economicService).toContain("from('v_client_economic_summary')");
    expect(economicService).toContain("from('v_management_metrics')");
    expect(economicService).not.toContain('function clientEconomicSummary');
    expect(economicService).not.toContain('function workOrderEconomicSummary');
  });

  it('rejects ambiguous candidates without silently limiting a scope', () => {
    const resolver = migration.slice(migration.indexOf('create or replace function public.dmp_resolve_rate'), migration.indexOf('create or replace function public.dmp_rate_version_update_guard'));
    expect(resolver).toContain('v_specific_count');
    expect(resolver).toContain('v_generic_count');
    expect(resolver).toContain('if v_specific_count > 1 then');
    expect(resolver).toContain('if v_generic_count > 1 then');
    expect(resolver).toContain('Gerencia debe corregir la configuracion tarifaria');
    expect(resolver).not.toContain('limit 1');
    expect(resolver).toContain('v_specific_count = 1 and v.technician_profile_id = p_profile_id');
    expect(resolver).toContain('v_generic_count = 1 and v.technician_profile_id is null');
  });

  it('keeps the concurrent overlap lock scoped by company, concept and profile', () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(concat_ws(':', new.company_id::text, new.rate_id::text, new.scope_profile_id::text), 0))");
  });

  it('preflights existing rate_versions before adding the company catalog FK', () => {
    const preflightStart = migration.indexOf('select count(*) into v_invalid_count');
    const fkIndex = migration.indexOf('rate_versions_catalog_company_fk');
    const preflight = migration.slice(preflightStart, fkIndex);
    expect(preflightStart).toBeGreaterThan(-1);
    expect(preflightStart).toBeLessThan(fkIndex);
    expect(preflight).toContain('left join public.rate_catalog c on c.id = v.rate_id');
    expect(preflight).toContain('v.company_id is distinct from c.company_id');
    expect(preflight).toContain('c.id is null');
    expect(preflight).toContain('060 preflight: existen rate_versions con catalogo inexistente');
    expect(preflight).not.toMatch(/\b(update|delete)\b/i);
  });

  it('creates or validates scope_profile_id conservatively from PostgreSQL catalogs', () => {
    const start = migration.indexOf("where attrelid = 'public.rate_versions'::regclass");
    const end = migration.indexOf("alter table public.rate_catalog add column if not exists classification");
    const guard = migration.slice(start, end);
    expect(guard).toContain('pg_attribute');
    expect(guard).toContain('pg_attrdef');
    expect(guard).toContain('format_type(a.atttypid, a.atttypmod)');
    expect(guard).toContain('pg_get_expr(d.adbin, d.adrelid)');
    expect(guard).toContain('a.attgenerated');
    expect(guard).toContain("v_generated <> 's'");
    expect(guard).toContain("v_type <> 'uuid'");
    expect(guard).toContain('v_not_null');
    expect(guard).toContain('v_expected_expression');
    expect(guard).toContain('rate_versions.scope_profile_id tiene una definicion incompatible');
    expect(guard).toContain('add column scope_profile_id uuid generated always as');
    expect(guard).not.toMatch(/drop\s+column/i);
    expect(guard).not.toMatch(/\b(update|delete)\b/i);
  });

  it('preserves idempotence and the existing resolver/lock contracts', () => {
    expect(migration).toContain('if not exists (\n    select 1 from pg_attribute');
    expect(migration).toContain('if not exists (select 1 from pg_constraint');
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended');
    const resolver = migration.slice(migration.indexOf('create or replace function public.dmp_resolve_rate'), migration.indexOf('create or replace function public.dmp_rate_version_update_guard'));
    expect(resolver).not.toContain('limit 1');
  });
});
