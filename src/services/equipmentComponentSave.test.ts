import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ result: { data: null as any, error: null } }));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: (table: string) => {
  const query: any = {
    select: () => query, eq: () => query, insert: () => query, update: () => query,
    single: async () => ({ data: { company_id: 'company' }, error: null }),
    maybeSingle: async () => state.result,
  };
  return query;
} } }));
import { equipmentService } from './equipmentService';

beforeEach(() => { state.result = { data: null, error: null }; });

it('does not report an inserted component as saved when no record is returned', async () => {
  await expect(equipmentService.addComponent('equipment', { component_type: 'Motor' })).rejects.toThrow('No se ha podido confirmar');
});

it('does not report an update filtered by permissions as saved', async () => {
  await expect(equipmentService.updateComponent('component', { notes: 'Revisión' })).rejects.toThrow('No se ha podido confirmar');
});

it('returns the confirmed component after saving', async () => {
  state.result.data = { id: 'component', component_type: 'Motor' };
  await expect(equipmentService.addComponent('equipment', { component_type: 'Motor' })).resolves.toEqual(state.result.data);
  await expect(equipmentService.updateComponent('component', { notes: 'Revisión' })).resolves.toEqual(state.result.data);
});
