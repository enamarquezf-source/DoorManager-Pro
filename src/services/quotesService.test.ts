import { describe, expect, it } from 'vitest';
import { normalizeQuoteLinePayload } from './quotesService';

describe('quote line normalization', () => {
  it('preserves entered unit prices instead of falling back to quantity 1', () => {
    for (const amount of [3100, 1500, 300]) {
      const line = normalizeQuoteLinePayload({ quantity: 1, unit_cost: amount, unit_price: amount, tax_rate: 21 });
      expect(line.unit_price).toBe(amount);
      expect(line.total_price).toBe(amount);
      expect(line.total_cost).toBe(amount);
    }
  });

  it('maps legacy sale price aliases to unit_price', () => {
    expect(normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, price: 3100 }).unit_price).toBe(3100);
    expect(normalizeQuoteLinePayload({ quantity: 1, unit_cost: 1500, unitPrice: 1500 }).unit_price).toBe(1500);
    expect(normalizeQuoteLinePayload({ quantity: 1, unit_cost: 300, sale_price: 300 }).unit_price).toBe(300);
  });

  it('uses unit_cost as visible default when unit_price is empty', () => {
    const line = normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, unit_price: '', tax_rate: 21 });
    expect(line.unit_price).toBe(3100);
    expect(line.total_price).toBe(3100);
  });

  it('calculates full quote totals with and without discount', () => {
    const lines = [3100, 1500, 300].map((amount) => normalizeQuoteLinePayload({ quantity: 1, unit_cost: amount, unit_price: amount, tax_rate: 21 }));
    const subtotalCost = lines.reduce((sum, line) => sum + line.total_cost, 0);
    const subtotalSale = lines.reduce((sum, line) => sum + line.total_price, 0);
    const tax = lines.reduce((sum, line) => sum + line.total_price * line.tax_rate / 100, 0);
    expect(subtotalCost).toBe(4900);
    expect(subtotalSale).toBe(4900);
    expect(tax).toBe(1029);
    expect(subtotalSale + tax).toBe(5929);

    const discount = 10;
    const taxableBase = subtotalSale - discount;
    const discountedTax = Math.round(tax * taxableBase / subtotalSale * 100) / 100;
    expect(taxableBase).toBe(4890);
    expect(discountedTax).toBe(1026.9);
    expect(taxableBase + discountedTax).toBe(5916.9);
    expect(taxableBase - subtotalCost).toBe(-10);
  });

  it('keeps an explicit unit_price of 1 only when the payload sends 1', () => {
    const line = normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, unit_price: 1 });
    expect(line.unit_price).toBe(1);
    expect(line.total_price).toBe(1);
  });
});
