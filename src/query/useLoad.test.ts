import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('legacy load adapter', () => {
  it('uses TanStack Query for legacy server-state screens', () => {
    const source = readFileSync(new URL('./useLoad.ts', import.meta.url), 'utf8');
    expect(source).toContain("from '@tanstack/react-query'");
    expect(source).toContain("queryKey: ['legacy-load', loader.toString(), ...deps]");
    expect(source).toContain('queryFn: ({ signal }) => loader(signal)');
  });
});
