import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const eq = vi.fn();
const order = vi.fn();
const select = vi.fn();

vi.mock('../lib/supabase/client', () => ({ supabase: { rpc, from } }));

describe('assignmentsService', () => {
  beforeEach(() => {
    rpc.mockReset(); from.mockReset(); eq.mockReset(); order.mockReset(); select.mockReset();
    rpc.mockResolvedValue({ data: 'profile-1', error: null });
    order.mockImplementationOnce(() => ({ order })).mockImplementationOnce(() => Promise.resolve({ data: [{ work_order_id: 'wo-1' }], error: null }));
    eq.mockReturnValue({ order });
    select.mockReturnValue({ eq });
    from.mockReturnValue({ select });
  });

  it('assignedActiveWork devuelve todas las filas activas sin aplicar filtro de fecha', async () => {
    const { assignmentsService } = await import('./assignmentsService');

    await expect(assignmentsService.assignedActiveWork()).resolves.toEqual([{ work_order_id: 'wo-1' }]);

    expect(from).toHaveBeenCalledWith('v_technician_daily_schedule');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('technician_id', 'profile-1');
    expect(order).toHaveBeenCalledWith('assignment_date', { ascending: true });
  });
});
