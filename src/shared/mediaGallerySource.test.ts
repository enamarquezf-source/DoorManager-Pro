import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('media gallery rendering', () => {
  it('renderiza foto y firma solo cuando hay signed_url y no crea enlaces rotos', () => {
    expect(app).toContain('photo.signed_url ? <a');
    expect(app).toContain('signature.signed_url ? <a');
    expect(app).not.toContain("href={photo.signed_url ?? '#'}");
    expect(app).not.toContain("src={photo.signed_url ?? ''}");
    expect(app).toContain('No se ha podido cargar el archivo');
  });
});
