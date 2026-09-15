import { beforeEach, describe, expect, it, vi } from 'vitest';

const materialId = '11111111-1111-4111-8111-111111111111';
const relationId = '22222222-2222-4222-8222-222222222222';
const supplierId = '33333333-3333-4333-8333-333333333333';
const row = {
  id: relationId,
  company_id: 'company-1',
  material_id: materialId,
  supplier_id: supplierId,
  supplier_reference: null,
  purchase_unit_price: null,
  is_preferred: false,
  active: true,
  suppliers: { id: supplierId, name: 'Soluciones automáticas', tax_id: null, active: true },
};

let database: typeof row;
const requests: { operation: string; payload?: Record<string, any> }[] = [];

function queryBuilder() {
  let singleMode = false;
  let maybeMode = false;
  const builder: any = {
    select: vi.fn((columns: string) => { requests.push({ operation: 'select', payload: { columns } }); return builder; }),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn((payload: Record<string, any>) => {
      requests.push({ operation: 'insert', payload });
      database = { ...database, ...payload, id: relationId, suppliers: row.suppliers };
      return builder;
    }),
    update: vi.fn((payload: Record<string, any>) => {
      requests.push({ operation: 'update', payload });
      database = { ...database, ...payload };
      return builder;
    }),
    single: vi.fn(() => { singleMode = true; return builder; }),
    maybeSingle: vi.fn(() => { maybeMode = true; return builder; }),
    then: (resolve: (value: any) => any) => Promise.resolve({ data: maybeMode ? null : singleMode ? { ...database } : [{ ...database }], error: null }).then(resolve),
  };
  return builder;
}

const from = vi.fn(() => queryBuilder());

vi.mock('../lib/supabase/client', () => ({ supabase: { from } }));
vi.mock('./query', () => ({
  currentCompanyId: vi.fn().mockResolvedValue('company-1'),
  contains: vi.fn(),
  expectData: vi.fn(async (request: Promise<any>) => {
    const result = await request;
    if (result.error) throw result.error;
    return result.data;
  }),
}));

describe('material supplier price persistence', () => {
  beforeEach(() => {
    database = { ...row };
    requests.length = 0;
    from.mockClear();
  });

  it('keeps 250 through preferred save, clean refetch, and rendered value', async () => {
    const { suppliersService } = await import('./suppliersService');

    const firstResponse = await suppliersService.addMaterialSupplier(materialId, {
      supplier_id: supplierId,
      supplier_reference: '',
      purchase_unit_price: '250,00'.replace(',', '.'),
      is_preferred: false,
    });
    expect(firstResponse.purchase_unit_price).toBe(250);

    await suppliersService.setPreferredMaterialSupplier(relationId, materialId);
    const refetched = await suppliersService.listMaterialSuppliers(materialId);
    const renderedPrice = refetched[0].purchase_unit_price == null
      ? 'Sin precio'
      : `${Number(refetched[0].purchase_unit_price).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

    expect(requests[1]).toEqual({ operation: 'insert', payload: expect.objectContaining({ purchase_unit_price: 250, is_preferred: false }) });
    expect(requests[3]).toEqual({ operation: 'update', payload: { is_preferred: false, updated_at: expect.any(String) } });
    expect(requests[4]).toEqual({ operation: 'update', payload: { is_preferred: true, active: true, updated_at: expect.any(String) } });
    expect(requests[6]).toEqual({ operation: 'select', payload: { columns: expect.stringContaining('purchase_unit_price') } });
    expect(refetched[0].purchase_unit_price).toBe(250);
    expect(renderedPrice).toBe('250,00 €');
  });

  it('preserves 250 when editing only preferred state on an existing relation', async () => {
    const { suppliersService } = await import('./suppliersService');
    database = { ...database, purchase_unit_price: 250 };

    await suppliersService.setPreferredMaterialSupplier(relationId, materialId);
    const refetched = await suppliersService.listMaterialSuppliers(materialId);

    expect(refetched[0].purchase_unit_price).toBe(250);
    expect(requests[1].payload).not.toHaveProperty('purchase_unit_price');
  });
});
