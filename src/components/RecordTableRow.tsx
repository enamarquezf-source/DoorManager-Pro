import type { MouseEvent, ReactNode } from 'react';

/** Preserve table semantics and native controls while making empty row areas open the record. */
export function RecordTableRow({ children, onOpen, className = '' }: { children: ReactNode; onOpen: () => void; className?: string }) {
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label, summary, details')) return;
    if (window.getSelection()?.toString()) return;
    onOpen();
  };
  return <tr className={`record-table-row ${className}`.trim()} onClick={open}>{children}</tr>;
}
