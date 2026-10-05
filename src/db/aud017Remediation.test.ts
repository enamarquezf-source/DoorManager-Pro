import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canAccessRoute } from '../auth/permissions';
import { billingActionVisibility, billingDeepLink } from '../modules/BillingModule';
import { isSupportedAlertRoute, routeForAlert } from '../routing/alertRoutes';
import { moduleMeta, moduleRegistry } from '../routing/moduleCatalog';

const profile = (roles: string[], permission_grants: string[] = []) => ({ id: 'profile', auth_user_id: 'auth', company_id: 'company', active: true, deleted_at: null, roles, permission_grants, visible_modules: [] } as any);
const treasuryForms = readFileSync(new URL('../modules/TreasuryForms.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('AUD-017 remediation contracts', () => {
  it('guards published module deep links by catalog permission and visibility', () => {
    expect(canAccessRoute(profile(['Oficina']), '/app/modulos/facturas-proveedor')).toBe(true);
    expect(canAccessRoute(profile(['Comercial']), '/app/modulos/facturas-proveedor')).toBe(false);
    expect(canAccessRoute(profile(['Oficina'], ['-supplier_invoices.read']), '/app/modulos/facturas-proveedor')).toBe(false);
    expect(moduleMeta['facturas-proveedor'].permission).toEqual(['supplier_invoices.read']);
    expect(moduleRegistry['facturas-proveedor']).toMatchObject({ moduleId: 'facturas-proveedor', route: '/app/modulos/facturas-proveedor', renderer: 'facturas-proveedor' });
  });

  it('keeps every published module on the canonical renderer registry', () => {
    const definitions = Object.values(moduleRegistry);
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.every((definition) => definition.renderer.length > 0)).toBe(true);
    expect(moduleRegistry['facturas-proveedor'].renderer).toBe('facturas-proveedor');
    expect(moduleRegistry.facturacion.renderer).toBe('facturacion');
    expect(moduleRegistry.cobros.renderer).toBe('cobros');
    expect(moduleRegistry.tesoreria.renderer).toBe('tesoreria');
    expect(appSource).toContain('const moduleRenderers: Record<string, ModuleRenderer>');
    const modulePage = appSource.slice(appSource.indexOf('function ModulePage()'), appSource.indexOf('function ModuleNotFound()'));
    expect(modulePage).not.toContain('moduleId ===');
    expect(appSource).toContain('if (!definition) return <ModuleNotFound />;');
  });

  it('maps supported alert entities and exposes unsupported entities safely', () => {
    expect(routeForAlert({ related_entity: 'invoices', related_id: 'inv/1' })).toBe('/app/modulos/facturacion?invoice=inv%2F1');
    expect(isSupportedAlertRoute({ related_entity: 'documents', related_id: 'doc-1' })).toBe(true);
    expect(routeForAlert({ related_entity: 'unknown', related_id: 'x' })).toBe('/app/avisos?entidad-no-soportada=unknown');
    expect(isSupportedAlertRoute({ related_entity: 'unknown', related_id: 'x' })).toBe(false);
  });

  it('separates billing read access from write actions', () => {
    const readOnly = profile(['SAT'], ['billing.read']);
    const writer = profile(['SAT'], ['billing.read', 'billing.write', 'treasury.transactions.create', 'treasury.transactions.reverse']);
    expect(billingActionVisibility(readOnly)).toEqual({ canWrite: false, canRecordPayment: false, canReversePayment: false });
    expect(billingActionVisibility(writer)).toEqual({ canWrite: true, canRecordPayment: true, canReversePayment: true });
  });

  it('parses economic deep links without accepting an absent identifier', () => {
    expect(billingDeepLink(new URLSearchParams('invoice=inv-1&payment=pay-1'))).toEqual({ invoiceId: 'inv-1', paymentId: 'pay-1' });
    expect(billingDeepLink(new URLSearchParams())).toEqual({ invoiceId: null, paymentId: null });
  });

  it('locks all critical treasury submissions and restores the lock on failure', () => {
    expect((treasuryForms.match(/if \(saving\) return/g) ?? []).length).toBe(3);
    expect((treasuryForms.match(/finally \{ setSaving\(false\); \}/g) ?? []).length).toBe(3);
    expect((treasuryForms.match(/disabled=\{saving(?: \|\| [^}]+)?\}/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
