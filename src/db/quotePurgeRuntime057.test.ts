import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const purgeMigration = readFileSync(new URL('../../supabase/migrations/055_test_data_purge_controls.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fixMigration = readFileSync(new URL('../../supabase/migrations/057_fix_quote_purge_runtime.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Extrae el cuerpo de dmp_purge_entity_with_cleanup (create or replace function ... $$;) de una migracion.
function purgeBody(sql: string) {
  const start = sql.indexOf('create or replace function public.dmp_purge_entity_with_cleanup(');
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart) + 3;
  return sql.slice(start, end);
}

describe('purga definitiva 057: v_scope declarado en el motor de purga (SQLSTATE 42703)', () => {
  it('055 usaba v_scope en los INSERT finales de auditoría sin declararlo (causa del fallo runtime)', () => {
    expect(purgeMigration).toContain("'scope', v_scope, 'deleted_at', now()));");
    expect(purgeMigration).toContain("jsonb_build_object('reason', p_reason, 'code', v_code, 'scope', v_scope,");
    expect(purgeBody(purgeMigration)).not.toMatch(/v_scope\s+jsonb\s*;/);
    expect(purgeBody(purgeMigration)).not.toContain('v_scope := p_scope;');
  });

  it('057 declara v_scope como jsonb y la asigna desde p_scope antes de los INSERT', () => {
    const body = purgeBody(fixMigration);
    expect(body).toContain('v_scope jsonb;');
    expect(body).toContain('v_scope := p_scope;');
    const declareBlock = body.slice(body.indexOf('declare'), body.indexOf('begin'));
    expect(declareBlock).toMatch(/v_scope\s+jsonb\s*;/);
  });

  it('057 parte exactamente de la versión efectiva de 055: solo añade la declaración y la asignación', () => {
    const original = purgeBody(purgeMigration);
    const fixed = purgeBody(fixMigration);
    const reduced = fixed.replace('  v_scope jsonb;\n', '').replace('  v_scope := p_scope;\n\n', '');
    expect(reduced).toBe(original);
  });

  it('057 conserva la rama quotes íntegra para el caso mínimo protegido (archivado, 3 líneas, 0 partes/stock/historial/vínculos)', () => {
    const body = purgeBody(fixMigration);
    expect(body).toContain("if exists (select 1 from public.deficiencies where origin_quote_id = p_entity_id) then");
    expect(body).toContain('delete from public.work_order_quote_line_decisions');
    expect(body).toContain('delete from public.work_order_planned_material_decisions');
    expect(body).toContain('delete from public.work_order_cost_entries');
    expect(body).toContain('delete from public.material_stock_movements where quote_id = p_entity_id;');
    expect(body).toContain('delete from public.quote_status_history where quote_id = p_entity_id;');
    expect(body).toContain('delete from public.quote_lines where quote_id = p_entity_id;');
    expect(body).toContain("delete from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id;");
    expect(body).toContain('delete from public.quotes where id = p_entity_id;');
  });

  it('057 no introduce más variables sin declarar en el motor de purga', () => {
    const body = purgeBody(fixMigration);
    const declared = new Set((body.match(/^\s{2}(v_[a-z0-9_]+)/gm) ?? []).map((s: string) => s.trim()));
    const used = new Set(body.match(/\bv_[a-z0-9_]+\b/g) ?? []);
    const attributed = new Set(
      [...used].filter((token) =>
        [...declared].some((decl) => token === decl || token.startsWith(decl + '_')),
      ),
    );
    const undeclared = [...used].filter((token) => !attributed.has(token));
    expect(undeclared).toEqual([]);
  });

  it('057 no toca las migraciones 001-056: no crea tablas, no elimina datos y no redefine otras funciones', () => {
    // Elimina el cuerpo de la unica funcion redefinida ($$...$$); lo que queda fuera
    // NO puede contener DDL/DML adicional (create table, delete from, alter table, etc.).
    const outside = fixMigration.replace(/\$\$[\s\S]*?\$\$;/, '');
    const codeLines = outside.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('--');
    });
    const sql = codeLines.join('\n');
    expect(sql).not.toMatch(/create table|create index|alter table|drop (table|index|policy|trigger)/i);
    expect(sql).not.toMatch(/delete from/i);
    expect(sql.split('create or replace function public.').length - 1).toBe(1);
    expect(sql).toContain('grant execute on function public.dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean) to authenticated;');
  });

  it('los INSERT finales de auditoría siguen usando v_scope, ahora declarado (evento único en audit_log y activity_log)', () => {
    const body = purgeBody(fixMigration);
    expect(body).toContain("insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)");
    expect(body).toContain("insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata)");
    expect(body).toContain("'scope', v_scope, 'deleted_at', now()));");
  });
});