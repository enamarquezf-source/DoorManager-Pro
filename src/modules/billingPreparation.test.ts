import { describe, expect, it, vi } from 'vitest';
import { prepareInvoiceOnce } from './billingPreparation';

describe('invoice preparation guard', () => {
  it('allows one preparation per work order while it is pending', async () => {
    const pending = new Set<string>();
    let resolve!: () => void;
    const loader = vi.fn(() => new Promise<void>((finish) => { resolve = finish; }));

    const first = prepareInvoiceOnce(pending, 'work-1', loader);
    const second = prepareInvoiceOnce(pending, 'work-1', loader);

    expect(loader).toHaveBeenCalledOnce();
    expect(pending.has('work-1')).toBe(true);
    await expect(second).resolves.toBe(false);

    resolve();
    await expect(first).resolves.toBe(true);
    expect(pending.has('work-1')).toBe(false);
  });

  it('releases the work order after a failed preparation', async () => {
    const pending = new Set<string>();
    const loader = vi.fn().mockRejectedValue(new Error('failed'));

    await expect(prepareInvoiceOnce(pending, 'work-1', loader)).rejects.toThrow('failed');
    expect(pending.has('work-1')).toBe(false);
    await expect(prepareInvoiceOnce(pending, 'work-1', loader)).rejects.toThrow('failed');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps another work order operable', async () => {
    const pending = new Set<string>();
    const loader = vi.fn().mockResolvedValue(undefined);

    await expect(prepareInvoiceOnce(pending, 'work-1', loader)).resolves.toBe(true);
    await expect(prepareInvoiceOnce(pending, 'work-2', loader)).resolves.toBe(true);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
