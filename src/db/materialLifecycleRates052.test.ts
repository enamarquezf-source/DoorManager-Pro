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
    expect(migration).toContain('select coalesce(deleted_at is not null, false), code, description into v_archived, v_code, v_name from public.materials where id = p_entity_id');
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

  it('marks a specific material as consumed (active=false) without deleting it when stock drains to zero', () => {
    expect(migration).toContain('create or replace function public.dmp_apply_material_stock_movement(');
    expect(migration).toContain('if v_material.is_specific and p_source = \'work_order\' and p_movement_type = \'out\' and coalesce(v_new, 0) <= 0 then');
    expect(migration).toContain("set active = false, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now()");
    expect(migration).toContain("'Material específico consumido: stock agotado en parte de trabajo'");
    expect(migration).toContain("jsonb_build_object('status', 'consumed', 'is_specific', true, 'stock_quantity', v_new)");
    expect(migration).toContain("jsonb_build_object('status', 'consumed', 'operation', 'UPDATE')");
    expect(migration).toContain('insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)');
    expect(migration).toContain('insert into public.activity_log');
    expect(migration).not.toContain("deleted_at = coalesce(deleted_at, now())");
    expect(previousStockMovement).not.toContain('v_material.is_specific');
    expect(previousStockMovement).not.toContain("if v_material.is_specific and p_source = 'work_order'");
  });

  it('does NOT log consumption as SOFT_DELETE/eliminacion logica: it uses UPDATE/modificacion', () => {
    expect(migration).not.toContain("'materials', v_material.id, 'SOFT_DELETE'");
    expect(migration).not.toContain("'eliminacion logica', 'materials', v_material.id");
    expect(migration).not.toContain("delete_reason = 'Consumido: stock agotado en parte de trabajo'");
    expect(migration).not.toContain('jsonb_build_object(\'reason\', \'Consumido: stock agotado en parte de trabajo\', \'operation\', \'SOFT_DELETE\')');
    expect(migration).toContain("'materials', v_material.id, 'UPDATE', p_created_by, to_jsonb(v_material)");
    expect(migration).toContain("'modificacion', 'materials', v_material.id");
  });

  it('keeps recurring materials active when stock reaches zero', () => {
    expect(migration).toContain('-- Los materiales recurrentes con stock a cero permanecen activos.');
    expect(migration).toContain('if v_material.is_specific and p_source = \'work_order\' and p_movement_type = \'out\' and coalesce(v_new, 0) <= 0 then');
    expect(migration).toContain('-- Los materiales recurrentes con stock a cero permanecen activos.');
  });

  it('auto-reactivates a consumed specific material when stock becomes available again', () => {
    expect(migration).toContain('elsif v_material.is_specific and not v_material.active and v_material.deleted_at is null and');
    expect(migration).toContain('p_movement_type in (\'in\',\'return\',\'correction\',\'adjustment\') and coalesce(v_new, 0) > 0 then');
    expect(migration).toContain('set active = true, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now()');
    expect(migration).toContain("'Material específico reactivado al recuperar stock'");
    expect(migration).toContain("jsonb_build_object('reason', 'Material específico reactivado al recuperar stock', 'is_specific', true, 'stock_quantity', v_new)");
  });

  it('lets returns and corrections move stock on consumed materials because deleted_at stays null', () => {
    expect(migration).toContain('select * into v_material from public.materials where id = p_material_id and deleted_at is null for update');
    expect(migration).toContain("p_movement_type in ('in','initial','return')");
    expect(migration).toContain("p_source = 'work_order' and p_movement_type = 'out'");
    expect(migration).toContain('update public.materials set stock_quantity = v_new, last_stock_movement_at = now()');
    expect(migration).toContain("values (v_material.company_id, v_material.id, p_work_order_id, p_work_order_material_id, p_quote_id, p_movement_type, p_quantity, v_previous, v_new, p_unit_cost, nullif(p_reason, ''), p_source, p_created_by)");
  });

  it('clears deleted_at/deleted_by/delete_reason on auto-reactivation of consumed specific materials', () => {
    expect(migration).toContain('set active = true, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now()');
  });

  it('distinguishes consumido from archivado: consumed keeps deleted_at null and is NOT reported as archived', () => {
    const archivedLine = migration.split('\n').find((line: string) => /coalesce\(deleted_at is not null, false\), code, description into v_archived/.test(line));
    expect(archivedLine).toBeDefined();
    expect(archivedLine).not.toMatch(/or active = false/);
    expect(migration).toContain('if v_old->>\'deleted_at\' is null then raise exception \'El registro no está archivado\'; end if;');
    expect(migration).toContain('update public.materials set active = true, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now() where id = p_entity_id returning to_jsonb(materials.*) into v_new;');
  });

  it('exposes four distinct UI states: Activo, Sin stock, Consumido and Archivado', () => {
    expect(app).toContain("function materialStockStatus(material: any) { if (Number(material.stock_quantity ?? 0) <= 0) return 'Sin stock'; if (Number(material.minimum_stock ?? 0) > 0 && Number(material.stock_quantity ?? 0) <= Number(material.minimum_stock ?? 0)) return 'Bajo stock'; return 'Activo'; }");
    expect(app).toContain("function materialDisplayStatus(material: any) { if (material.deleted_at) return 'Archivado'; if (material.active === false) return material.is_specific === true ? 'Consumido' : 'Inactivo'; return materialStockStatus(material); }");
    expect(app).not.toMatch(/materialDisplayStatus\([^)]*\)\s*\{\s*if \(material\.active === false\) return 'Inactivo'/);
    expect(app).toContain("'Archivado'");
    expect(app).toContain("'Consumido'");
  });

  it('freezes proposed rate values in quote lines without recalculating history', () => {
    expect(migration).toContain('quote_rate_id');
    expect(migration).toContain('-- Trazabilidad de tarifa propuesta en lineas de presupuesto. No recalcula valores historicos.');
    expect(quotesService).toContain('quote_rate_id');
  });

  it('exposes a single quote_rate_id through the quote line columns', () => {
    expect(quotesService).toContain('quote_rate_id');
    expect(quotesService).toContain('lineColumns = [\'quote_id\', \'line_type\', \'description\', \'quantity\', \'unit\', \'unit_cost\', \'unit_price\', \'tax_rate\', \'material_id\', \'profile_id\', \'position\', \'discount_percent\', \'quote_rate_id\', \'concept_id\', \'rate_version_id\', \'billing_mode\', \'period_days\', \'contributes_to_sale\']');
  });

  it('exposes UI states without exposing deleted_at: Activo, Sin stock, Consumido, Archivado', () => {
    expect(app).toContain("if (material.deleted_at) return 'Archivado'; if (material.active === false) return material.is_specific === true ? 'Consumido' : 'Inactivo'; return materialStockStatus(material)");
    expect(app).toContain('stockStatus === \'Activo\' ? \'ok\'');
    expect(app).toContain('Reactivar');
    expect(app).toContain("materialsService.reactivate(reactivating.id)");
    expect(app).toContain('materialsService.reactivate');
    expect(app).toContain('Material específico / a medida');
    expect(app).toContain('queda como Consumido (sin borrar historial); se reactiva automáticamente si vuelve a haber stock');
  });

  it('reactivates materials only through an explicit service method, keeping the restore flow for archived records', () => {
    expect(materialsService).toContain('reactivate(id: string)');
    expect(materialsService).toContain('{ active: true, deleted_at: null, deleted_by: null, delete_reason: null }');
    expect(app).toContain("entityLifecycleService.restore('materials', removing.id, reason)");
    expect(app).toContain('Restaurar material');
    expect(app).toContain('Motivo de restauración');
  });

  it('shows a labor rate selector with valid options by category and technician instead of an arbitrary first rate', () => {
    expect(app).toContain('Tarifa de mano de obra');
    expect(app).toContain('rate.technician_profile_id ? fullName(rate.profiles) : rate.category');
    expect(app).toContain('selectLaborRate');
    expect(app).toContain("quote_rate_id: rate.id, unit: 'h', unit_cost: rate.hourly_cost, unit_price: rate.hourly_price");
    expect(app).not.toContain('proposedRate');
    expect(app).toContain('Elige la tarifa de mano de obra vigente para precargar coste y precio hora');
  });

  it('shows the rate used when the line was created when editing and keeps saved snapshots', () => {
    expect(app).toContain('Tarifa utilizada al crear la línea');
    expect(app).toContain('Se conservan los valores guardados aunque la tarifa cambie o se archive');
    expect(app).not.toContain('Tarifa vigente aplicada solo al crear la línea');
  });

  it('keeps migration declarative: no service role, no RLS disable, keeps company_id', () => {
    expect(migration).toContain('-- Idempotente. Mantiene RLS y company_id. Sin borrados destructivos y sin service_role.');
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('auth.uid() is null');
  });
});
