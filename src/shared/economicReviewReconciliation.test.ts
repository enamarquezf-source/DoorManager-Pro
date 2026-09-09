import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { economicDecisionFor, reconcileEconomicDecisions } from './economicReview';

const component = readFileSync(resolve(process.cwd(), 'src/components/EconomicReviewPanel.tsx'), 'utf8');

const row = (kind: 'time' | 'material' | 'cost', id: string, unitPrice = 10) => ({ kind, id, unit_price: unitPrice, source: 'manual' as const });
const edited = (kind: 'time' | 'material' | 'cost', id: string, unitPrice: number, contributes: boolean) => ({ ...economicDecisionFor(row(kind, id)), unit_price: unitPrice, contributes_to_sale: contributes, decision: contributes ? 'enters' as const : 'does_not_enter' as const });

describe('economic decision reconciliation', () => {
  it('retains edited rows and initializes only added rows', () => {
    const decisions = reconcileEconomicDecisions([row('time', 'a'), row('material', 'b')], [edited('time', 'a', 42, true)]);
    expect(decisions).toEqual([edited('time', 'a', 42, true), economicDecisionFor(row('material', 'b'))]);
    const current = [edited('time', 'a', 42, true)];
    expect(reconcileEconomicDecisions([row('time', 'a')], current)).toBe(current);
  });

  it('removes deleted rows from state and payload', () => {
    const decisions = reconcileEconomicDecisions([row('material', 'b')], [edited('time', 'a', 42, true), edited('material', 'b', 21, false)]);
    expect(decisions).toEqual([edited('material', 'b', 21, false)]);
  });

  it('keeps decisions attached to identity when rows reorder', () => {
    const decisions = reconcileEconomicDecisions([row('material', 'b'), row('time', 'a')], [edited('time', 'a', 42, true), edited('material', 'b', 21, false)]);
    expect(decisions.map(({ kind, entry_id, unit_price }) => ({ kind, entry_id, unit_price }))).toEqual([
      { kind: 'material', entry_id: 'b', unit_price: 21 },
      { kind: 'time', entry_id: 'a', unit_price: 42 },
    ]);
  });

  it('does not reuse a replaced row or a decision from another kind', () => {
    const decisions = reconcileEconomicDecisions([row('cost', 'c')], [edited('time', 'c', 42, true), edited('material', 'a', 21, false)]);
    expect(decisions).toEqual([economicDecisionFor(row('cost', 'c'))]);
  });

  it('starts a clean decision set when the workOrder changes', () => {
    const decisions = reconcileEconomicDecisions([row('time', 'a')], [edited('time', 'a', 42, true)], false);
    expect(decisions).toEqual([economicDecisionFor(row('time', 'a'))]);
  });

  it('keeps the exact current-row decision list for the review payload', () => {
    expect(component).toContain('reconcileEconomicDecisions(rows, current, preserveExisting)');
    expect(component).toContain('reviewWorkOrderEconomic(workOrder.id, decisions, reason.trim(), zeroSaleConfirmed)');
  });

  it('invalidates zero sale confirmation when economic inputs change', () => {
    expect(component).toContain('useEffect(() => { const preserveExisting = previousWorkOrderId.current === workOrder?.id;');
    expect(component).toContain('setZeroSaleConfirmed(false)');
    expect(component).toContain('economicInputFingerprint');
  });
});
