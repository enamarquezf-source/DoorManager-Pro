import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), rpc: vi.fn(), company: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc,
  storage: { from: () => ({ upload: mocks.upload }) },
} }));
vi.mock('./query', async original => ({ ...(await original<any>()), currentCompanyId: mocks.company }));
import { documentsService } from './documentsService';
const file = { name: 'prueba.pdf', type: 'application/pdf', size: 120 } as File;
const path = 'company/documents/operation.pdf';
const payload = { title: 'PRUEBA', related_type: 'Vehiculo', related_id: 'vehicle' };
beforeEach(() => {
  vi.clearAllMocks(); mocks.company.mockResolvedValue('company');
  mocks.upload.mockResolvedValue({ error: null }); mocks.rpc.mockResolvedValue({ data: 'document', error: null });
});
describe('document upload retry with a retained path', () => {
  it('recovers an uploaded object after its response was lost without changing path', async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: 'Network error' } }).mockResolvedValueOnce({ error: { statusCode: '409', message: 'Object exists' } });
    await expect(documentsService.save(payload, file, path)).rejects.toThrow('subir');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await documentsService.save(payload, file, path)).toBe('document');
    expect(mocks.upload.mock.calls[0]).toEqual(mocks.upload.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith('dmp_save_document', { p_payload: { ...payload, path, filename: file.name } });
  });
  it('replays the same document request after its database response was lost', async () => {
    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: 'document', error: null });
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { statusCode: 409, message: 'Already exists' } });
    await expect(documentsService.save(payload, file, path)).rejects.toThrow('Failed to fetch');
    expect(await documentsService.save(payload, file, path)).toBe('document');
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it('does not mistake a storage permission failure for an uploaded file', async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: 403, message: 'Forbidden' } });
    await expect(documentsService.save(payload, file, path)).rejects.toThrow('permisos');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects invalid files before uploading or saving metadata', async () => {
    for (const invalid of [{ ...file, size: 0 }, { ...file, size: 10485761 }, { ...file, type: 'text/html' }]) {
      await expect(documentsService.save(payload, invalid as File, path)).rejects.toThrow();
    }
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('retries a URL-only operation with the same server identifier and payload', async () => {
    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: 'document', error: null });
    const urlPayload = { title: 'PRUEBA', url: 'https://example.com/manual.pdf' };
    await expect(documentsService.saveOnce('operation', urlPayload)).rejects.toThrow();
    expect(await documentsService.saveOnce('operation', urlPayload)).toBe('document');
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc.mock.calls[0]).toEqual(['dmp_save_document_once', { p_operation_id: 'operation', p_payload: urlPayload }]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('requires an operation identifier before attempting recovery', () => {
    expect(() => documentsService.saveOnce('', payload, file, path)).toThrow('identificar');
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
