import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), company: vi.fn(), actor: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('./query', () => ({
  contains: vi.fn(), currentCompanyId: mocks.company, currentProfileId: mocks.actor,
  expectData: async (request: PromiseLike<any>) => { const result = await request; if (result.error) throw result.error; return result.data; },
}));
import { supplierInvoicesService } from './supplierInvoicesService';

beforeEach(() => { vi.clearAllMocks(); mocks.company.mockResolvedValue('company'); mocks.actor.mockResolvedValue('actor'); });
describe('supplier invoice creation recovery', () => {
  it('sends header, lines and receipt allocation together with a stable identifier', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'operation', recovered: false }, error: null });
    const allocation = { purchase_order_line_id: 'order-line', purchase_receipt_line_id: 'receipt-line', allocated_quantity: 4 };
    await supplierInvoicesService.createDraftAtomic({ operation_id: 'operation', supplier_id: 'supplier', invoice_date: '2026-10-05' }, [{ description: 'Radar', quantity: '4', unit_price: '170', allocation }]);
    expect(mocks.rpc).toHaveBeenCalledWith('dmp_create_supplier_invoice_atomic', {
      p_operation_id: 'operation',
      p_header: { supplier_id: 'supplier', supplier_invoice_number: null, invoice_date: '2026-10-05', due_date: null, currency_code: 'EUR', notes: null },
      p_lines: [{ description: 'Radar', material_id: null, quantity: 4, unit_price: 170, tax_rate: 21, allocation }],
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('retries the same atomic request after a lost response without a partial fallback', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new TypeError('Failed to fetch') }).mockResolvedValueOnce({ data: { id: 'operation', recovered: true }, error: null });
    const header = { operation_id: 'operation', supplier_id: 'supplier', invoice_date: '2026-10-05' };
    await expect(supplierInvoicesService.createDraftAtomic(header)).rejects.toThrow('Failed to fetch');
    expect(await supplierInvoicesService.createDraftAtomic(header)).toMatchObject({ id: 'operation', recovered: true });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('recovers the same invoice after a lost reply without creating another header or number', async () => {
    const existing = { id: 'operation', supplier_id: 'supplier', status: 'draft' };
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }) };
    mocks.from.mockReturnValue(query);
    expect(await supplierInvoicesService.createDraft({ supplier_id: 'supplier', operation_id: 'operation' })).toMatchObject({ ...existing, recovered: true });
    expect(query.eq.mock.calls).toEqual([['id', 'operation'], ['company_id', 'company'], ['created_by', 'actor']]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the same operation identifier for the first insertion', async () => {
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), insert: vi.fn(() => query), single: vi.fn().mockResolvedValue({ data: { id: 'operation' }, error: null }) };
    mocks.from.mockReturnValue(query); mocks.rpc.mockResolvedValue({ data: 'FPR-TEST', error: null });
    await supplierInvoicesService.createDraft({ supplier_id: 'supplier', operation_id: 'operation' });
    expect(query.insert.mock.calls[0][0]).toMatchObject({ id: 'operation', supplier_id: 'supplier', company_id: 'company', created_by: 'actor', updated_by: 'actor' });
  });
  it('does not create anything when recovery lookup itself fails', async () => {
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new TypeError('Failed to fetch') }) };
    mocks.from.mockReturnValue(query);
    await expect(supplierInvoicesService.createDraft({ supplier_id: 'supplier', operation_id: 'operation' })).rejects.toThrow('Failed to fetch');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
