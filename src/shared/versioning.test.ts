import { describe, expect, it, vi } from 'vitest';
import { checkForNewVersion, isNewBuild, normalizeBuildInfo, type BuildInfo } from './versioning';

const current: BuildInfo = { version: '0.1.0-old', commit: 'old', builtAt: '2026-08-03T10:00:00Z' };

describe('versioning', () => {
  it('detecta una version desplegada distinta', () => {
    expect(isNewBuild(current, { version: '0.1.0-new', commit: 'new', builtAt: '2026-08-03T11:00:00Z' })).toBe(true);
    expect(isNewBuild(current, current)).toBe(false);
  });

  it('normaliza manifiestos incompletos sin romper la UI', () => {
    expect(normalizeBuildInfo({ version: ' 0.1.0 ', commit: '', builtAt: 123 })).toEqual({ version: '0.1.0', commit: 'desconocido', builtAt: 'desconocido' });
  });

  it('consulta build-info sin cache y avisa si hay nueva version', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ version: '0.1.0-new', commit: 'new', builtAt: '2026-08-03T11:00:00Z' }) })) as unknown as typeof fetch;

    await expect(checkForNewVersion(current, fetcher)).resolves.toMatchObject({ status: 'update-available', latest: { version: '0.1.0-new' } });
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^\/build-info\.json\?ts=/), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  });

  it('devuelve estado no disponible si falla la consulta remota', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(checkForNewVersion(current, fetcher)).resolves.toMatchObject({ status: 'unavailable', current });
  });
});
