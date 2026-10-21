import { describe, expect, it } from 'vitest';
import { studyHours } from './studyHours';
describe('study duration display', () => {
  it('shows minutes instead of ambiguous decimal hours and does not wrap at 24 hours', () => {
    expect(studyHours(1.5)).toBe('1 h 30 min');
    expect(studyHours(1 / 60)).toBe('0 h 01 min');
    expect(studyHours(25.25)).toBe('25 h 15 min');
    expect(studyHours(0)).toBe('0 h 00 min');
  });
});
