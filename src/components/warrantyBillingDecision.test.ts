import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runWarrantyDecisionOnce } from './warrantyBillingDecision';

const component = readFileSync(resolve(process.cwd(), 'src/components/WarrantyBillingDecisionPanel.tsx'), 'utf8');

describe('warranty billing decision concurrency', () => {
  it('keeps each pending row locked independently', async () => {
    const pending = new Set<string>();
    let resolveA!: () => void;
    let resolveB!: () => void;
    const operationA = vi.fn(() => new Promise<void>((resolve) => { resolveA = resolve; }));
    const operationB = vi.fn(() => new Promise<void>((resolve) => { resolveB = resolve; }));

    const savingA = runWarrantyDecisionOnce(pending, 'quote_line:a', operationA);
    expect(pending.has('quote_line:a')).toBe(true);
    const savingB = runWarrantyDecisionOnce(pending, 'quote_line:b', operationB);
    expect(pending.has('quote_line:a')).toBe(true);
    expect(pending.has('quote_line:b')).toBe(true);

    resolveB();
    await expect(savingB).resolves.toBe(true);
    expect(pending.has('quote_line:b')).toBe(false);
    expect(pending.has('quote_line:a')).toBe(true);

    resolveA();
    await expect(savingA).resolves.toBe(true);
    expect(pending.size).toBe(0);
  });

  it('releases only the failed row and blocks duplicate clicks', async () => {
    const pending = new Set<string>();
    const failing = vi.fn().mockRejectedValue(new Error('failed'));
    const first = runWarrantyDecisionOnce(pending, 'quote_line:a', failing);
    const duplicate = runWarrantyDecisionOnce(pending, 'quote_line:a', failing);

    await expect(duplicate).resolves.toBe(false);
    await expect(first).rejects.toThrow('failed');
    expect(pending.has('quote_line:a')).toBe(false);
    expect(failing).toHaveBeenCalledOnce();
  });

  it('uses the row pending state for both decision buttons', () => {
    expect(component).toContain('const isSaving = saving.has(key)');
    expect(component).toContain('disabled={isSaving}');
  });
});
