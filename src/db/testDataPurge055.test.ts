import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/055_test_data_purge_controls.sql', import.meta.url), 'utf8');
const initial = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const lifecycle023 = readFileSync(new URL('../../supabase/migrations/023_work_order_operations_and_controlled_delete.sql', import.meta.url), 'utf8');
const material052 = readFileSync(new URL('../../supabase/migrations/052_material_lifecycle_rate_traceability.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

const CASELINK_RELATED_TYPES = ['Equipo', 'Parte', 'Check', 'Aviso', 'Documento', 'Presupuesto', 'Incidencia', 'Oportunidad'];
const DOCLINK_RELATED_TYPES = ['Cliente', 'Centro', 'Equipo', 'Tipo de equipo', 'Marca', 'Modelo', 'Motor', 'Cuadro', 'Expediente', 'Parte', 'Check'];
// Valores reales de alerts.related_entity escritos por el frontend (App.tsx routeForAlert + creacion, workOrdersService).
const ALERT_RELATED_ENTITY_VALUES = ['work_orders', 'deficiencies', 'equipment', 'checks', 'clients', 'sites', 'cases'];

// pg-query-emscripten 5.1.0 (build WASM, Node 24) corrompe su pila con entradas de
// varias decenas de KB incluso vacias de SQL («select 1;» x 60KB). Por eso el parseo
// se hace por SENTENCIA: cubre el 100% de la migracion y es robusto frente a ese
// limite del motor de parsing.
function dollarTag(sql: string, i: number): string {
  const m = /^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i));
  return m ? m[0] : '';
}
function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }
    const tag = c === '$' ? dollarTag(sql, i) : '';
    if (tag) {
      i += tag.length;
      const close = sql.indexOf(tag, i);
      buf += tag + sql.slice(i, close === -1 ? n : close + tag.length);
      i = close === -1 ? n : close + tag.length;
      continue;
    }
    if (c === ';') {
      buf += c;
      if (buf.replace(/--.*$/gm, '').trim()) stmts.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.replace(/--.*$/gm, '').trim()) stmts.push(buf.trim());
  return stmts;
}
const migrationStatements = splitStatements(migration);

// Solo la seccion del motor de purga (antes del batch) para validar el orden
// "already_deleted antes de la auditoria".
const purgeFn = migration.slice(0, migration.indexOf('create or replace function public.dmp_purge_test_batch'));

// Tests estructurales (sin integracion PostgreSQL real): validan el SQL de 055 y su
// coherencia con 001/023/052 y con las convenciones del frontend.
describe('purga datos de prueba 055', () => {
  it('parsea TODO el SQL de la migracion con pg-query-emscripten (por sentencia)', async () => {
    // 20 sentencias top-level detectadas (incluye begin/commit).
    expect(migrationStatements.length).toBe(20);
    for (const st of migrationStatements) {
      // Instancia fresca por sentencia: el build WASM no degrada con entradas largas.
      const parser = await pgQuery();
      let parsed;
      expect(() => { parsed = parser.parse(st); }).not.toThrow();
      expect(parsed.parse_tree.stmts.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('1. oportunidad con quotes vinculadas bloquea la purga (P1, sin cascade)', () => {
    expect(migration).toContain("'presupuestos', (select count(*) from public.quotes where opportunity_id = p_entity_id)");
    expect(migration).toContain('select count(*) into v_num from public.quotes where opportunity_id = p_entity_id;');
    expect(migration).toMatch(/raise exception 'purga: la oportunidad tiene % presupuestos vinculados/);
    expect(migration).not.toMatch(/delete from public\.quotes where opportunity_id = p_entity_id/i);
    expect(lifecycle023).toContain('create or replace function public.dmp_lifecycle_dependencies_enhanced');
  });

  it('2. equipment detecta work_orders activos', () => {
    expect(migration).toMatch(/w\.deleted_at is null/);
    expect(migration).toMatch(/usa scope\.purge_related_work_orders\.enable para purgarlos/i);
  });

  it('3. equipment detecta work_orders archivados y bloquea (P1, sin anular FK)', () => {
    expect(migration).toMatch(/w\.deleted_at is not null/);
    expect(migration).toMatch(/hay % partes archivados que referencian el equipo/);
    expect(migration).not.toContain('update public.work_orders set main_equipment_id = null');
    expect(migration).not.toContain('delete from public.work_orders where deleted_at');
  });

  it('4. equipment detecta work_order_equipment (activo y archivado)', () => {
    const joins = migration.match(/work_order_equipment woe on woe\.work_order_id = w\.id/g) ?? [];
    expect(joins.length).toBeGreaterThanOrEqual(3);
    expect(migration).toMatch(/woe\.equipment_id = p_entity_id/);
  });

  it('5. stock: stock_deducted_quantity es la unica fuente de devolucion del parte', () => {
    expect(migration).toContain('dmp_refund_work_order_material_stock');
    expect(migration).toMatch(/perform public\.dmp_refund_work_order_material_stock\(v_usage\.id/);
    expect(migration.match(/dmp_apply_material_stock_movement\(/g)?.length ?? 0).toBe(1);
  });

  it('6. movimiento ligado a un uso no provoca segunda devolucion (ramas quote)', () => {
    expect(migration).toMatch(/if v_mov\.work_order_material_id is not null then\s*\n\s*continue;/);
  });

  it('7. p_return_stock=false no modifica stock', () => {
    expect(migration).toMatch(/if p_return_stock then\s*\n\s*for v_usage in select \* from public\.work_order_materials/);
    expect(migration).toMatch(/if p_return_stock then\s*\n\s*raise exception 'purga: hay movimientos de stock del presupuesto sin uso asociado/);
    expect(migration).not.toContain("'return', -v_delta");
  });

  it('8. is_specific conserva la logica de 052 (055 no redefine apply y la devolucion pasa por source work_order)', () => {
    expect(migration).not.toContain('create or replace function public.dmp_apply_material_stock_movement');
    expect(material052).toMatch(/v_material\.is_specific and not v_material\.active and v_material\.deleted_at is null and p_movement_type in \('in','return','correction','adjustment'\)/);
    expect(migration).toMatch(/dmp_apply_material_stock_movement\(\s*\n\s*v_usage\.material_id, 'return', v_usage\.stock_deducted_quantity,\s*\n\s*p_reason, 'work_order'/);
  });

  it('9. movimiento ambiguo sin usage bloquea con p_return_stock=true', () => {
    expect(migration).toMatch(/no se puede reconciliar con seguridad/i);
  });

  it('10. batch: IDs duplicados no producen doble purge/auditoria', () => {
    expect(migration).toMatch(/v_entity \|\| '\/' \|\| v_id::text = any\(v_done\)/);
    expect(migration).toContain("'duplicate_in_batch', true");
    expect(migration).toContain('v_skipped := v_skipped + 1;');
  });

  it('11. raiz inexistente devuelve already_deleted sin auditoria DELETE falsa', () => {
    const alreadyDeletedCount = (purgeFn.match(/'operation', 'already_deleted'/g) ?? []).length;
    expect(alreadyDeletedCount).toBeGreaterThanOrEqual(13);
    const auditIdx = purgeFn.indexOf('insert into public.audit_log');
    expect(auditIdx).toBeGreaterThan(-1);
    expect(purgeFn.lastIndexOf("'operation', 'already_deleted'")).toBeLessThan(auditIdx);
    expect((purgeFn.match(/insert into public\.audit_log/g) ?? []).length).toBe(1);
    expect((purgeFn.match(/insert into public\.activity_log/g) ?? []).length).toBe(1);
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('dmp_purge:'");
  });

  it('12. document_links usa unicamente related_type validos (001), sin ramas imposibles', () => {
    for (const rt of ['Presupuesto', 'Componente', 'Documento', 'Incidencia', 'Aviso', 'Oportunidad']) {
      expect(migration).not.toContain(`document_links where related_type = '${rt}'`);
    }
    const usedDoc = [...migration.matchAll(/document_links where related_type = '([^']+)'/g)].map((m) => m[1]);
    expect(usedDoc.length).toBeGreaterThan(0);
    for (const rt of usedDoc) expect(DOCLINK_RELATED_TYPES).toContain(rt);
    expect(initial).toContain("related_type in ('Cliente','Centro','Equipo','Tipo de equipo','Marca','Modelo','Motor','Cuadro','Expediente','Parte','Check')");
  });

  it('13. case_links usa unicamente related_type validos (001), sin Cliente/Centro/Componente', () => {
    for (const rt of ['Cliente', 'Centro', 'Componente']) {
      expect(migration).not.toContain(`case_links where related_type = '${rt}'`);
    }
    const usedCase = [...migration.matchAll(/case_links where related_type = '([^']+)'/g)].map((m) => m[1]);
    expect(usedCase.length).toBeGreaterThan(0);
    for (const rt of usedCase) expect(CASELINK_RELATED_TYPES).toContain(rt);
    expect(initial).toContain("related_type in ('Equipo','Parte','Check','Aviso','Documento','Presupuesto','Incidencia','Oportunidad')");
  });

  it('14. alerts usa los valores reales de related_entity del proyecto', () => {
    expect(ALERT_RELATED_ENTITY_VALUES).toContain('work_orders');
    expect(app).toMatch(/work_orders: '\/app\/partes'/);
    expect(workOrdersService).toMatch(/eq\('related_entity', 'work_orders'\)/);
    const usedIn055 = [...migration.matchAll(/related_entity = '([a-z_]+)'/g)].map((m) => m[1]);
    expect(usedIn055.length).toBeGreaterThan(0);
    for (const v of usedIn055) {
      expect(ALERT_RELATED_ENTITY_VALUES).toContain(v);
    }
    expect(migration).not.toContain("related_entity = 'Equipo'");
    expect(migration).not.toContain("related_entity = 'Presupuesto'");
  });

  it('15. dry-run sigue siendo 100% read-only (solo plan)', () => {
    const dryRunIdx = migration.indexOf('if p_dry_run then');
    const dryRunBlock = migration.slice(dryRunIdx, dryRunIdx + 900);
    expect(dryRunBlock).toContain("'operation', 'dry_run'");
    expect(dryRunBlock).toContain("'plan', v_deps || v_plan");
    expect(dryRunBlock).not.toMatch(/delete from|update |insert into|perform public\.dmp_/);
  });

  it('16. gate sigue siendo is_platform_superadmin en purge y batch', () => {
    const gates = migration.match(/if not public\.is_platform_superadmin\(\) then/g) ?? [];
    expect(gates.length).toBe(2);
  });

  it('17. helpers internos y motor de purga no quedan expuestos a public/anon/authenticated', () => {
    for (const fn of [
      'dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean)',
      'dmp_purge_document_links(text, uuid, text, uuid, text)',
      'dmp_refund_work_order_material_stock(uuid, uuid, text)',
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn} from public;`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon;`);
      expect(migration).not.toContain(`grant execute on function public.${fn} to authenticated;`);
    }
    expect(migration).toContain('grant execute on function public.dmp_purge_test_batch(uuid, jsonb, text, text, boolean) to authenticated;');
    expect(migration).not.toContain('service_role');
  });

  it('18. dependencies / delete_plan / purge coinciden para los P1', () => {
    const oppQuoteRefs = migration.match(/from public\.quotes where opportunity_id = p_entity_id/g) ?? [];
    expect(oppQuoteRefs.length).toBeGreaterThanOrEqual(3);
    expect(migration).toMatch(/'partes_archivados', \(select count\(\*\) from public\.work_orders w left join public\.work_order_equipment/);
    expect(migration).toMatch(/'partes', \(select count\(\*\) from public\.work_orders where main_equipment_id = p_entity_id\) \+ \(select count\(\*\) from public\.work_order_equipment where equipment_id = p_entity_id\)/);
  });
});