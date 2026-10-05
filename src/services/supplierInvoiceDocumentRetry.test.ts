import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn(), storageFrom: vi.fn(), company: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.storageFrom } } }));
vi.mock('./query', async (original) => ({ ...(await original<any>()), currentCompanyId: mocks.company }));
import { supplierInvoiceDocumentsService } from './supplierInvoiceDocumentsService';
const file = { name: 'factura.pdf', size: 123, type: 'application/pdf' } as File;
const operationId = '11111111-1111-4111-8111-111111111111';

describe('invoice attachment retries', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.company.mockResolvedValue('company'); mocks.storageFrom.mockReturnValue({ upload: mocks.upload }); });
  it.each(['409', '400'])('recovers the same uploaded path after a lost RPC response (%s)', async (statusCode) => {
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { statusCode, message: 'The resource already exists' } });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } }).mockResolvedValueOnce({ data: 'document', error: null });
    await expect(supplierInvoiceDocumentsService.upload('invoice', 'Proveedor', file, operationId)).rejects.toThrow();
    expect(await supplierInvoiceDocumentsService.upload('invoice', 'Proveedor', file, operationId)).toBe('document');
    expect(mocks.upload.mock.calls[0]).toEqual(mocks.upload.mock.calls[1]);
    expect(mocks.upload).toHaveBeenLastCalledWith(`company/invoice/Proveedor/${operationId}.pdf`, file, { contentType: 'application/pdf', upsert: false });
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it.each([{ statusCode: '403', message: 'Permission denied' }, { statusCode: '400', message: 'Invalid JWT' }])('does not register metadata after upload rejection', async (error) => {
    mocks.upload.mockResolvedValue({ error });
    await expect(supplierInvoiceDocumentsService.upload('invoice', 'DMP', file, operationId)).rejects.toThrow('subir');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects path-shaped operation identifiers before upload', async () => {
    await expect(supplierInvoiceDocumentsService.upload('invoice', 'DMP', file, '../other')).rejects.toThrow('Identificador');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
