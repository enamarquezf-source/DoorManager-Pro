import { describe, expect, it, vi } from 'vitest';

describe('dashboardService SAT queries', () => {
  it('usa la FK explicita del tecnico en work_order_assignments', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
    const { satDashboardAssignmentsSelect } = await import('./dashboardService');

    expect(satDashboardAssignmentsSelect).toContain('profiles!work_order_assignments_technician_id_fkey(first_name,last_name)');
    expect(satDashboardAssignmentsSelect).not.toContain('profiles(first_name,last_name)');
  });
});
