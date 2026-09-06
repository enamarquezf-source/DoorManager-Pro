import { describe, expect, it, vi } from 'vitest';

describe('debounce contract', () => {
  it('allows only the final value after the common delay', () => {
    vi.useFakeTimers();
    const values: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const emit = (value: string) => { if (timer) clearTimeout(timer); timer = setTimeout(() => values.push(value), 300); };
    emit('a'); emit('ab'); emit('abc');
    vi.advanceTimersByTime(299);
    expect(values).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(values).toEqual(['abc']);
    vi.useRealTimers();
  });
});
