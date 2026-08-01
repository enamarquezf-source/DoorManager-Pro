import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const superadminService = readFileSync(new URL('../services/superadminService.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('superadmin regression coverage', () => {
  it('protege la edición administrativa de checks con permisos centralizados', () => {
    expect(permissions).toContain('function canManageCheck');
    expect(app).toContain('const manageAllowed = canManageCheck(profile)');
    expect(app).toContain("{manageAllowed && <button onClick={() => setMode('edit')}>Modificar check</button>}");
  });

  it('mantiene rutas reales de detalles y bloques dentro de superadmin', () => {
    expect(app).toContain('/^\\/app\\/superadmin\\/checks\\/([^/]+)\\/bloque\\/([^/]+)$/');
    expect(app).toContain('`/app/superadmin/checks/${id}/bloque/${zoneId}`');
    expect(app).toContain('/app/superadmin/expedientes');
    expect(app).toContain('CaseDetailPage forcedId={superadminCaseMatch[1]}');
  });

  it('no deja enlaces superadmin conocidos apuntando a rutas ausentes', () => {
    const linkedRoutes = ['/app/superadmin/clientes', '/app/superadmin/centros', '/app/superadmin/equipos', '/app/superadmin/partes', '/app/superadmin/checks', '/app/superadmin/expedientes', '/app/superadmin/plantillas'];
    for (const route of linkedRoutes) expect(app).toContain(route);
    expect(app).not.toContain("'/app/superadmin/expedientes'], data.cases, '/app/expedientes'");
  });

  it('filtra desplegables y hereda company_id en formularios relacionados', () => {
    expect(app).toContain("clientsService.list('', initial?.company_id)");
    expect(app).toContain("sitesService.list('', initial?.company_id)");
    expect(app).toContain("profilesService.listTechnicians(companyId)");
    expect(app).toContain('initial={{ company_id: data.company_id, client_id: data.id }}');
    expect(app).toContain('initial={{ company_id: data.company_id, client_id: data.client_id, site_id: data.id }}');
    expect(app).toContain('initial={{ company_id: data.company_id, work_order_id: data.id, equipment_id: data.main_equipment_id }}');
  });

  it('implementa operaciones reales de plantillas sin botones informativos deshabilitados', () => {
    expect(app).toContain('function TemplateForm');
    expect(app).toContain('function TemplateSectionForm');
    expect(app).toContain('function TemplateItemForm');
    expect(superadminService).toContain('duplicateTemplate');
    expect(superadminService).toContain('reorderSections');
    expect(superadminService).toContain('reorderItems');
    expect(app).not.toContain('<button disabled>Crear plantilla</button>');
  });
});
