import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/087_fix_installation_check_template_resolution.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_installation_check_template_resolution_087.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_installation_check_template_resolution_087.sql', import.meta.url), 'utf8');
const workOrders = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const multiEquipment = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');

type Template = { id: string; company_id: string | null; equipment_type_id: string; name: string; active: boolean };

function resolve(companyId: string, typeId: string, templates: Template[]) {
  return templates
    .filter((template) => template.active && template.equipment_type_id === typeId && (template.company_id === companyId || template.company_id === null))
    .sort((left, right) => {
      const tenant = Number(left.company_id !== companyId) - Number(right.company_id !== companyId);
      if (tenant) return tenant;
      const installation = Number(!/instal|puesta en marcha/i.test(left.name)) - Number(!/instal|puesta en marcha/i.test(right.name));
      return installation || left.id.localeCompare(right.id);
    })[0]?.id ?? null;
}

function pendingCount(rows: { equipment_id: string; check_status: string }[], checks: { equipment_id: string; status: string }[]) {
  const generated = new Set(checks.map((check) => check.equipment_id));
  return checks.filter((check) => check.status !== 'Realizado').length + rows.filter((row) => row.check_status === 'pending_template' && !generated.has(row.equipment_id)).length;
}

describe('installation check template resolution 087', () => {
  it('parses migration and read-only verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table|notify)\b/i);
  });

  it('resolves active templates by exact equipment type for installation', () => {
    const templates = [
      { id: 'abrigo', company_id: null, equipment_type_id: 'abrigo-type', name: 'Check Abrigo de muelle', active: true },
      { id: 'muelle', company_id: null, equipment_type_id: 'muelle-type', name: 'Check Muelle de carga', active: true },
      { id: 'seccional', company_id: null, equipment_type_id: 'seccional-type', name: 'Check Puerta seccional industrial', active: true },
    ];
    expect(resolve('tenant', 'abrigo-type', templates)).toBe('abrigo');
    expect(resolve('tenant', 'muelle-type', templates)).toBe('muelle');
    expect(resolve('tenant', 'seccional-type', templates)).toBe('seccional');
    expect(resolve('tenant', 'other-type', templates)).toBeNull();
  });

  it('prefers installation names, then tenant scope, then deterministic fallback', () => {
    const templates = [
      { id: 'global-generic', company_id: null, equipment_type_id: 'type', name: 'Check Tipo', active: true },
      { id: 'tenant-generic', company_id: 'tenant', equipment_type_id: 'type', name: 'Plantilla normal', active: true },
      { id: 'global-install', company_id: null, equipment_type_id: 'type', name: 'Instalación Tipo', active: true },
      { id: 'tenant-install', company_id: 'tenant', equipment_type_id: 'type', name: 'Puesta en marcha Tipo', active: true },
    ];
    expect(resolve('tenant', 'type', templates)).toBe('tenant-install');
    expect(resolve('other', 'type', templates)).toBe('global-install');
    expect(resolve('tenant', 'missing', templates)).toBeNull();
  });

  it('uses one resolver in both RPCs and preserves the 082 transaction', () => {
    expect(migration).toContain('public.dmp_resolve_check_template(v_company_id, v_equipment_type_id)');
    expect(migration).toContain('public.dmp_resolve_check_template(v_company_id, v_type_id)');
    expect(migration).not.toContain("lower(name) like '%instal%'");
    expect(migration).toContain('jsonb_array_elements(v_selection)');
    expect(migration).toContain('insert into public.work_order_equipment');
    expect(migration).toContain('insert into public.checks');
    expect(migration).toContain('assign_technician');
    expect(multiEquipment).toContain('equipment_selection');
  });

  it('keeps pending_template for a missing template and avoids duplicate checks', () => {
    expect(migration).toContain("then 'pending_template'");
    expect(migration).toContain('select id into v_check_id from public.checks');
    expect(migration).toContain('where work_order_id = p_work_order_id and equipment_id = p_equipment_id');
    expect(migration).toContain("update public.work_order_equipment set check_status = 'generated'");
  });

  it('models the nine-equipment case and counts pending rows without double counting', () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ equipment_id: `equipment-${index}`, check_status: 'pending_template' }));
    expect(pendingCount(rows, [])).toBe(9);
    expect(pendingCount(rows, [{ equipment_id: 'equipment-0', status: 'Por realizar' }])).toBe(9);
    expect(pendingCount(rows.map((row) => ({ ...row, check_status: 'generated' })), rows.map((row) => ({ equipment_id: row.equipment_id, status: 'Por realizar' })))).toBe(9);
    expect(app).toContain('pendingWorkOrderCheckCount');
    expect(app).toContain('Check pendiente de generar');
    expect(app).toContain('Sin plantilla compatible');
  });

  it('loads compatible templates scoped to the work order company', () => {
    expect(workOrders).toContain("from('check_templates')");
    expect(workOrders).toContain(".eq('active', true)");
    expect(workOrders).toContain('company_id.eq.${workOrder.company_id},company_id.is.null');
    expect(postflight).toContain("rt.equipment_type_id = et.id");
    expect(postflight).toContain("PAR-2026-000023");
  });
});
