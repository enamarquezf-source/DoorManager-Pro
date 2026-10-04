import { describe, expect, it } from 'vitest';
import { economicDecisionFor, economicEntryRows, economicReviewReadiness, needsTimeRateRepair } from './economicReview';

const legacy = { id: 'h', duration_minutes: 300, hourly_cost: 0, hourly_price: 0, total_cost: 0, total_price: 0, source: 'manual' };

describe('economic review readiness', () => {
  it('detects unlinked legacy defaults without calling a versioned free rate missing', () => {
    expect(needsTimeRateRepair(legacy)).toBe(true);
    expect(needsTimeRateRepair({ ...legacy, rate_version_id: 'free-rate' })).toBe(false);
    expect(needsTimeRateRepair({ ...legacy, hourly_cost: 25 })).toBe(false);
    expect(needsTimeRateRepair({ ...legacy, source: 'quote' })).toBe(false);
    expect(needsTimeRateRepair({ ...legacy, duration_minutes: 0 })).toBe(false);
  });

  it('does not present a partial cost or undecided sale as a complete economy', () => {
    const work = { economic_review_status: 'pending', time_entries: [legacy], cost_entries: [{ id: 'van', quantity: 1, unit_cost: 250, unit_price: 0, total_cost: 250, total_price: 0 }] };
    const rows = economicEntryRows(work);
    expect(economicReviewReadiness(work, rows, rows.map(economicDecisionFor))).toEqual({ costComplete: false, saleComplete: false, approvedSaleConfigured: false, marginConfigured: false });
  });

  it('preserves an explicitly approved zero sale and its real negative margin', () => {
    const work = { economic_review_status: 'approved', sale_amount: 0, time_entries: [{ ...legacy, rate_version_id: 'v', hourly_cost: 20, total_cost: 100 }] };
    const rows = economicEntryRows(work);
    const decisions = rows.map((row) => ({ ...economicDecisionFor(row), contributes_to_sale: false, decision: 'does_not_enter' as const }));
    expect(economicReviewReadiness(work, rows, decisions)).toEqual({ costComplete: true, saleComplete: true, approvedSaleConfigured: true, marginConfigured: true });
  });

  it('waits for valid positive sale prices and a recorded quote amount', () => {
    const work = { time_entries: [{ ...legacy, rate_version_id: 'v' }] };
    const rows = economicEntryRows(work);
    const decisions = rows.map((row) => ({ ...economicDecisionFor(row), contributes_to_sale: true, decision: 'enters' as const }));
    expect(economicReviewReadiness(work, rows, decisions).saleComplete).toBe(false);
    decisions[0].unit_price = 80;
    expect(economicReviewReadiness(work, rows, decisions).saleComplete).toBe(true);
    expect(economicReviewReadiness({ ...work, quote_id: 'q' }, rows, decisions).saleComplete).toBe(false);
    expect(economicReviewReadiness({ ...work, quote_id: 'q', quoted_sale_amount: 0 }, rows, decisions).saleComplete).toBe(true);
  });
});
