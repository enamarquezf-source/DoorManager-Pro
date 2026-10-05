import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockPageScroll } from './useModalScrollLock';
afterEach(() => vi.unstubAllGlobals());

describe('overlapping dialog and mobile drawer scroll locks', () => {
 it('keeps the page locked until the last overlay closes, even out of order', () => {
  const style = { position: '', top: '', width: '', overflow: 'auto' };
  const scrollTo = vi.fn();
  vi.stubGlobal('document', { body: { style } });
  vi.stubGlobal('window', { scrollY: 450, scrollTo });
  const releaseDrawer = lockPageScroll();
  const releaseDialog = lockPageScroll();
  releaseDrawer();
  expect(style).toMatchObject({ position: 'fixed', overflow: 'hidden', top: '-450px' });
  expect(scrollTo).not.toHaveBeenCalled();
  releaseDialog();
  expect(style).toEqual({ position: '', top: '', width: '', overflow: 'auto' });
  expect(scrollTo).toHaveBeenCalledWith(0, 450);
  releaseDialog();
  expect(scrollTo).toHaveBeenCalledOnce();
 });
});
