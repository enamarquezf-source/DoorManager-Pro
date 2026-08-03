import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ createSignedUrl }));

vi.mock('../lib/supabase/client', () => ({ supabase: { storage: { from } } }));

describe('signed files', () => {
  beforeEach(() => {
    from.mockClear();
    createSignedUrl.mockReset();
  });

  it('extrae files.path y usa files.bucket para generar signed_url', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/photo.jpg' }, error: null });
    const { fileReference, withSignedFileUrl } = await import('./signedFiles');
    const row = { files: { bucket: 'dmp-files', path: 'company/work-orders/id/photos/photo.jpg', name: 'photo.jpg' } };

    expect(fileReference(row)).toEqual({ bucket: 'dmp-files', path: 'company/work-orders/id/photos/photo.jpg' });
    await expect(withSignedFileUrl(row)).resolves.toMatchObject({ signed_url: 'https://signed.example/photo.jpg', file_error: null });
    expect(from).toHaveBeenCalledWith('dmp-files');
    expect(createSignedUrl).toHaveBeenCalledWith('company/work-orders/id/photos/photo.jpg', 600);
  });

  it('no intenta firmar si no hay path y devuelve error seguro', async () => {
    const { withSignedFileUrl } = await import('./signedFiles');
    await expect(withSignedFileUrl({ files: { bucket: 'dmp-files', name: 'photo.jpg' } })).resolves.toMatchObject({ signed_url: null, file_error: 'No se ha podido cargar el archivo' });
    expect(from).not.toHaveBeenCalled();
  });

  it('mantiene aislamiento RLS delegando la firma a Supabase Storage', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'RLS' } });
    const { withSignedFileUrl } = await import('./signedFiles');
    await expect(withSignedFileUrl({ files: { bucket: 'dmp-files', path: 'otra-empresa/foto.jpg' } })).resolves.toMatchObject({ signed_url: null, file_error: 'No se ha podido cargar el archivo' });
  });
});
