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
});
