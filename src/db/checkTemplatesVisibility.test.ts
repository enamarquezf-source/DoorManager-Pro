import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const checksService = readFileSync(new URL('../services/checksService.ts', import.meta.url), 'utf8');
const superadminService = readFileSync(new URL('../services/superadminService.ts', import.meta.url), 'utf8');

describe('check template visibility regression', () => {
  it('define undefined, null y UUID de forma explícita en listados de plantillas', () => {
    expect(superadminService).toContain('async templates(companyScope?: string | null)');
    expect(superadminService).toContain('const companyId = companyScope === undefined ? await currentCompanyId() : companyScope');
    expect(superadminService).toContain('if (companyId) query = query.eq');
    expect(app).toContain('const templateScope = undefined');
  });

  it('permite a SAT ver plantillas de su empresa y no convierte undefined en global', () => {
    expect(app).toContain("if (location.pathname === '/app/plantillas') return <SuperadminTemplates />");
    expect(app).toContain("[(isPlatformScope ? 'Propietario DMP' : 'SAT'), 'Plantillas de checks']");
    expect(superadminService).not.toContain('templates(companyId: string | null = null)');
  });

  it('mantiene Superadmin en la empresa operadora sin selector manual', () => {
    expect(app).not.toContain('isPlatformScope ? companyId : undefined');
    expect(app).not.toContain('SuperadminCompanyScope');
    expect(superadminService).toContain('if (companyId) query = query.eq');
  });

  it('encuentra plantillas activas por empresa o global y exige tipo exacto', () => {
    expect(checksService).toContain('async templates(equipmentTypeId?: string | null, companyScope?: string | null)');
    expect(checksService).toContain('company_id.eq.${companyId},company_id.is.null');
    expect(checksService).toContain("query.eq('equipment_type_id', equipmentTypeId)");
    expect(checksService).not.toContain('equipment_type_id.eq.${equipmentTypeId},equipment_type_id.is.null');
    expect(app).toContain('selectedEquipment.equipment_type_id ?? null');
  });

  it('explica equipo sin tipo y no convierte una consulta fallida en sin plantillas', () => {
    expect(app).toContain('El equipo seleccionado no tiene tipo de equipo');
    expect(app).toContain('Plantillas activas visibles');
    expect(app).toContain('No hay plantilla compatible activa');
    expect(app).toContain('<StateBlock loading={loading} error={error} retry={reload} empty={!data.length}>');
  });

  it('impide borrar estructura de plantillas con resultados y pide confirmación', () => {
    expect(superadminService).toContain("supabase.from('check_section_results').select('id').eq('section_id', sectionId).limit(1)");
    expect(superadminService).toContain("supabase.from('check_item_results').select('id').eq('item_id', itemId).limit(1)");
    expect(app).toContain('window.confirm');
  });
});
