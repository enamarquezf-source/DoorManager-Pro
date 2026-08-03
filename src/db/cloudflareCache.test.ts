import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Cloudflare Pages cache headers', () => {
  const headers = readFileSync('public/_headers', 'utf8');

  it('evita cache agresiva para shell HTML y manifiesto de build', () => {
    expect(headers).toContain('/index.html');
    expect(headers).toContain('/build-info.json');
    expect(headers.match(/Cache-Control: no-cache, no-store, must-revalidate/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('mantiene cache larga solo para assets generados con hash', () => {
    expect(headers).toContain('/assets/*');
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
  });
});
