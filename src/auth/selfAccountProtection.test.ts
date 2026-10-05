import { describe, expect, it } from 'vitest';
import { mustProtectOwnAccount } from './selfAccountProtection';

describe('own account protection', () => {
  it('protects the administrator editing their own account', () => {
    expect(mustProtectOwnAccount('admin', 'admin')).toBe(true);
  });
  it('allows another user to be managed without misidentifying it as self', () => {
    expect(mustProtectOwnAccount('admin', 'technician')).toBe(false);
  });
  it('keeps protection when the acting identity is unavailable', () => {
    expect(mustProtectOwnAccount(undefined, 'technician')).toBe(true);
  });
});
