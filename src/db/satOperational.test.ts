import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const dashboardService = readFileSync(new URL('../services/dashboardService.ts', import.meta.url), 'utf8');
const profilesService = readFileSync(new URL('../services/profilesService.ts', import.meta.url), 'utf8');
const alertsService = readFileSync(new URL('../services/alertsService.ts', import.meta.url), 'utf8');
const assignmentMigration = readFileSync(new URL('../../supabase/migrations/003_case_auto_codes.sql', import.meta.url), 'utf8');

describe('SAT operational workspace', () => {
  it('mantiene SAT como coordinador único sin dividirlo en técnico/comercial', () => {
    expect(app).toContain("const sat = [{ id: 'inicio'");
    expect(app).toContain("{ id: 'tecnicos', label: 'Técnicos'");
    expect(app).toContain("{ id: 'plantillas', label: 'Plantillas'");
    expect(app).not.toContain("{ id: 'trabajos', label: 'Trabajos'");
    expect(app).not.toContain("const sat = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'planificacion', label: 'Planificación', path: '/app/modulos/planificacion', icon: CalendarClock }, { id: 'trabajos'");
  });

  it('expone rutas SAT reales para planificación, técnicos y plantillas', () => {
    expect(app).toContain("if (moduleId === 'planificacion') return <PlanningModule />");
    expect(app).toContain("function PlanningModule()");
    expect(app).toContain("if (location.pathname === '/app/plantillas') return <SuperadminTemplates />");
    expect(permissions).toContain("if (path.startsWith('/app/plantillas')) return hasAny(profile, ['SAT', 'Gerencia'])");
  });

  it('usa datos reales y filtros navegables en el inicio SAT', () => {
    expect(app).toContain("dashboardService.getSatDashboardData()");
    expect(app).toContain("kpiCard('Partes finalizados'");
    expect(app).toContain("'/app/modulos/tecnicos'");
    expect(app).toContain("'/app/partes?filtro=material'");
    expect(app).toContain("'/app/partes?filtro=no-terminados'");
    expect(dashboardService).toContain("supabase.from('v_work_order_full_detail')");
    expect(dashboardService).toContain("technicians: technicians.filter");
  });

  it('limita técnicos, destinatarios y asignaciones a empresa y perfiles activos', () => {
    expect(profilesService).toContain(".eq('active', true).is('deleted_at', null)");
    expect(assignmentMigration).toContain('p.company_id = v_company_id');
    expect(assignmentMigration).toContain("r.name = 'Tecnico'");
    expect(assignmentMigration).toContain('p.active = true');
    expect(assignmentMigration).toContain('p.deleted_at is null');
  });

  it('no ignora errores al crear destinatarios de avisos', () => {
    expect(alertsService).toContain('alert_recipients');
    expect(alertsService).toContain('await expectData<any[]>');
    expect(app).toContain('runAlertAction');
  });
});
