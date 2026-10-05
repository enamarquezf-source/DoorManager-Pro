import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: mocks }));
import { alertsService } from './alertsService';

describe('atomic alert service', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('retries the same operation after a lost response without separate table inserts', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    mocks.rpc.mockResolvedValueOnce({ data: { id: 'operation', code: 'AVI-001' }, error: null });
    const payload = { title: 'Prueba' };
    await expect(alertsService.create(payload, [{ role: 'SAT' }], 'operation')).rejects.toThrow('No hay conexión');
    await expect(alertsService.create(payload, [{ role: 'SAT' }], 'operation')).resolves.toMatchObject({ id: 'operation' });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenLastCalledWith('dmp_create_alert_atomic', {
      p_operation_id: 'operation', p_payload: payload, p_recipients: [{ role: 'SAT' }],
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not fall back to nontransactional inserts when the RPC is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(alertsService.create({ title: 'Prueba' }, [{ role: 'SAT' }], 'operation')).rejects.toThrow('no está disponible');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects missing destinations before contacting the server', async () => {
    await expect(alertsService.create({}, [], 'operation')).rejects.toThrow('destinatario');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
