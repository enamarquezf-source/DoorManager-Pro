import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordTableRow } from './RecordTableRow';

afterEach(() => vi.unstubAllGlobals());

function clickRow({ interactive = false, selection = '', modifier = false } = {}) {
  const onOpen = vi.fn();
  vi.stubGlobal('window', { getSelection: () => ({ toString: () => selection }) });
  const row = RecordTableRow({ children: null, onOpen });
  row.props.onClick({ defaultPrevented: false, ctrlKey: modifier, target: { closest: () => interactive ? {} : null } } as unknown as MouseEvent<HTMLTableRowElement>);
  return onOpen;
}

describe('record table navigation', () => {
  it('opens a focused row with Enter without intercepting its controls', () => {
    const onOpen = vi.fn();
    const row = RecordTableRow({ children: null, onOpen });
    const target = {};
    const preventDefault = vi.fn();
    row.props.onKeyDown({ target, currentTarget: target, key: 'Enter', preventDefault });
    expect(onOpen).toHaveBeenCalledOnce();
    row.props.onKeyDown({ target: {}, currentTarget: target, key: 'Enter', preventDefault });
    row.props.onKeyDown({ target, currentTarget: target, key: ' ', preventDefault });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(row.props.tabIndex).toBe(0);
  });
  it('opens from a normal click on row content', () => {
    expect(clickRow()).toHaveBeenCalledOnce();
  });
  it('does not navigate when an independent payment, archive or link control is clicked', () => {
    expect(clickRow({ interactive: true })).not.toHaveBeenCalled();
  });
  it('preserves text selection and native modified link gestures', () => {
    expect(clickRow({ selection: 'PAR-2026-000001' })).not.toHaveBeenCalled();
    expect(clickRow({ modifier: true })).not.toHaveBeenCalled();
  });
});
