import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabase/client', () => ({
  supabase: { rpc, from },
}));

describe('workOrdersService operational RPCs', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: 'saved-id', error: null });
  });

  it('registra horas mediante la RPC segura 024', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { work_order_id: 'wo-1', profile_id: 'worker-1', started_at: '08:00', ended_at: '10:00', break_minutes: 15, hour_type: 'normal', description: 'Ajuste de puerta' };

    await expect(workOrdersService.upsertTimeEntry(payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_upsert_work_order_time_entry', { p_payload: payload });
    expect(from).not.toHaveBeenCalledWith('work_order_time_entries');
  });

  it('carga trabajadores validos de horas por RPC segura', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    rpc.mockResolvedValueOnce({ data: [{ profile_id: 'worker-1', full_name: 'Ana Tecnica' }], error: null });

    await expect(workOrdersService.timeWorkerOptions('wo-1')).resolves.toHaveLength(1);

    expect(rpc).toHaveBeenCalledWith('dmp_work_order_time_worker_options', { p_work_order_id: 'wo-1' });
  });

  it('registra materiales mediante la RPC segura 024 con un payload unico', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { work_order_id: 'wo-1', material_id: 'mat-1', description: '', quantity: 2, unit: 'ud', used_at: '2026-08-10', notes: 'Sustituidas' };

    await expect(workOrdersService.upsertMaterial(payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_upsert_work_order_material', { p_payload: payload });
    expect(from).not.toHaveBeenCalledWith('work_order_materials');
  });

  it('registra recursos y costes mediante la RPC segura 027', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { work_order_id: 'wo-1', cost_type: 'desplazamiento', description: 'Desplazamiento urbano', quantity: 12, unit: 'km', unit_cost: 0.42, incurred_at: '2026-08-10' };

    await expect(workOrdersService.upsertCostEntry(payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_upsert_work_order_cost_entry', { p_payload: payload });
    expect(from).not.toHaveBeenCalledWith('work_order_cost_entries');
  });

  it('borra recursos y costes por RPC de borrado logico 027', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.deleteCostEntry('cost-1', 'Duplicado')).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_delete_work_order_cost_entry', { p_cost_entry_id: 'cost-1', p_reason: 'Duplicado' });
    expect(from).not.toHaveBeenCalledWith('work_order_cost_entries');
  });

  it('propaga errores concretos de permiso/asignacion de Supabase', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'respuesta de Supabase: asignacion: tecnico sin asignacion activa para este parte operativo' } });

    await expect(workOrdersService.upsertTimeEntry({ work_order_id: 'wo-2', duration_minutes: 30, description: 'Intento' })).rejects.toThrow('asignacion: tecnico sin asignacion activa');
  });
});
