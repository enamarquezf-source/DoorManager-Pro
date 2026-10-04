import { describe, expect, it } from 'vitest';
import { isValidUuid } from './uuid';

describe('canonical UUID validation', () => {
  it('accepts PostgreSQL UUIDs without imposing RFC version bits', () => {
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isValidUuid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
  });

  it.each([null, undefined, '', 'not-a-uuid', '00000000-0000-0000-0000-00000000000', '00000000-0000-0000-0000-zzzzzzzzzzzz'])('rejects malformed values: %s', (value) => {
    expect(isValidUuid(value)).toBe(false);
  });
});
