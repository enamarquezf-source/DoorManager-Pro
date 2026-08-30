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

  it('registra horas sin descripcion cuando el campo llega vacio, nulo u omitido', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const base = { work_order_id: 'wo-1', profile_id: 'worker-1', work_date: '2026-08-10', duration_minutes: 60, hour_type: 'normal' };

    await expect(workOrdersService.upsertTimeEntry({ ...base, description: '' })).resolves.toBe('saved-id');
    await expect(workOrdersService.upsertTimeEntry({ ...base, description: null })).resolves.toBe('saved-id');
    await expect(workOrdersService.upsertTimeEntry(base)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenNthCalledWith(1, 'dmp_upsert_work_order_time_entry', { p_payload: { ...base, description: '' } });
    expect(rpc).toHaveBeenNthCalledWith(2, 'dmp_upsert_work_order_time_entry', { p_payload: { ...base, description: null } });
    expect(rpc).toHaveBeenNthCalledWith(3, 'dmp_upsert_work_order_time_entry', { p_payload: base });
  });

  it('carga trabajadores validos de horas por RPC segura', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    rpc.mockResolvedValueOnce({ data: [{ profile_id: 'worker-1', full_name: 'Ana Tecnica' }], error: null });

    await expect(workOrdersService.timeWorkerOptions('wo-1')).resolves.toHaveLength(1);

    expect(rpc).toHaveBeenCalledWith('dmp_work_order_time_worker_options', { p_work_order_id: 'wo-1' });
  });

  it('registra materiales mediante la RPC pendiente con un payload unico', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { work_order_id: 'wo-1', material_id: 'mat-1', description: '', quantity: 2, unit: 'ud', used_at: '2026-08-10', notes: 'Sustituidas' };

    await expect(workOrdersService.upsertMaterial(payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_submit_work_order_material', { p_payload: payload });
    expect(from).not.toHaveBeenCalledWith('work_order_materials');
  });

  it('registra recursos y costes mediante la RPC segura 027', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { work_order_id: 'wo-1', cost_type: 'desplazamiento', description: 'Desplazamiento urbano', quantity: 12, unit: 'km', unit_cost: 0.42, incurred_at: '2026-08-10' };

    await expect(workOrdersService.upsertCostEntry(payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_upsert_work_order_cost_entry', { p_payload: { work_order_id: 'wo-1', cost_type: 'desplazamiento', description: 'Desplazamiento urbano', quantity: 12, unit: 'km', incurred_at: '2026-08-10' } });
    expect(from).not.toHaveBeenCalledWith('work_order_cost_entries');
  });

  it('valida el consumo mediante RPC administrativa idempotente', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.validateMaterialStock('usage-1')).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_validate_work_order_material', { p_work_order_material_id: 'usage-1' });
  });

  it('abre stock inicial mediante la RPC administrativa', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.openInitialWarehouseStock('warehouse-1', 'material-1', 3, 'Apertura inicial')).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_set_initial_warehouse_stock', { p_warehouse_id: 'warehouse-1', p_material_id: 'material-1', p_quantity: 3, p_reason: 'Apertura inicial' });
  });

  it('guarda la decisión económica de garantía mediante una RPC única', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.setWarrantyBillingDecision('wo-1', 'planned_material', 'line-1', 'facturable')).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_set_work_order_billing_decision', { p_work_order_id: 'wo-1', p_concept_type: 'planned_material', p_concept_id: 'line-1', p_billing_decision: 'facturable' });
  });

  it('borra recursos y costes por RPC de borrado logico 027', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.deleteCostEntry('cost-1', 'Duplicado')).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_delete_work_order_cost_entry', { p_cost_entry_id: 'cost-1', p_reason: 'Duplicado' });
    expect(from).not.toHaveBeenCalledWith('work_order_cost_entries');
  });

  it('corrige campos operativos de parte mediante RPC auditada 028', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { diagnosis: 'Guía desajustada', work_performed: 'Ajuste y prueba', result: 'Operativa', planned_material: '', client_id: 'no-debe-enviarse' };

    await expect(workOrdersService.updateOperationalFields('wo-1', payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_update_work_order_operational_fields', { p_work_order_id: 'wo-1', p_payload: { diagnosis: 'Guía desajustada', work_performed: 'Ajuste y prueba', result: 'Operativa', planned_material: '' } });
    expect(from).not.toHaveBeenCalledWith('work_orders');
  });

  it('envia el payload operativo completo con la firma RPC esperada', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const payload = { description: 'Problema corregido', diagnosis: 'Diagnostico SAT', work_performed: 'Trabajo revisado', result: 'Operativa', planned_material: 'Bisagra', observations: 'no-debe-salir', status: 'Cerrado' };

    await expect(workOrdersService.updateOperationalFields('wo-1', payload)).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_update_work_order_operational_fields', { p_work_order_id: 'wo-1', p_payload: { description: 'Problema corregido', diagnosis: 'Diagnostico SAT', work_performed: 'Trabajo revisado', result: 'Operativa', planned_material: 'Bisagra', observations: 'no-debe-salir' } });
    expect(from).not.toHaveBeenCalledWith('work_orders');
  });

  it('puede corregir un unico campo operativo sin borrar los demas del payload', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.updateOperationalFields('wo-1', { diagnosis: 'radar mal orientado' })).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_update_work_order_operational_fields', { p_work_order_id: 'wo-1', p_payload: { diagnosis: 'radar mal orientado' } });
  });

  it('no envia undefined y conserva strings vacios como borrado explicito', async () => {
    const { workOrdersService } = await import('./workOrdersService');

    await expect(workOrdersService.updateOperationalFields('wo-1', { description: '', diagnosis: undefined, planned_material: 'Radar' })).resolves.toBe('saved-id');

    expect(rpc).toHaveBeenCalledWith('dmp_update_work_order_operational_fields', { p_work_order_id: 'wo-1', p_payload: { description: '', planned_material: 'Radar' } });
  });

  it('conserva message details hint y code cuando falla la RPC operativa', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    const error = { message: 'new row for relation "audit_log" violates check constraint "audit_log_operation_check"', details: 'Failing row contains OPERATIONAL_UPDATE', hint: 'Revise el constraint', code: '23514', name: 'PostgrestError' };
    rpc.mockResolvedValueOnce({ data: null, error });

    await expect(workOrdersService.updateOperationalFields('wo-1', { observations: 'Actualizada' })).rejects.toMatchObject({ message: expect.stringContaining('Corregir campos operativos del parte'), details: error.details, hint: error.hint, code: error.code, name: 'SupabaseOperationError' });
  });

  it('propaga errores concretos de permiso/asignacion de Supabase', async () => {
    const { workOrdersService } = await import('./workOrdersService');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'respuesta de Supabase: asignacion: tecnico sin asignacion activa para este parte operativo' } });

    await expect(workOrdersService.upsertTimeEntry({ work_order_id: 'wo-2', duration_minutes: 30, description: 'Intento' })).rejects.toThrow('asignacion: tecnico sin asignacion activa');
  });
});
