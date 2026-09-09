import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = readFileSync(resolve(process.cwd(), 'src/components/EconomicReviewPanel.tsx'), 'utf8');

describe('economic review zero-sale confirmation', () => {
  it('invalidates confirmation whenever an economic decision changes', () => {
    const updateDecision = component.slice(component.indexOf('const updateDecision'), component.indexOf('const submit'));
    expect(updateDecision).toContain('setZeroSaleConfirmed(false)');
  });

  it('invalidates confirmation when the current economic inputs change', () => {
    expect(component).toContain('const economicInputFingerprint = JSON.stringify');
    expect(component).toContain('setZeroSaleConfirmed(false); }, [economicInputFingerprint]);');
  });

  it('keeps the explicit confirmation in the review payload', () => {
    expect(component).toContain('reviewWorkOrderEconomic(workOrder.id, decisions, reason.trim(), zeroSaleConfirmed)');
  });
});
