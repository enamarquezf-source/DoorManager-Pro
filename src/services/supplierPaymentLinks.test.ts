import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: mocks }));
import { supplierPaymentsService } from './supplierPaymentsService';

function query(data: any, error: any = null) {
  const chain: any = { then: (resolve: any) => Promise.resolve({ data, error }).then(resolve) };
  for (const method of ['select', 'eq', 'order', 'in']) chain[method] = vi.fn(() => chain);
  return chain;
}

describe('supplier payment treasury evidence', () => {
  beforeEach(() => vi.clearAllMocks());
  it('distinguishes a verified link from a verified missing link', async () => {
    const payments = query([{ id: 'linked' }, { id: 'historical' }]);
    const transactions = query([{ id: 'movement', source_id: 'linked' }]);
    mocks.from.mockReturnValueOnce(payments).mockReturnValueOnce(transactions);
    expect(await supplierPaymentsService.list('invoice', true)).toEqual([
      { id: 'linked', treasury_transaction_id: 'movement' },
      { id: 'historical', treasury_transaction_id: null },
    ]);
    expect(transactions.eq).toHaveBeenCalledWith('source_type', 'supplier_payment');
    expect(transactions.in).toHaveBeenCalledWith('source_id', ['linked', 'historical']);
  });
  it('does not infer missing treasury links for viewers without treasury access', async () => {
    mocks.from.mockReturnValue(query([{ id: 'payment' }]));
    expect(await supplierPaymentsService.list('invoice')).toEqual([{ id: 'payment' }]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('surfaces failed treasury verification instead of marking payments as unlinked', async () => {
    mocks.from.mockReturnValueOnce(query([{ id: 'payment' }])).mockReturnValueOnce(query(null, { message: 'Failed to fetch' }));
    await expect(supplierPaymentsService.list('invoice', true)).rejects.toThrow('No hay conexión');
  });
  it('skips treasury lookup when there are no payments', async () => {
    mocks.from.mockReturnValue(query([]));
    expect(await supplierPaymentsService.list('invoice', true)).toEqual([]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
