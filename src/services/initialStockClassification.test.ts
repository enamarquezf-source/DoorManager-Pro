import { describe, expect, it } from 'vitest';
import { buildInitialStockRows, classifyInitialStockMaterial, initialStockCounters } from './initialStockClassification';

describe('initial stock classification', () => {
  it('classifies only canonical warehouse rows', () => {
    expect(classifyInitialStockMaterial({}, [])).toMatchObject({ canonicalTotal: 0, status: 'NO_CANONICAL_STOCK' });
    expect(classifyInitialStockMaterial({}, [{ quantity: 3 }])).toMatchObject({ canonicalTotal: 3, status: 'CANONICAL_EXISTS' });
  });

  it('builds opening rows without a legacy quantity', () => {
    const rows = buildInitialStockRows([{ id: 'A' }, { id: 'B' }], [{ material_id: 'A', warehouse_id: 'W', quantity: 5 }]);
    expect(rows[0]).toMatchObject({ status: 'CANONICAL_EXISTS', canonicalTotal: 5 });
    expect(rows[1].status).toBe('NO_CANONICAL_STOCK');
    expect(initialStockCounters(rows)).toEqual({ pending: 1, opened: 1, review: 0, zero: 0 });
  });
});
