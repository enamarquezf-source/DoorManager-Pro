import { describe, expect, it } from 'vitest';
import { calculateQuoteEconomics, normalizeQuoteLinePayload } from './quotesService';

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

  it('calculates full quote totals without discount', () => {
    const lines = [3100, 1500, 300].map((amount) => normalizeQuoteLinePayload({ quantity: 1, unit_cost: amount, unit_price: amount, tax_rate: 21 }));
    const totals = calculateQuoteEconomics(lines, 'percentage', 0);
    expect(totals).toMatchObject({ subtotalCost: 4900, subtotalSale: 4900, discountAmount: 0, taxableBase: 4900, taxAmount: 1029, totalAmount: 5929, estimatedMargin: 0 });
  });

  it('calculates percentage discount, VAT and margin without mixing VAT into profit', () => {
    const lines = [3100, 1500, 300].map((amount) => normalizeQuoteLinePayload({ quantity: 1, unit_cost: amount, unit_price: amount, tax_rate: 21 }));
    const totals = calculateQuoteEconomics(lines, 'percentage', 10);
    expect(totals).toMatchObject({ subtotalCost: 4900, subtotalSale: 4900, discountAmount: 490, taxableBase: 4410, taxAmount: 926.1, totalAmount: 5336.1, estimatedMargin: -490 });
    expect(totals.estimatedMargin).toBe(totals.taxableBase - totals.subtotalCost);
  });

  it('calculates fixed amount discount independently from percentage discounts', () => {
    const lines = [3100, 1500, 300].map((amount) => normalizeQuoteLinePayload({ quantity: 1, unit_cost: amount, unit_price: amount, tax_rate: 21 }));
    const totals = calculateQuoteEconomics(lines, 'amount', 10);
    expect(totals).toMatchObject({ subtotalCost: 4900, subtotalSale: 4900, discountAmount: 10, taxableBase: 4890, taxAmount: 1026.9, totalAmount: 5916.9, estimatedMargin: -10 });
  });

  it('calculates margin from net sale without VAT when sale is higher than cost', () => {
    const lines = [
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, unit_price: 3800, tax_rate: 21 }),
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 1500, unit_price: 1800, tax_rate: 21 }),
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 300, unit_price: 400, tax_rate: 21 }),
    ];
    const totals = calculateQuoteEconomics(lines, 'percentage', 10);
    expect(totals).toMatchObject({ subtotalCost: 4900, subtotalSale: 6000, discountAmount: 600, taxableBase: 5400, taxAmount: 1134, totalAmount: 6534, estimatedMargin: 500 });
  });

  it('validates the real target quote case: 4900 cost, 6000 sale, 10 percent discount', () => {
    const totals = calculateQuoteEconomics([
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, unit_price: 3800, tax_rate: 21 }),
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 1500, unit_price: 1800, tax_rate: 21 }),
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 300, unit_price: 400, tax_rate: 21 }),
    ], 'percentage', 10);
    expect(totals.subtotalCost).toBe(4900);
    expect(totals.subtotalSale).toBe(6000);
    expect(totals.taxableBase).toBe(5400);
    expect(totals.taxAmount).toBe(1134);
    expect(totals.totalAmount).toBe(6534);
    expect(totals.estimatedMargin).toBe(500);
  });

  it('caps excessive discount at subtotal sale without breaking totals', () => {
    const lines = [normalizeQuoteLinePayload({ quantity: 1, unit_cost: 100, unit_price: 100, tax_rate: 21 })];
    const totals = calculateQuoteEconomics(lines, 'amount', 150);
    expect(totals).toMatchObject({ discountAmount: 100, taxableBase: 0, taxAmount: 0, totalAmount: 0, estimatedMargin: -100 });
  });

  it('keeps an explicit unit_price of 1 only when the payload sends 1', () => {
    const line = normalizeQuoteLinePayload({ quantity: 1, unit_cost: 3100, unit_price: 1 });
    expect(line.unit_price).toBe(1);
    expect(line.total_price).toBe(1);
  });

  it('keeps discount_percent 0 with the existing behavior', () => {
    const line = normalizeQuoteLinePayload({ quantity: 2, unit_cost: 100, unit_price: 200, tax_rate: 21, discount_percent: 0 });
    expect(line.total_cost).toBe(200);
    expect(line.total_price).toBe(400);
    expect(line.discount_percent).toBe(0);
  });

  it('applies discount_percent to the line sale without touching cost', () => {
    const line = normalizeQuoteLinePayload({ quantity: 2, unit_cost: 100, unit_price: 200, tax_rate: 21, discount_percent: 10 });
    expect(line.total_cost).toBe(200);
    expect(line.total_price).toBe(360);
    expect(line.total).toBe(360);
  });

  it('rejects discount_percent out of the 0..100 range', () => {
    expect(() => normalizeQuoteLinePayload({ quantity: 1, unit_cost: 100, unit_price: 200, discount_percent: 101 })).toThrow(/descuento de la línea/);
    expect(() => normalizeQuoteLinePayload({ quantity: 1, unit_cost: 100, unit_price: 200, discount_percent: -1 })).toThrow(/descuento de la línea/);
  });

  it('applies only the global discount once on previously discounted line totals', () => {
    const lines = [
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 100, unit_price: 200, tax_rate: 21, discount_percent: 10 }),
      normalizeQuoteLinePayload({ quantity: 1, unit_cost: 100, unit_price: 200, tax_rate: 21, discount_percent: 10 }),
    ];
    const totals = calculateQuoteEconomics(lines, 'percentage', 10);
    expect(totals.subtotalSale).toBe(360);
    expect(totals.discountAmount).toBe(36);
    expect(totals.taxableBase).toBe(324);
  });
});
