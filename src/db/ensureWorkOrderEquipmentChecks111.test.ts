import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/111_ensure_work_order_equipment_checks.sql', import.meta.url), 'utf8');
const migration112 = readFileSync(new URL('../../supabase/migrations/112_ensure_preventive_work_order_equipment_checks.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_ensure_work_order_equipment_checks_111.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_ensure_work_order_equipment_checks_111.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../supabase/verification/audit_work_order_equipment_checks_111.sql', import.meta.url), 'utf8');
const preflight112 = readFileSync(new URL('../../supabase/verification/preflight_ensure_preventive_work_order_equipment_checks_112.sql', import.meta.url), 'utf8');
const postflight112 = readFileSync(new URL('../../supabase/verification/postflight_ensure_preventive_work_order_equipment_checks_112.sql', import.meta.url), 'utf8');
const historicalAudit112 = readFileSync(new URL('../../supabase/verification/audit_historical_equipment_checks_112.sql', import.meta.url), 'utf8');

describe('ensure work order equipment checks 111', () => {
  it('parses the migration and keeps the check work inside the creation transaction', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(migration112).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(audit).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight112).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight112).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(historicalAudit112).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight + audit + preflight112 + postflight112 + historicalAudit112).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table|notify)\b/i);
    expect(migration).toContain('begin;');
    expect(migration).toContain('perform public.dmp_ensure_work_order_equipment_check');
    expect(migration).toContain('insert into public.equipment');
    expect(migration).toContain('insert into public.work_order_equipment');
    expect(migration).toContain('insert into public.checks');
  });

  it('covers maintenance and installation, the primary, all additional equipment, and real ids for new equipment', () => {
    expect(migration).toContain("p_work_order_type not in ('Instalacion', 'Mantenimiento')");
    expect(migration).toContain('if v_equipment_id is not null and v_equipment_id = v_main_equipment_id then continue; end if;');
    expect(migration).toContain('returning id into v_equipment_id');
    expect(migration.match(/perform public\.dmp_ensure_work_order_equipment_check/g)).toHaveLength(2);
    expect(Array.from({ length: 22 }, (_, index) => `equipment-${index}`)).toHaveLength(22);
  });

  it('keeps quote maintenance in the maintenance check flow and exposes the main id from the UI', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("quote.quote_type === 'mantenimiento' ? 'Mantenimiento'");
    expect(app).toContain('main_equipment_id: values.main_equipment_id || null');
    expect(app).toContain("initialInstallation || values.type === 'Mantenimiento'");
  });

  it('is idempotent per active work order and equipment and reports missing templates explicitly', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('where work_order_id = p_work_order_id and equipment_id = p_equipment_id and deleted_at is null');
    expect(migration).toContain("set check_status = 'pending_template'");
    expect(migration).toContain("raise exception 'No existe una plantilla activa compatible'");
  });

  it('audits every association and makes missing or duplicate coverage blocking', () => {
    expect(audit).toContain('left join lateral');
    expect(audit).toContain('count(*) over () as active_check_count');
    expect(audit).toContain('order by c.created_at, c.id');
    expect(audit).not.toMatch(/\bmin\s*\(\s*c\.(id|template_id|status)\s*\)/i);
    expect(audit).not.toMatch(/\bmax\s*\(\s*c\.(id|template_id|status)\s*\)/i);
    expect(postflight).not.toMatch(/\bmin\s*\(\s*uuid|\bmax\s*\(\s*uuid/i);
    expect(audit).toContain("'CHECK_CREATED'");
    expect(audit).toContain("'PENDING_TEMPLATE'");
    expect(audit).toContain("'NOT_APPLICABLE'");
    expect(audit).toContain("'MISSING_CHECK'");
    expect(audit).toContain("'DUPLICATE_CHECK'");
    expect(postflight).toContain("case when missing = 0 then 'OK' else 'BLOCKER' end");
    expect(postflight).toContain("case when duplicates = 0 then 'OK' else 'BLOCKER' end");
    expect(postflight).toContain("case when invalid_not_applicable = 0 then 'OK' else 'BLOCKER' end");
  });

  it('extends the canonical helper to Preventivo without reverting to not_applicable', () => {
    expect(migration112).toContain("p_work_order_type not in ('Instalacion', 'Mantenimiento', 'Preventivo')");
    expect(migration112).toContain("if v_type not in ('Instalacion', 'Mantenimiento', 'Preventivo')");
    expect(migration112).toContain("set check_status = 'pending_template'");
    expect(migration112).not.toContain("p_work_order_type not in ('Instalacion', 'Mantenimiento')");
    expect(postflight112).toContain("'RUNTIME / DEPLOYMENT'");
    expect(postflight112).toContain("'preventive_runtime_support'");
    expect(postflight112).toContain("'HISTORICAL DATA'");
    expect(postflight112).toContain("'historical_missing_checks'");
    expect(postflight112).toContain("'historical_preventive_not_applicable'");
    expect(postflight112).not.toContain("case when missing = 0 then 'OK' else 'BLOCKER' end");
    expect(historicalAudit112).toContain('historical_classification');
    expect(historicalAudit112).toContain('HISTORICAL_PREVENTIVE_NOT_APPLICABLE');
  });
});
