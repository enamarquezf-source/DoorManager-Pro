import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { hasPermission, moduleVisible } from '../auth/rbac';
import { canAccessRoute } from '../auth/permissions';
import { superadminSharedRoutes, matchesRouteOrChild } from '../routing/appRoutes';
const sql = readFileSync(new URL('../../supabase/migrations/160_operational_deletion_and_superadmin.sql', import.meta.url), 'utf8');
const profile = (role: string, extra = {}) => ({ id: 'actor', company_id: 'company-a', active: true, roles: [role], ...extra } as any);
describe('operational deletion and complete superadmin navigation', () => {
 it('parses SQL and every PLpgSQL function', async () => { const parser = await pgQuery(); expect(parser.parse(sql).error).toBeNull(); expect(parser.parsePlpgsql(sql).error).toBeNull(); });
 it.each(['SAT', 'Oficina', 'Gerencia', 'superadmin'])('grants deletion to %s', role => { for (const key of ['alerts.delete', 'vehicles.delete', 'documents.delete']) expect(hasPermission(profile(role), key)).toBe(true); });
 it.each(['Tecnico', 'Comercial'])('does not grant deletion to %s', role => { for (const key of ['alerts.delete', 'vehicles.delete', 'documents.delete']) expect(hasPermission(profile(role), key)).toBe(false); });
 it('honors explicit revocations and inactive accounts', () => { expect(hasPermission(profile('SAT', { permission_grants: ['-alerts.delete'] }), 'alerts.delete')).toBe(false); expect(hasPermission(profile('superadmin', { active: false }), 'alerts.delete')).toBe(false); });
 it('keeps a superadmin functional even with hidden modules and negative grants', () => { const admin=profile('superadmin', { hidden_modules: ['documents', 'billing'], permission_grants: ['-documents.delete'] }); expect(moduleVisible(admin,'documents')).toBe(true); expect(hasPermission(admin,'documents.delete')).toBe(true); for(const route of ['/app/avisos','/app/documentos','/app/modulos/vehiculos','/app/modulos/prl','/app/modulos/facturacion','/app/modulos/proveedores']) { expect(canAccessRoute(admin,route)).toBe(true); expect(superadminSharedRoutes.some(shared=>matchesRouteOrChild(route,shared))).toBe(true); } });
 it('locks the authorized tenant row, retains attachments, and records deletion atomically', () => { expect(sql).toContain('t.company_id=$2 or public.is_platform_superadmin()'); expect(sql).toContain('for update'); expect(sql).toContain('if v_old->>\'deleted_at\' is not null then return'); expect(sql).toContain('insert into public.audit_log'); expect(sql).not.toContain('delete from public.documents'); expect(sql).toContain('where alert_id=p_id and company_id=v_company'); });
});
