import { describe, expect, it } from 'vitest';
import { localDateKey } from './localDate';

function localDateInMadrid(iso: string) {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Madrid';
  try { return localDateKey(new Date(iso)); }
  finally { process.env.TZ = previous; }
}

describe('localDateKey', () => {
  it('usa fecha local y no UTC', () => {
    expect(localDateInMadrid('2026-08-09T22:30:00.000Z')).toBe('2026-08-10');
    expect(new Date('2026-08-09T22:30:00.000Z').toISOString().slice(0, 10)).toBe('2026-08-09');
  });

  it('resuelve Europe/Madrid cerca de las 00:30', () => {
    expect(localDateInMadrid('2026-01-09T23:30:00.000Z')).toBe('2026-01-10');
  });

  it('mantiene la fecha local durante cambio de horario de verano', () => {
    expect(localDateInMadrid('2026-03-29T00:30:00.000Z')).toBe('2026-03-29');
    expect(localDateInMadrid('2026-10-25T00:30:00.000Z')).toBe('2026-10-25');
  });

  it('formatea fechas locales con ceros', () => {
    expect(localDateKey(new Date(2026, 0, 5, 8, 0, 0))).toBe('2026-01-05');
  });
});
