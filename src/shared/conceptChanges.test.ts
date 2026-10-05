import { expect, it, vi } from 'vitest';
import { completeConceptChanges } from './conceptChanges';

it('waits for every concept even when an earlier request fails', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const completed = vi.fn();
  const result = completeConceptChanges([1, 2], (line) => line === 1 ? Promise.reject(new Error('Sin conexión')) : pending).then((errors) => { completed(); return errors; });
  await Promise.resolve();
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  finish();
  expect(await result).toHaveLength(1);
  expect(completed).toHaveBeenCalledOnce();
});
