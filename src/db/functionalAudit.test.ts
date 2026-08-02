import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const query = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../services/dashboardService.ts', import.meta.url), 'utf8');
const workOrders = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const clients = readFileSync(new URL('../services/clientsService.ts', import.meta.url), 'utf8');
const sites = readFileSync(new URL('../services/sitesService.ts', import.meta.url), 'utf8');
const equipment = readFileSync(new URL('../services/equipmentService.ts', import.meta.url), 'utf8');
const checks = readFileSync(new URL('../services/checksService.ts', import.meta.url), 'utf8');
const verification = readFileSync(resolve(process.cwd(), 'supabase/verification/verify_sat_roles.sql'), 'utf8');

describe('functional audit coverage', () => {
  it('registra errores Supabase con contexto seguro de operacion y recurso', () => {
    expect(query).toContain('Supabase query error');
    expect(query).toContain('service: safeContext?.service');
    expect(query).toContain('operation: safeContext?.operation');
    expect(query).toContain('resource: safeContext?.resource');
    expect(query).toContain('details: error?.details');
    expect(query).toContain('hint: error?.hint');
  });

  it('usa FK explicitas en consultas con relaciones Supabase sensibles', () => {
    for (const source of [dashboard, workOrders, clients, sites, equipment, checks]) {
      expect(source).not.toMatch(/select\([^`'\n]*(clients|profiles|work_orders|equipment|materials|documents|files)\(/);
    }
    expect(dashboard).toContain('profiles!opportunities_responsible_profile_id_fkey');
    expect(workOrders).toContain('alert_recipients!alert_recipients_alert_id_fkey');
    expect(checks).toContain('check_template_sections!check_template_sections_template_id_fkey');
  });

  it('mantiene SAT y Comercial incompatibles tambien en la interfaz', () => {
    expect(app).toContain('function toggleExclusiveRole');
    expect(app).toContain("role === 'SAT'");
    expect(app).toContain("role === 'Comercial'");
    expect(app).toContain("item !== 'Comercial'");
    expect(app).toContain("item !== 'SAT'");
  });

  it('no deja el fallback de modulos como pantalla de preparacion', () => {
    expect(app).toContain('function OperationalModule');
    expect(app).toContain('loadModuleRows');
    expect(app).not.toContain('Pantalla en preparación');
    expect(app).not.toContain('Módulo en preparación');
  });

  it('incluye SQL de verificacion SAT posterior a la migracion', () => {
    expect(verification).toContain("p.email = 'marta.lopez@dmp-demo.test'");
    expect(verification).toContain('sat_comercial_ok');
    expect(verification).toContain('invalid_sat_comercial_profiles');
    expect(verification).toContain('pg_policies');
  });
});
