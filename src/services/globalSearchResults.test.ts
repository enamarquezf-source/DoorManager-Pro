import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ clients: vi.fn(), equipment: vi.fn(), works: vi.fn(), cases: vi.fn() }));
vi.mock('./clientsService', () => ({ clientsService: { list: mocks.clients } }));
vi.mock('./equipmentService', () => ({ equipmentService: { list: mocks.equipment } }));
vi.mock('./workOrdersService', () => ({ workOrdersService: { list: mocks.works } }));
vi.mock('./casesService', () => ({ casesService: { list: mocks.cases } }));
vi.mock('../lib/supabase/client', () => ({ supabase: {} }));
import { searchService } from './searchService';

beforeEach(() => { vi.clearAllMocks(); Object.values(mocks).forEach((mock) => mock.mockResolvedValue([])); });

it('keeps incomplete equipment on its equipment route and includes cases promised by the search field', async () => {
  mocks.equipment.mockResolvedValue([{ id: 'equipment', code: 'EQ-1', equipment_type_id: null }]);
  mocks.cases.mockResolvedValue([{ id: 'case', code: 'EXP-1', title: 'Revisión', clients: { legal_name: 'Cliente' } }]);
  const results = await searchService.global('revisión');
  expect(results.map((row) => [row.kind, row.route])).toEqual([['Equipo', '/app/equipos/equipment'], ['Expediente', '/app/expedientes/case']]);
  expect(mocks.cases).toHaveBeenCalledWith('revisión');
});
