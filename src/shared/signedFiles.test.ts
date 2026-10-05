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
    await expect(withSignedFileUrl(row)).resolves.toMatchObject({ signed_url: 'https://signed.example/photo.jpg', file_error: null });
    expect(from).toHaveBeenCalledWith('dmp-files');
    expect(createSignedUrl).toHaveBeenCalledWith('company/work-orders/id/photos/photo.jpg', 600);
    expect(createSignedUrl).toHaveBeenCalledOnce();
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

  it('vuelve a comprobar Storage al cambiar de sesión aunque el enlace anterior siga vigente', async () => {
    const { signedFileUrl, clearSignedFileCache } = await import('./signedFiles');
    clearSignedFileCache();
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://signed.example/private' }, error: null });
    await expect(signedFileUrl('private', 'invoice.pdf')).resolves.toBe('https://signed.example/private');
    clearSignedFileCache();
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Forbidden' } });
    await expect(signedFileUrl('private', 'invoice.pdf')).rejects.toThrow('acceso temporal');
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('descarta la firma que termina después de cerrar la sesión', async () => {
    const { signedFileUrl, clearSignedFileCache } = await import('./signedFiles');
    let finish!: (response: any) => void;
    createSignedUrl.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const signing = signedFileUrl('private', 'late.pdf');
    clearSignedFileCache();
    finish({ data: { signedUrl: 'https://signed.example/old-session' }, error: null });
    await expect(signing).rejects.toThrow('sesión ha cambiado');
  });
});
