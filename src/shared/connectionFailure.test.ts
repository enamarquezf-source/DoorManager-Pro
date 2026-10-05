import { describe, expect, it } from 'vitest';
import { isConnectionFailure } from './connectionFailure';

describe('offline fallback classification', () => {
  it('recognizes native and wrapped connection failures', () => {
    expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isConnectionFailure({ message: 'No se ha podido guardar', originalError: { message: 'TypeError: NetworkError when attempting to fetch resource.' } })).toBe(true);
  });
  it('keeps permission and validation failures visible', () => {
    expect(isConnectionFailure({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isConnectionFailure({ originalError: { code: 'P0001', message: 'parte: estado no editable' } })).toBe(false);
    expect(isConnectionFailure(new Error('La sesión ha cambiado'))).toBe(false);
    expect(isConnectionFailure(null)).toBe(false);
  });
});
