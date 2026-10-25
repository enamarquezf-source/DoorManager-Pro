import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2 } from 'lucide-react';
import type { DemoStep } from './model';

const actions: Record<string, RegExp> = {
  clients: /^(crear|nuevo|añadir) cliente$/i,
  sites: /^(crear|nuevo|añadir) centro(?: de trabajo)?$/i,
  works: /^(crear|nuevo) parte$/i,
  catalog_materials: /^(crear|nuevo) material$/i,
  suppliers: /^(crear|nuevo) proveedor$/i,
  purchase_orders: /^nuevo pedido$/i,
};

// Prefer the actual action over a whole page heading. Never point through a form.
export function findDemoTarget(step: DemoStep): HTMLElement | null {
  if (document.querySelector('[role="dialog"], .modal-overlay, .mini-modal, .overlay')) return null;
  const available = (element: HTMLElement) => !element.closest('.demo-guide, .demo-session-bar, .demo-role-menu') && !element.hidden && element.getAttribute('aria-hidden') !== 'true' && !(element as HTMLButtonElement).disabled && element.getClientRects().length > 0;
  const action = step.goal && actions[step.goal];
  if (action) {
    const button = [...document.querySelectorAll<HTMLElement>('main button, main a')].find(element => available(element) && action.test((element.textContent ?? '').trim()));
    if (button) return button;
  }
  const selector = step.target.replaceAll('.page-head', '.page-head, .section-header');
  return [...document.querySelectorAll<HTMLElement>(selector)].find(available) ?? null;
}

export function DemoSpotlight({ step, number }: { step: DemoStep; number: number }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    let frame = 0;
    let target: HTMLElement | null = null;
    const update = () => {
      frame = 0;
      const next = findDemoTarget(step);
      if (next !== target) { target?.classList.remove('demo-highlight'); target = next; target?.classList.add('demo-highlight'); }
      const bounds = target?.getBoundingClientRect();
      const barBottom = document.querySelector('.demo-session-bar')?.getBoundingClientRect().bottom ?? 0;
      const guide = document.querySelector('.demo-guide')?.getBoundingClientRect();
      const covered = bounds && guide && bounds.right > guide.left && bounds.left < guide.right && bounds.bottom > guide.top && bounds.top < guide.bottom;
      const visible = bounds && !covered && bounds.top >= barBottom + 6 && bounds.bottom <= window.innerHeight - 6 && bounds.left >= 0 && bounds.right <= window.innerWidth;
      const value = visible ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height } : null;
      setRect(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'disabled'] });
    const resize = new ResizeObserver(schedule); resize.observe(document.body);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    update();
    return () => { observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); target?.classList.remove('demo-highlight'); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [step.target, step.goal, step.route]);
  if (!rect) return null;
  return createPortal(<div className="demo-spotlight" aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}><span style={{ left: Math.min(0, window.innerWidth - rect.left - 205) }} className={`demo-spotlight-label${rect.top < 145 ? ' is-below' : ''}`}><MousePointer2 size={14} /><b>{number.toString().padStart(2, '0')}</b> Tu siguiente paso</span><i className="demo-spotlight-corner" /></div>, document.body);
}
