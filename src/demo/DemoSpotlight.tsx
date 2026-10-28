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
  assignments: /^gestionar asignaciones$/i,
  completed_work: /^FINALIZAR TRABAJO EN CAMPO$/i,
  sat_approved: /^Enviar a destino$/i,
  ordered_purchases: /^Marcar pedido$/i,
  purchase_receipts: /^Registrar recepción$/i,
  times: /^(añadir|registrar) horas$/i,
  work_materials: /^Añadir material$/i,
  signatures: /^(añadir|guardar|registrar) firma/i,
  invoices: /^(preparar|crear|generar) (?:la |una )?factura/i,
  payments: /^registrar (?:un )?cobro/i,
};

export function isDemoTaskSurface(step:DemoStep,path:string) {
  if((step.goal==='checks'||step.goal==='photos')&&/^\/app\/checks\/[^/]+/.test(path))return true;
  const base=step.route.split('?')[0];return path===base||path.startsWith(base+'/');
}

// Prefer a concrete action. Inside a form, guide the current field or next button.
export function findDemoTarget(step: DemoStep): HTMLElement | null {
  const available = (element: HTMLElement) => !element.closest('.demo-guide, .demo-session-bar, .demo-role-menu, [hidden], [aria-hidden="true"]') && !(element as HTMLButtonElement).disabled && element.getClientRects().length > 0;
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .mini-modal')].filter(available);
  const dialog = dialogs.at(-1);
  if (dialog) {
    const inputs = [...dialog.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]),select,textarea')].filter(element=>available(element)&&!element.readOnly);
    const missing = inputs.find(element=>element.required && (element.type==='checkbox'?!element.checked:!element.value.trim()));
    return missing ?? inputs.find(element=>element===document.activeElement)
      ?? [...dialog.querySelectorAll<HTMLButtonElement>('form button')].find(element=>available(element)&&element.type==='submit') ?? null;
  }
  if (document.querySelector('[role="dialog"], .modal-overlay, .mini-modal, .overlay')) return null;
  if(step.title==='De campo a Oficina') {
    const example=[...document.querySelectorAll<HTMLElement>('main a[href*="/app/partes/"]')].find(element=>available(element)&&((element.getAttribute('aria-label')??'')+' '+element.textContent).includes('Cliente ejemplo Oficina 1'));
    if(example)return example;
  }
  if(step.title==='Comprueba los conceptos') {
    const review=document.querySelector<HTMLElement>('main .economic-review-panel');
    if(review&&available(review))return review;
  }
  if(step.title==='Cobros a la vista'||step.title==='Comprueba los pendientes') {
    const calendar=[...document.querySelectorAll<HTMLElement>('main button,main summary')].find(element=>available(element)&&/^Ver calendario$/.test((element.textContent??'').trim()));
    if(calendar)return calendar;
  }
  const reading:Record<string,RegExp>={'Analiza el tiempo':/^Últimos 3 meses$/,'Haz un estudio de costes':/^(Analizar periodo|Actualizar datos|Guardar estudio)$/,'Registra la factura del proveedor':/^(Crear factura proveedor|Registrar factura)$/,'Prepara un presupuesto':/^(Añadir concepto|Añadir línea|Crear presupuesto)$/,'Explora el contrato de mantenimiento':/^Nuevo contrato$/};
  if(reading[step.title]){const control=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&reading[step.title].test((element.textContent??'').trim()));if(control)return control;}
  if(step.goal==='purchase_orders') {const line=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^Añadir línea$/.test((element.textContent??'').trim()));if(line)return line;}
  if(step.goal==='checks') {
    const results=document.querySelector<HTMLElement>('main [data-demo-check-results]');if(results&&available(results))return results;
    const block=[...document.querySelectorAll<HTMLElement>('main a[href*="/bloque/"]')].filter(available);
    const pending=block.find(element=>/Sin revisar/.test(element.textContent??''));if(pending)return pending;
    if(block.length){const finish=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^(Finalizar check|Reintentar finalizar y enviar)$/.test((element.textContent??'').trim()));if(finish)return finish;}
  }
  if(step.title==='Entiende el margen'||step.title==='Compara margen y costes'||step.title==='Explora una empresa con actividad') {const work=[...document.querySelectorAll<HTMLElement>('main a[href*="/app/partes/"]')].find(available);if(work)return work;}
  if(step.title==='Comprueba las existencias'){const material=[...document.querySelectorAll<HTMLElement>('main a.material-row-link')].find(available);if(material)return material;}
  if(step.title==='Consulta el aviso'||step.title==='Revisión componente a componente') {
    const checksTab=document.querySelector<HTMLElement>('[data-tab="checks"]');
    if(checksTab&&available(checksTab)&&checksTab.getAttribute('aria-selected')!=='true')return checksTab;
  }
  if(step.goal==='work_notes') {
    const work=document.querySelector<HTMLElement>('textarea.technician-work-textarea');
    if(work&&available(work))return work;
  }
  if(step.goal==='signatures') {const name=[...document.querySelectorAll<HTMLInputElement>('main input')].find(element=>available(element)&&[...element.labels??[]].some(label=>/Nombre firmante/.test(label.textContent??'')));if(name)return name;}
  if(step.goal==='photos') {
    const photo=[...document.querySelectorAll<HTMLElement>('label.component-photo')].find(available);
    if(photo)return photo;
  }
  const action = step.goal && actions[step.goal];
  if (action) {
    const button = [...document.querySelectorAll<HTMLElement>('main button, main a')].find(element => available(element) && action.test((element.textContent ?? '').trim()));
    if (button) return button;
  }
  if(step.goal==='assignments') {
    const links=[...document.querySelectorAll<HTMLElement>('main a[href*="/app/partes/"]')].filter(available);
    const work=links.find(element=>((element.getAttribute('aria-label')??'')+' '+element.textContent).includes('Sin asignar'))??links[0];
    if(work)return work;
  }
  const selector = step.target.replaceAll('.page-head', '.page-head, .section-header');
  return [...document.querySelectorAll<HTMLElement>(selector)].find(available) ?? null;
}

export function DemoSpotlight({ step, number }: { step: DemoStep; number: number }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number; caption:string; modal:boolean; field:boolean } | null>(null);
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
      const modal = Boolean(target?.closest('[role="dialog"],.mini-modal'));
      const covered = !modal && bounds && guide && bounds.right > guide.left && bounds.left < guide.right && bounds.bottom > guide.top && bounds.top < guide.bottom;
      const visible = bounds && !covered && bounds.top >= barBottom + 6 && bounds.bottom <= window.innerHeight - 6 && bounds.left >= 0 && bounds.right <= window.innerWidth;
      const labelNode = target && 'labels' in target ? (target as HTMLInputElement).labels?.[0]?.cloneNode(true) as HTMLElement | undefined : undefined;
      labelNode?.querySelectorAll('input,select,textarea,svg,small').forEach(element=>element.remove());
      const label=(target?.getAttribute('aria-label') || labelNode?.textContent || target?.textContent || '').replace(/\s+/g,' ').trim();
      const field=Boolean(target?.matches('input,select,textarea'));
      const caption=field?'Completa '+label:label&&label.length<55?'Pulsa '+label:'Empieza aquí';
      const value = visible ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,caption,modal,field } : null;
      setRect(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'disabled'] });
    const resize = new ResizeObserver(schedule); resize.observe(document.body);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('focusin',schedule,true);
    update();
    return () => { observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); target?.classList.remove('demo-highlight'); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('input',schedule,true);document.removeEventListener('change',schedule,true);document.removeEventListener('focusin',schedule,true); };
  }, [step.target, step.goal, step.route]);
  if (!rect) return null;
  return createPortal(<div className={'demo-spotlight'+(rect.modal?' in-dialog':'')} aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}>{rect.field?<b className="demo-field-step">{number.toString().padStart(2,'0')}</b>:<span style={{ left: Math.min(0, window.innerWidth - rect.left - 285) }} className={`demo-spotlight-label${rect.top < window.innerHeight * .55 && rect.top + rect.height < window.innerHeight - 70 ? ' is-below' : ''}`}><MousePointer2 size={14} /><b>{number.toString().padStart(2, '0')}</b><span>{rect.caption}</span></span>}<i className="demo-spotlight-corner" /></div>, document.body);
}
