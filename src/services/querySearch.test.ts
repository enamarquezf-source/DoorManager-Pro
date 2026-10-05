import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { contains } from './query';

describe('search filters sent through the Supabase SDK', () => {
  it.each([
    ['Tesva, S.L.', '(name.ilike."%Tesva, S.L.%",code.ilike."%Tesva, S.L.%")'],
    ['Radar (exterior)', '(name.ilike."%Radar (exterior)%",code.ilike."%Radar (exterior)%")'],
    ['Modelo "A"', '(name.ilike."%Modelo \\"A\\"%",code.ilike."%Modelo \\"A\\"%")'],
    ['x),active.eq.true', '(name.ilike."%x),active.eq.true%",code.ilike."%x),active.eq.true%")'],
    ['Puerta rápida', '(name.ilike.%Puerta rápida%,code.ilike.%Puerta rápida%)'],
  ])('keeps %s in the search value rather than adding OR terms', async (search, expected) => {
    let requested: URL | undefined;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      requested = new URL(String(input));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const client = createClient('https://example.supabase.co', 'test-key', {
      global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await client.from('materials').select('id').or(contains(['name', 'code'], search));
    expect(result.error).toBeNull();
    expect(requested?.searchParams.get('or')).toBe(expected);
    expect(requested?.searchParams.has('active')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
