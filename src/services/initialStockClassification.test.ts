import { describe, expect, it } from 'vitest';
import { classifyInitialStockMaterial } from './initialStockClassification';

describe('initial stock classification', () => {
  it('keeps zero distinct from positive, null, and canonical stock', () => {
    const materialA = classifyInitialStockMaterial({ stock_quantity: 15 }, []);
    const materialB = classifyInitialStockMaterial({ stock_quantity: 0 }, []);
    const materialC = classifyInitialStockMaterial({ stock_quantity: null }, []);
    const materialD = classifyInitialStockMaterial({ stock_quantity: 0 }, [{ quantity: 0 }]);
    const rows = [materialA, materialB, materialC, materialD];
    const positive = rows.filter((row) => row.status === 'LEGACY_ONLY_POSITIVE');
    const zero = rows.filter((row) => row.status === 'LEGACY_ONLY_ZERO');

    expect(materialA.status).toBe('LEGACY_ONLY_POSITIVE');
    expect(materialB.status).toBe('LEGACY_ONLY_ZERO');
    expect(materialC.status).toBe('LEGACY_UNKNOWN');
    expect(materialD.status).toBe('MATCH');
    expect(positive).toHaveLength(1);
    expect(zero).toHaveLength(1);
    expect(positive.map(() => 'A')).toEqual(['A']);
  });

  it('selects only positive legacy candidates', () => {
    const rows = [
      { id: 'A', ...classifyInitialStockMaterial({ stock_quantity: 15 }, []) },
      { id: 'B', ...classifyInitialStockMaterial({ stock_quantity: 0 }, []) },
      { id: 'C', ...classifyInitialStockMaterial({ stock_quantity: null }, []) },
      { id: 'D', ...classifyInitialStockMaterial({ stock_quantity: 0 }, [{ quantity: 0 }]) },
    ];
    expect(rows.filter((row) => row.status === 'LEGACY_ONLY_POSITIVE').map((row) => row.id)).toEqual(['A']);
  });

  it('does not exclude specific materials based on active state', () => {
    const positiveSpecific = classifyInitialStockMaterial({ stock_quantity: 1 }, []);
    const consumedSpecific = classifyInitialStockMaterial({ stock_quantity: 0 }, []);

    expect({ is_specific: true, active: true, ...positiveSpecific }).toMatchObject({ status: 'LEGACY_ONLY_POSITIVE' });
    expect({ is_specific: true, active: false, ...consumedSpecific }).toMatchObject({ status: 'LEGACY_ONLY_ZERO' });
  });

  it('keeps an active specific positive material as an opening candidate', () => {
    const mat000016 = {
      is_specific: true,
      active: true,
      stock_controlled: true,
      ...classifyInitialStockMaterial({ stock_quantity: 1 }, []),
    };

    expect(mat000016.status).toBe('LEGACY_ONLY_POSITIVE');
    expect(mat000016.legacy).toBe(1);
  });

  it('matches the remote-equivalent counts', () => {
    const rows = [
      ...Array.from({ length: 15 }, () => classifyInitialStockMaterial({ stock_quantity: 15 }, [])),
      ...Array.from({ length: 10 }, () => classifyInitialStockMaterial({ stock_quantity: 0 }, [])),
      ...Array.from({ length: 4 }, () => classifyInitialStockMaterial({ stock_quantity: 4 }, [{ quantity: 1 }])),
    ];
    expect(rows.filter((row) => row.status === 'LEGACY_ONLY_POSITIVE')).toHaveLength(15);
    expect(rows.filter((row) => row.status === 'LEGACY_ONLY_ZERO')).toHaveLength(10);
    expect(rows.filter((row) => row.status === 'MISMATCH')).toHaveLength(4);
  });
});
