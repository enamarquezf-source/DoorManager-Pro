import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const economicService = readFileSync(new URL('../services/economicService.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('management economic dashboard', () => {
  it('loads real economic sources instead of mock metrics', () => {
    expect(economicService).toContain("supabase.from('v_work_order_economic_summary')");
    expect(economicService).toContain("supabase.from('v_client_economic_summary')");
    expect(economicService).toContain("supabase.from('quotes')");
    expect(app).toContain('Panel de control económico');
    expect(app).toContain('Coste real de trabajos');
    expect(app).toContain('Desglose de costes');
    expect(app).toContain('Clientes más rentables');
    expect(app).toContain('Trabajos con margen negativo');
  });

  it('exposes management filters and client navigation', () => {
    for (const text of ['Mes actual', 'Últimos 3 meses', 'Año actual', 'Rango personalizado', 'Tipo trabajo', 'Estado económico']) expect(app).toContain(text);
    expect(app).toContain('economicDateRange');
    expect(app).toContain('economicInRange');
    expect(app).toContain('/app/clientes/${client.id}');
  });

  it('hides internal economic costs from commercial role', () => {
    expect(permissions).toContain('canViewInternalEconomics');
    expect(permissions).toContain("['superadmin', 'SAT', 'Gerencia', 'Oficina']");
    expect(permissions).not.toContain("canViewWorkOrderCosts(profile: Profile | null | undefined) { return hasAny(profile, ['superadmin', 'SAT', 'Gerencia', 'Oficina', 'Comercial'])");
    expect(app).toContain('Acceso económico restringido');
  });
});
