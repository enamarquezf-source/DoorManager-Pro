import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ assigned: true, limits: [] as number[] }));
vi.mock('../lib/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } } }) },
  from: (table: string) => {
    let limit: number | undefined;
    const query: any = {
      select: () => query, eq: () => query, in: () => query, is: () => query,
      limit: (value: number) => { limit = value; state.limits.push(value); return query; },
      maybeSingle: async () => table === 'checks'
        ? { data: { id: 'check', technician_id: null, work_order_id: 'work' }, error: null }
        : state.assigned
          ? limit === 1 ? { data: { id: 'assignment' }, error: null } : { data: null, error: { message: 'Multiple rows returned' } }
          : { data: null, error: null },
    };
    return query;
  },
} }));
vi.mock('./query', async (importOriginal) => ({ ...(await importOriginal<any>()), currentProfileId: async () => 'technician' }));
import { checksService } from './checksService';

afterEach(() => { vi.restoreAllMocks(); state.assigned = true; state.limits = []; });

it('allows an assigned technician even when assignment history contains multiple rows', async () => {
  const detail = vi.spyOn(checksService, 'get').mockResolvedValue({ id: 'check', status: 'Por realizar' });
  await expect(checksService.getTechnicianAssigned('check')).resolves.toEqual({ id: 'check', status: 'Por realizar' });
  expect(state.limits).toEqual([1]);
  expect(detail).toHaveBeenCalledWith('check');
});

it('still refuses a technician without a matching assignment', async () => {
  state.assigned = false;
  const detail = vi.spyOn(checksService, 'get');
  await expect(checksService.getTechnicianAssigned('check')).rejects.toThrow('No tienes permiso');
  expect(detail).not.toHaveBeenCalled();
});
