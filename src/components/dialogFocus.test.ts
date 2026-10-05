import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ panel: null as any, effects: [] as (() => (() => void) | void)[] }));
vi.mock('react', () => ({ useRef: (value: any) => ({ current: value === null ? state.panel : value }), useEffect: (effect: () => void) => state.effects.push(effect), useId: () => 'dialog' }));
vi.mock('react-dom', () => ({ createPortal: (content: any) => content }));
import { useDialogFocus } from './FormPrimitives';

beforeEach(() => { state.effects = []; });
afterEach(() => vi.unstubAllGlobals());

it('closes only the topmost dialog with Escape', () => {
  const ownDialog = {};
  const childDialog = {};
  let dialogs = [ownDialog, childDialog];
  let handler!: (event: any) => void;
  const focus = vi.fn();
  state.panel = { querySelectorAll: () => [], closest: () => ownDialog, focus };
  vi.stubGlobal('document', { activeElement: null, querySelectorAll: () => dialogs });
  vi.stubGlobal('window', { addEventListener: (_type: string, callback: any) => { handler = callback; }, removeEventListener: vi.fn() });
  const close = vi.fn();
  useDialogFocus(close);
  state.effects.forEach((effect) => effect());
  const escape = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
  handler(escape);
  expect(close).not.toHaveBeenCalled();
  dialogs = [ownDialog];
  handler(escape);
  expect(close).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledOnce();
});

it('does not close the topmost dialog while saving', () => {
  const ownDialog = {};
  let handler!: (event: any) => void;
  state.panel = { querySelectorAll: () => [], closest: () => ownDialog, focus: vi.fn() };
  vi.stubGlobal('document', { activeElement: null, querySelectorAll: () => [ownDialog] });
  vi.stubGlobal('window', { addEventListener: (_type: string, callback: any) => { handler = callback; }, removeEventListener: vi.fn() });
  const close = vi.fn();
  useDialogFocus(close, false);
  state.effects.forEach((effect) => effect());
  handler({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
  expect(close).not.toHaveBeenCalled();
});
