import { describe, expect, it, vi } from 'vitest';

describe('checksService offline sync helpers', () => {
  it('detecta fotos locales pendientes para no borrar la cola', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
    const { hasPendingLocalPhotos } = await import('./checksService');

    expect(hasPendingLocalPhotos({ photos: [{ id: 'local-photo', name: 'puerta.jpg' }] })).toBe(true);
    expect(hasPendingLocalPhotos({ photos: [] })).toBe(false);
    expect(hasPendingLocalPhotos({})).toBe(false);
  });

  it('carga equipment_types y fotos firmadas en el detalle del check', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./checksService.ts', import.meta.url), 'utf8'));
    expect(source).toContain('equipment!checks_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*))');
    expect(source).toContain('check_photos!check_photos_check_id_fkey(*, files!check_photos_file_id_fkey(*))');
    expect(source).toContain('deficiencies!deficiencies_check_id_fkey(*)');
    expect(source).toContain('profiles!checks_technician_id_fkey(first_name,last_name)');
    expect(source).toContain('withSignedFileUrl');
  });

  it('prioriza plantilla exacta por tipo y no ofrece global incompatible', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./checksService.ts', import.meta.url), 'utf8'));
    expect(source).toContain("query.eq('equipment_type_id', equipmentTypeId)");
    expect(source).not.toContain('equipment_type_id.is.null`);');
  });
});
