import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessRoute, canViewInternalEconomics } from '../auth/permissions';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../services/entityLifecycleService.ts', import.meta.url), 'utf8');

const superadminProfile: any = { id: 'sa', company_id: 'c1', active: true, primary_area: 'superadmin', roles: ['superadmin'] };
const technicianProfile: any = { id: 'tech', company_id: 'c1', active: true, primary_area: 'Tecnico', roles: ['Tecnico'] };

describe('UI sanitization, responsive layout and permissions', () => {
  it('prevents character-by-character wrapping in normal UI text', () => {
    expect(css).not.toContain('p, h1, h2, h3, strong, span, small, dd, dt, button { overflow-wrap: anywhere; }');
    expect(css).not.toContain('.compact-list p, .compact-list small { overflow-wrap: anywhere; }');
    expect(css).not.toContain('.badge { white-space: normal; line-height: 1.2; overflow-wrap: anywhere; }');
    expect(css).not.toContain('word-break: break-all');
    expect(css).toContain('overflow-wrap: break-word; word-break: normal;');
  });

  it('keeps technical closeout time rows legible and role-aware', () => {
    expect(css).toContain('.work-time-list article { grid-template-columns: minmax(96px, max-content) minmax(220px, 1fr) minmax(180px, auto);');
    expect(css).toContain('.work-time-list .time-meta');
    expect(css).toContain('.work-time-list .time-money');
    expect(app).toContain('className="time-meta"');
    expect(app).toContain('className="time-money"');
    expect(app).toContain('showCosts && <p className="time-money"');
  });

  it('uses responsive stock movement cards instead of narrow columns', () => {
    expect(app).toContain('stock-movements-list');
    expect(app).toContain('stock-movement-main');
    expect(app).toContain('stock-movement-qty');
    expect(css).toContain('.stock-movements-list article { grid-template-columns: minmax(170px, 1fr) minmax(110px, auto);');
    expect(css).toContain('.stock-movement-qty strong { white-space: nowrap; }');
    expect(css).toContain('.work-time-list article, .stock-movements-list article { grid-template-columns: minmax(0, 1fr);');
  });

  it('keeps modals inside the viewport with internal scrolling', () => {
    expect(css).toContain('.mini-modal { position: fixed; inset: 0;');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('width: min(640px, calc(100vw - 24px));');
    expect(css).toContain('max-height: min(92dvh, calc(100dvh - 24px));');
    expect(css).toContain('.modal-footer { position: sticky;');
  });

  it('removes known development notes while preserving valid business labels', () => {
    for (const text of ['public.clients', 'No hay integración de email real activa', 'migracion pendiente', 'RPC segura', 'IndexedDB', 'No se muestran contadores globales inventados']) {
      expect(app).not.toContain(text);
    }
    expect(app).toContain('Pendiente facturar');
    expect(app).toContain('Finalizar prepara el parte para facturación, pero no vuelve a descontar stock.');
    expect(app).toContain('No hay plantilla compatible activa.');
  });

  it('allows superadmin to open shared company routes and keeps technician restricted', () => {
    for (const route of ['/app/clientes', '/app/centros', '/app/equipos', '/app/partes/wo1', '/app/checks/ch1', '/app/modulos/materiales', '/app/modulos/tarifas-horas']) {
      expect(canAccessRoute(superadminProfile, route)).toBe(true);
    }
    expect(canAccessRoute(technicianProfile, '/app/modulos/rentabilidad')).toBe(false);
    expect(canAccessRoute(technicianProfile, '/app/tecnico')).toBe(true);
    expect(canViewInternalEconomics(technicianProfile)).toBe(false);
  });

  it('removes manual company selection from superadmin UI', () => {
    expect(app).not.toContain('SuperadminCompanyScope');
    expect(app).not.toContain('useSuperadminScope');
    expect(app).not.toContain('dmp-superadmin-company-scope');
    expect(app).not.toContain('Empresa seleccionada');
    expect(app).not.toContain('Selecciona una empresa');
    expect(app).toContain('Datos de empresa');
    expect(app).toContain('superadminService.operatingCompany()');
  });

  it('keeps lifecycle actions coherent and preserves historical records', () => {
    expect(lifecycle).toContain("export type LifecycleEntity = 'clients' | 'sites' | 'equipment' | 'equipment_components' | 'cases' | 'work_orders' | 'checks' | 'check_templates' | 'profiles' | 'quotes' | 'materials' | 'documents' | 'alerts' | 'opportunities'");
    expect(lifecycle).toContain('dmp_archive_entity');
    expect(lifecycle).toContain('dmp_restore_entity');
    expect(lifecycle).toContain('dmp_permanently_delete_entity');
    expect(app).toContain('Archivar/desactivar');
    expect(app).toContain('conserva el historial');
    expect(app).toContain('ELIMINAR ${target.code}');
  });

  it('keeps pending synchronization actions without development wording', () => {
    expect(app).toContain('Reintentar seleccionados');
    expect(app).toContain('Borrar seleccionados');
    expect(app).toContain('Borrar fallidos');
    expect(app).toContain('Eliminar de este dispositivo');
    expect(app).toContain('Cambios guardados en este dispositivo pendientes de enviar.');
    expect(app).not.toContain('No se enviarán a Supabase');
  });
});
