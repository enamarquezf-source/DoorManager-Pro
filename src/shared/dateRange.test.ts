import { describe, expect, it } from 'vitest';
import { applyDateRangeFilters } from './dateRange';

function query() {
  const calls: Array<[string, string, string]> = [];
  const builder = {
    gte(column: string, value: string) { calls.push(['gte', column, value]); return builder; },
    lt(column: string, value: string) { calls.push(['lt', column, value]); return builder; },
  };
  return { builder, calls };
}

describe('date range filters', () => {
  it('uses the next local day as an exclusive upper bound', () => {
    const { builder, calls } = query();
    applyDateRangeFilters(builder, { createdFrom: '2026-08-10', createdTo: '2026-08-10' });
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('gte');
    expect(calls[1][0]).toBe('lt');
    expect(calls[1][1]).toBe('created_at');
    expect(new Date(calls[1][2]).getDate()).toBe(11);
  });

  it('combines created and updated ranges independently', () => {
    const { builder, calls } = query();
    applyDateRangeFilters(builder, { createdFrom: '2026-08-01', updatedTo: '2026-08-31' });
    expect(calls.map(([operator, column]) => `${operator}:${column}`)).toEqual(['gte:created_at', 'lt:updated_at']);
  });
});
