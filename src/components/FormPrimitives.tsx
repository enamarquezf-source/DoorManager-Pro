import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalScrollLock } from '../shared/useModalScrollLock';

export function FormSection({ title, description, children, className = '' }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`form-section ${className}`.trim()}>{(title || description) && <header>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</header>}{children}</section>;
}

export function useDialogFocus<T extends HTMLElement = HTMLElement>(onClose: () => void, canClose = true) {
  const panelRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  closeRef.current = onClose;
  canCloseRef.current = canClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter((item) => !item.matches(':disabled') && !item.closest('[hidden], [inert], [aria-hidden="true"]') && item.getClientRects().length > 0);
    const initial = focusables();
    (initial.find((item) => item.matches('input, select, textarea') && !item.hasAttribute('readonly')) ?? initial[0] ?? panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (panel?.closest('[role="dialog"]') !== dialogs[dialogs.length - 1]) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (canCloseRef.current) closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (!panel?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus(); };
  }, []);
  return panelRef;
}

export function ModalShell({ title, onClose, children, labelledBy, describedBy, className = '', canClose = true, closeOnBackdrop = false }: { title: ReactNode; onClose: () => void; children: ReactNode; labelledBy?: string; describedBy?: string; className?: string; canClose?: boolean; closeOnBackdrop?: boolean }) {
  useModalScrollLock();
  const panelRef = useDialogFocus<HTMLDivElement>(onClose, canClose);
  const generatedId = useId().replace(/:/g, '');
  const titleId = labelledBy ?? `modal-title-${generatedId}`;
  const close = () => { if (canClose) onClose(); };
  return createPortal(<div className="mini-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} onClick={(event) => event.stopPropagation()} onMouseDown={(event) => { event.stopPropagation(); if (closeOnBackdrop && event.target === event.currentTarget) close(); }} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}><div ref={panelRef} tabIndex={-1} className={`modal-panel ${className}`.trim()}><header className="modal-header"><h3 id={titleId}>{title}</h3><button type="button" className="modal-close" onClick={close} disabled={!canClose} aria-label="Cerrar">×</button></header>{children}</div></div>, document.body);
}
