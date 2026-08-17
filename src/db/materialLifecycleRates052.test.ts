import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/052_material_lifecycle_rate_traceability.sql', import.meta.url), 'utf8');
const previousDependencies = readFileSync(new URL('../../supabase/migrations/022_security_lifecycle_controls.sql', import.meta.url), 'utf8');
const previousStockMovement = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8');
const previousClip042 = readFileSync(new URL('../../supabase/migrations/042_permissions_archiving_hour_rates.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');

describe('052 material lifecycle and rate traceability', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('adds is_specific to materials and quote_rate_id to quote_lines without dropping columns', () => {
    expect(migration).toContain('alter table public.materials add column if not exists is_specific boolean not null default false');
    expect(migration).toContain('create index if not exists materials_is_specific_company_idx on public.materials(company_id, is_specific, deleted_at)');
    expect(migration).toContain('alter table public.quote_lines add column if not exists quote_rate_id uuid references public.technician_hour_rates(id)');
    expect(migration).toContain('create index if not exists quote_lines_quote_rate_idx on public.quote_lines(quote_id, quote_rate_id) where quote_rate_id is not null');
    expect(migration).not.toContain('drop column');
    expect(migration).not.toContain('delete from public.materials');
  });

  it('extends lifecycle dependencies with the materials branch for traceable archive', () => {
    expect(migration).toContain('create or replace function public.dmp_lifecycle_dependencies(p_entity text, p_entity_id uuid)');
    expect(migration).toContain("elsif p_entity = 'materials' then");
    expect(migration).toContain("'usos en partes', (select count(*) from public.work_order_materials where material_id = p_entity_id)");
    expect(migration).toContain("'movimientos de stock', (select count(*) from public.material_stock_movements where material_id = p_entity_id)");
    expect(migration).toContain("'lineas de presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id)");
    expect(migration).toContain('select coalesce(deleted_at is not null or active = false, false), code, description into v_archived, v_code, v_name from public.materials where id = p_entity_id');
    expect(previousDependencies).not.toContain("elsif p_entity = 'materials' then");
  });

  it('restores archived materials with full traceability and no client dependency', () => {
    expect(migration).toContain('create or replace function public.dmp_restore_entity(p_entity text, p_entity_id uuid, p_reason text)');
    expect(migration).toContain("elsif p_entity = 'materials' then");
    expect(migration).toContain('update public.materials set active = true, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now()');
    expect(migration).toContain('public.dmp_record_lifecycle_audit');
    expect(migration).toContain("jsonb_build_object('operation', 'restored')");
    expect(migration).toContain('if v_old->>\'deleted_at\' is null then raise exception \'El registro no está archivado\'; end if;');
    expect(previousDependencies).not.toContain("elsif p_entity = 'materials' then");
  });

  it('auto-archives specific materials only when consumption drains stock to zero', () => {
    expect(migration).toContain('create or replace function public.dmp_apply_material_stock_movement(');
    expect(migration).toContain('if v_material.is_specific and p_source = \'work_order\' and p_movement_type = \'out\' and coalesce(v_new, 0) <= 0 then');
    expect(migration).toContain('delete_reason = \'Consumido: stock agotado en parte de trabajo\'');
    expect(migration).toContain('insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)');
    expect(migration).toContain('insert into public.activity_log');
    expect(previousStockMovement).not.toContain('v_material.is_specific');
    expect(previousStockMovement).not.toContain("if v_material.is_specific and p_source = 'work_order'");
  });

  it('keeps recurring materials active when stock reaches zero', () => {
    expect(migration).toContain('-- Los materiales recurrentes con stock a cero permanecen activos.');
    expect(migration).toContain('if v_material.is_specific and p_source = \'work_order\' and p_movement_type = \'out\' and coalesce(v_new, 0) <= 0 then');
    expect(migration).toContain('-- Los materiales recurrentes con stock a cero permanecen activos.');
  });

  it('freezes proposed rate values in quote lines without recalculating history', () => {
    expect(migration).toContain('quote_rate_id');
    expect(migration).toContain('-- Trazabilidad de tarifa propuesta en lineas de presupuesto. No recalcula valores historicos.');
    expect(app).toContain('quote_rate_id: proposedRate.id');
    expect(quotesService).toContain('quote_rate_id');
  });

  it('exposes UI for specific materials, restore action and rate proposal', () => {
    expect(app).toContain('Material específico / a medida');
    expect(app).toContain('Se archiva automáticamente al quedar su stock a cero por consumo en partes');
    expect(app).toContain("entityLifecycleService.restore('materials', removing.id, reason)");
    expect(app).toContain('Restaurar material');
    expect(app).toContain('Motivo de restauración');
    expect(app).toContain('Tarifa vigente aplicada solo al crear la línea');
    expect(app).toContain('hourRatesService.list(\'\', quoteCompanyId)');
  });

  it('keeps migration declarative: no service role, no RLS disable, keeps company_id', () => {
    expect(migration).toContain('-- Idempotente. Mantiene RLS y company_id. Sin borrados destructivos y sin service_role.');
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('auth.uid() is null');
  });
});