// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { appearanceKey, appearanceThemes, applyAppearance, readAppearance, saveAppearance, validAppearance } from './appearance';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); applyAppearance('dmp'); });

it('keeps preferences separate for each company and user and tolerates obsolete values', () => {
  const a = { companyId: 'company-a', profileId: 'user-a' };
  const b = { companyId: 'company-a', profileId: 'user-b' };
  const c = { companyId: 'company-b', profileId: 'user-a' };
  expect(saveAppearance(a, 'blue')).toBe(true);
  expect(readAppearance(a)).toBe('blue');
  expect(readAppearance(b)).toBe('dmp');
  expect(readAppearance(c)).toBe('dmp');
  localStorage.setItem(appearanceKey(b), 'obsolete-colour');
  expect(readAppearance(b)).toBe('dmp');
  expect(validAppearance(null)).toBe('dmp');
});

it('restores the original appearance without changing semantic status colours or other styles', () => {
  document.documentElement.style.setProperty('--danger', '#dc2626');
  applyAppearance('violet');
  expect(document.documentElement.dataset.dmpTheme).toBe('violet');
  expect(document.documentElement.style.getPropertyValue('--dmp-primary')).toBe('#594378');
  applyAppearance('dmp');
  expect(document.documentElement.hasAttribute('data-dmp-theme')).toBe(false);
  expect(document.documentElement.style.getPropertyValue('--dmp-primary')).toBe('');
  expect(document.documentElement.style.getPropertyValue('--danger')).toBe('#dc2626');
  document.documentElement.style.removeProperty('--danger');
});

it('degrades safely when the browser denies preference storage', () => {
  const scope = { companyId: 'a', profileId: 'b' };
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Denied'); },
    setItem: () => { throw new Error('Full'); },
  });
  expect(readAppearance(scope)).toBe('dmp');
  expect(saveAppearance(scope, 'blue')).toBe(false);
  expect(() => applyAppearance('blue')).not.toThrow();
});

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(part => {
    const n = parseInt(part, 16) / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

it.each(appearanceThemes)('$name keeps primary text and navigation legible', theme => {
  for (const background of [theme.primary, theme.hover, theme.sidebar, theme.active]) {
    expect(contrast('#ffffff', background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(theme.primary, theme.soft)).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#182e35', theme.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.accent, theme.sidebar)).toBeGreaterThanOrEqual(4.5);
});
