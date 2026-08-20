import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/058_fix_work_order_material_economics.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const previous035 = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const previous039 = readFileSync(new URL('../../supabase/migrations/039_economic_work_order_summary.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const trigger = migration.slice(migration.indexOf('create or replace function public.dmp_work_order_material_set_totals_trigger'), migration.indexOf('drop trigger if exists work_order_material_set_totals_trigger'));
const rpc = migration.slice(migration.indexOf('create or replace function public.dmp_upsert_work_order_material(p_payload jsonb)'), migration.indexOf('revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;'));
const backfill = migration.slice(migration.indexOf('do $$'), migration.indexOf('-- Verificacion READ-ONLY posterior'));

describe('058 work order material economics fix', () => {
  it('parses migration SQL (sintaxis PostgreSQL valida)', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('snapshot de unit_cost (COSTE REAL) desde materials.cost, JAMAS desde materials.price', () => {
    expect(migration).toContain('v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material_row.cost, 0) end;');
    expect(migration).toContain('unit_cost, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity)');
    expect(rpc).not.toContain('coalesce(v_material_row.cost, v_unit_price)');
    expect(previous035).toContain('coalesce(v_material_row.cost, v_unit_price)');
    expect(rpc).not.toContain('unit_cost = coalesce(v_material_row.price');
  });

  it('unit_price (VENTA) separado del coste: catalogo para tecnicos, override solo admin', () => {
    expect(migration).toContain('v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material_row.price, 0) end;');
    expect(migration).toContain('v_admin boolean := public.has_any_role(array[\'superadmin\',\'SAT\',\'Gerencia\'])');
    expect(previous035).toContain('else 0 end');
  });

  it('el coste se resuelve SIEMPRE en el servidor; el navegador del tecnico no aporta coste', () => {
    expect(migration).toContain('v_requested_cost numeric := nullif(p_payload->>\'unit_cost\', \'\')::numeric;');
    expect(migration).not.toContain('else v_requested_cost end;');
    expect(migration).toContain('when v_admin and v_requested_cost is not null then v_requested_cost');
  });

  it('INSERT de catalogo escribe unit_cost desde materials.cost y unit_price desde materials.price', () => {
    expect(migration).toContain('v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material_row.cost, 0) end;');
    expect(migration).toContain('v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material_row.price, 0) end;');
    expect(previous035).not.toContain('used_quantity, unit, unit_cost, unit_price');
    expect(previous035).not.toContain('unit_cost = v_unit_cost');
  });

  it('UPDATE conserva el snapshot de la fila: cambiar cantidad/notas no refresca el catalogo', () => {
    expect(migration).toContain('v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else v_previous.unit_cost end;');
    expect(migration).toContain('v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else v_previous.unit_price end;');
    expect(migration).toContain('unit_cost = v_unit_cost, unit_price = v_unit_price, total_cost = round(v_quantity * v_unit_cost, 2), total_price = round(v_quantity * v_unit_price, 2)');
    expect(previous035).not.toContain('unit_cost = v_unit_cost');
  });

  it('cambiar material_id SI captura el snapshot del nuevo catalogo (nueva referencia de consumo)', () => {
    expect(migration).toContain('if v_material is not null and v_previous.material_id is distinct from v_material then');
    expect(migration).toContain('v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material_row.cost, 0) end;');
  });

  it('materiales manuales (sin catalogo) mantienen unit_cost 0 y venta 0 para tecnicos', () => {
    expect(migration).toContain('v_unit_cost := 0;');
    expect(migration).toContain('v_unit_price := case when v_admin then coalesce(v_requested_price, 0) else 0 end;');
    expect(migration).toContain('if v_material is null and trim(coalesce(p_payload->>\'description\', \'\')) = \'\'');
  });

  it('los movimientos de stock de salida portan el snapshot unit_cost (trazabilidad 035/052 intacta)', () => {
    expect(migration).toContain("public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity, 'Consumo en parte ' || v_work.code, 'work_order', v_work.id, v_id, null, v_unit_cost, v_profile.id)");
    expect(rpc).not.toContain('coalesce(v_material_row.cost, v_unit_price)');
    expect(migration).toContain('v_previous.material_id, \'return\', v_previous.stock_deducted_quantity, \'Correccion de material de parte\', \'correction\', v_work.id, v_previous.id, null, v_previous.unit_price, v_profile.id');
  });

  it('trigger recalcula totales con unit_cost/unit_price reales, sin mirar catalogo ni reinterpretar 0', () => {
    expect(migration).toContain('new.unit_cost := coalesce(new.unit_cost, 0);');
    expect(migration).toContain('new.unit_price := coalesce(new.unit_price, 0);');
    expect(migration).toContain('new.total_cost := round(coalesce(new.used_quantity, 0) * new.unit_cost, 2);');
    expect(migration).toContain('new.total_price := round(coalesce(new.used_quantity, 0) * new.unit_price, 2);');
    expect(trigger).not.toContain('coalesce(new.unit_cost, new.unit_price, 0)');
    expect(previous039).toContain('coalesce(new.unit_cost, new.unit_price, 0)');
    expect(migration).toContain('drop trigger if exists work_order_material_set_totals_trigger on public.work_order_materials;');
  });

  it('mantiene permisos y control de edicion de la version efectiva de 035', () => {
    expect(migration).toContain('if v_previous.id is null or not (v_previous.registered_by = v_profile.id or public.has_any_role(array[\'superadmin\',\'SAT\',\'Gerencia\']))');
    expect(migration).toContain('revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;');
    expect(migration).toContain('revoke all on function public.dmp_upsert_work_order_material(jsonb) from anon;');
    expect(migration).toContain('grant execute on function public.dmp_upsert_work_order_material(jsonb) to authenticated;');
  });

  it('backfill conservador: solo filas de catalogo con uso real y unit_cost 0 con traza fiable de salida', () => {
    expect(migration).toContain('and wom.material_id is not null');
    expect(migration).toContain('and wom.used_quantity > 0');
    expect(migration).toContain('and coalesce(wom.unit_cost, 0) = 0');
    expect(migration).toContain("and m.movement_type = 'out'");
    expect(migration).toContain("and m.source = 'work_order'");
    expect(migration).toContain('and coalesce(m.unit_cost, 0) > 0');
    expect(migration).toContain('order by m.created_at desc, m.id desc');
    expect(migration).toContain('where historical_unit_cost is not null');
  });

  it('backfill usa SOLO la traza de material_stock_movements, nunca materials.price, sin inventar datos', () => {
    expect(migration).toContain('select m.unit_cost, m.created_at, m.id');
    expect(migration).not.toContain('coalesce(msm.unit_cost, wom.unit_price)');
    expect(migration).not.toContain('materials.price as cost');
    expect(migration).not.toContain('from public.materials m2');
  });

  it('backfill recalcula totales y sincroniza real_cost_amount/margen de las partes afectadas', () => {
    expect(migration).toContain('set unit_cost = r.historical_unit_cost,');
    expect(migration).toContain('total_cost = round(r.used_quantity * r.historical_unit_cost, 2),');
    expect(migration).toContain('total_price = round(r.used_quantity * r.unit_price, 2),');
    expect(migration).toContain('set real_cost_amount = v.real_cost_amount,');
    expect(migration).toContain('estimated_margin_amount = case');
    expect(migration).toContain("when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0");
    expect(migration).toContain('from public.v_work_order_economic_summary v');
  });

  it('filas ambiguas (sin traza fiable) quedan intactas y se cuentan para verificacion', () => {
    expect(backfill).toMatch(/not exists\s*\(\s*select 1 from public\.material_stock_movements m\s+where m\.work_order_material_id = wom\.id\s+and m\.movement_type = 'out'\s+and m\.source = 'work_order'\s+and coalesce\(m\.unit_cost, 0\) > 0\s*\)/);
    expect(migration).toContain('raise notice \'dmp_058: work_order_materials reparados=% ; partes afectados=% ; filas ambiguas sin reparar=%\'');
  });

  it('backfill casa el movimiento historico inequivocamente por work_order_material_id (FK), sin matching debil', () => {
    expect(backfill).toContain('where m.work_order_material_id = wom.id');
    expect(backfill).not.toMatch(/m\.material_id = wom\.material_id/);
    expect(backfill).not.toMatch(/m\.work_order_id = wom\.work_order_id/);
    expect(backfill).not.toMatch(/m\.created_at\s*=\s*wom\./);
  });

  it('backfill es estrictamente economico: NO llama a stock ni muta stock/movimientos', () => {
    expect(backfill).not.toContain('dmp_apply_material_stock_movement');
    expect(backfill).not.toContain('stock_quantity');
    expect(backfill).not.toContain('stock_deducted_quantity');
    expect(backfill).not.toContain('insert into public.material_stock_movements');
    expect(backfill).not.toContain('update public.material_stock_movements');
    expect(backfill).not.toContain('delete from public.material_stock_movements');
  });

  it('backfill NO reconstruye venta historica: no SET unit_price ni materials.price, solo recalcula total_price', () => {
    expect(backfill).not.toContain('set unit_price');
    expect(backfill).not.toContain('materials.price');
    expect(backfill).toContain('set unit_cost = r.historical_unit_cost,');
    expect(backfill).toContain('total_price = round(r.used_quantity * r.unit_price, 2),');
  });

  it('no toca stock 035/052 ni tarifas 042 ni quotes; no amplia alcance', () => {
    expect(migration).not.toContain('create or replace function public.dmp_apply_material_stock_movement(');
    expect(migration).not.toContain('create or replace function public.dmp_delete_work_order_material');
    expect(migration).not.toContain('technician_hour_rates');
    expect(migration).not.toContain('quote_lines');
    expect(migration).not.toContain('alter table');
  });

  it('declarativo e idempotente: RLS activa, company_id, sin service_role, sin borrados destructivos', () => {
    expect(migration).toContain('-- Idempotente. Mantiene RLS y company_id. Sin borrados destructivos y sin service_role.');
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('to service_role');
    expect(migration).not.toContain('delete from public.work_order_materials');
    expect(migration).toContain('create or replace function public.dmp_upsert_work_order_material(p_payload jsonb)');
    expect(migration).toContain('create or replace function public.dmp_work_order_material_set_totals_trigger()');
    expect(migration).toContain('on commit drop');
  });

  it('no modifica las migraciones 001-057: 058 solo redefine funciones y backfillea de forma conservadora', () => {
    expect(migration).not.toContain('create table');
    expect(migration).not.toContain('add column');
    expect(migration).not.toContain('drop column');
    expect(migration).not.toContain('delete from public.work_order_time_entries');
    expect(migration).not.toContain('delete from public.work_order_cost_entries');
  });
});