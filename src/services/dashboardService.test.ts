import { describe, expect, it, vi } from 'vitest';

describe('dashboardService SAT queries', () => {
  it('usa la FK explicita del tecnico en work_order_assignments', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
    const { satDashboardAssignmentsSelect } = await import('./dashboardService');

    expect(satDashboardAssignmentsSelect).toContain('profiles!work_order_assignments_technician_id_fkey(first_name,last_name)');
    expect(satDashboardAssignmentsSelect).not.toContain('profiles(first_name,last_name)');
  });

  it('identifica individualmente cada consulta del inicio SAT', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./dashboardService.ts', import.meta.url), 'utf8'));

    for (const operation of ['Inicio SAT / partes', 'Inicio SAT / asignaciones', 'Inicio SAT / tecnicos', 'Inicio SAT / checks pendientes', 'Inicio SAT / checks realizados', 'Inicio SAT / deficiencias', 'Inicio SAT / avisos', 'Inicio SAT / materiales']) {
      expect(source).toContain(operation);
    }
    expect(source).toContain('clients!deficiencies_client_id_fkey');
    expect(source).toContain('work_orders!deficiencies_work_order_id_fkey');
    expect(source).toContain('materials!work_order_materials_material_id_fkey');
  });
});
