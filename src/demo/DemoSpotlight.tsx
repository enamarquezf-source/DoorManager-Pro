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
  completed_work: /^(Finalizar trabajo en campo|Finalizar parte)$/i,
  sat_approved: /^Enviar a destino$/i,
  ordered_purchases: /^Marcar pedido$/i,
  purchase_receipts: /^Registrar recepción$/i,
  times: /^(añadir|registrar) horas$/i,
  work_materials: /^Añadir material$/i,
  signatures: /^(añadir|guardar|registrar) firma/i,
  invoices: /^(preparar|crear|generar) (?:la |una )?factura/i,
  payments: /^registrar (?:un )?cobro/i,
};

export function isDemoTaskSurface(step:DemoStep,location:string) {
  const current=new URL(location,'https://dmp.local');
  if((step.goal==='checks'||step.goal==='photos')&&/^\/app\/checks\/[^/]+/.test(current.pathname))return true;
  const expected=new URL(step.route,'https://dmp.local');
  if(current.pathname!==expected.pathname&&!current.pathname.startsWith(expected.pathname+'/'))return false;
  return ['vista','id','nuevo','order','supplier'].every(key=>!expected.searchParams.has(key)||current.searchParams.get(key)===expected.searchParams.get(key));
}

// Prefer a concrete action. Inside a form, guide the current field or next button.
export function findDemoTarget(step: DemoStep): HTMLElement | null {
  const available = (element: HTMLElement) => !element.closest('.demo-guide, .demo-session-bar, .demo-role-menu, [hidden], [aria-hidden="true"]') && !element.matches(':disabled') && element.getClientRects().length > 0;
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .mini-modal')].filter(available);
  const dialog = dialogs.at(-1);
  if (dialog) {
    const inputs = [...dialog.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]),select,textarea')].filter(element=>available(element)&&!element.readOnly);
    const missing = inputs.find(element=>element.required && (element.type==='checkbox'?!element.checked:!element.value.trim()));
    const next=[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(element=>available(element)&&/^(Siguiente|Revisar datos)$/.test((element.textContent??'').trim()));
    return missing ?? next
      ?? [...dialog.querySelectorAll<HTMLButtonElement>('form button')].find(element=>available(element)&&element.type==='submit')
      ?? inputs.find(element=>element===document.activeElement) ?? null;
  }
  if (document.querySelector('[role="dialog"], .modal-overlay, .mini-modal, .overlay')) return null;
  if(step.goal==='sat_approved') {
    const review=document.querySelector<HTMLElement>('main [data-economic-review="pending"]');
    if(review&&available(review))return review;
  }
  if(step.title==='De campo a Oficina'||step.title==='Recibe un trabajo revisado') {
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
  if(step.title==='Registra la factura del proveedor') {
    const empty=document.querySelector('main [data-invoice-has-lines="false"]');
    if(empty){const description=[...empty.querySelectorAll<HTMLInputElement>('input')].find(input=>available(input)&&[...input.labels??[]].some(label=>/Descripción/.test(label.textContent??'')));if(description)return description;}
    const account=document.querySelector<HTMLSelectElement>('main .supplier-payment-entry select');if(account&&available(account)&&!account.value)return account;
    const payment=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^Registrar pago$/.test((element.textContent??'').trim()));if(payment)return payment;
  }
  if(step.title==='Haz un estudio de costes') {
    const study=document.querySelector<HTMLElement>('main .cost-study-panel');
    if(study) {
      const controls=[...study.querySelectorAll<HTMLButtonElement>('button')].filter(available);
      const save=controls.find(button=>button.textContent?.trim()==='Guardar estudio');
      if(save) {
        const missing=[...study.querySelectorAll<HTMLInputElement>('input[required]')].find(input=>available(input)&&!input.value.trim());
        return missing??save;
      }
      return controls.find(button=>button.textContent?.trim()==='Analizar periodo')
        ??controls.find(button=>button.textContent?.trim()==='Nuevo estudio')
        ??null;
    }
  }
  const reading:Record<string,RegExp>={'Analiza el tiempo':/^Últimos 3 meses$/,'Registra la factura del proveedor':/^(Crear factura proveedor|Registrar factura)$/,'Prepara un presupuesto':/^(Añadir concepto|Añadir línea|Crear presupuesto)$/,'Explora el contrato de mantenimiento':/^Nuevo contrato$/};
  if(reading[step.title]){const control=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&reading[step.title].test((element.textContent??'').trim()));if(control)return control;}
  if(['Registra el envío del presupuesto','Simula la aceptación del cliente','Convierte el presupuesto en trabajo'].includes(step.title)){
    if(step.title==='Simula la aceptación del cliente'){const status=document.querySelector<HTMLElement>('main .status-selector select');if(status&&available(status))return status;}
    const label=step.title==='Convierte el presupuesto en trabajo'?'Generar parte':'Marcar como enviado';const action=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&(element.textContent??'').trim()===label);if(action)return action;
    const quote=[...document.querySelectorAll<HTMLElement>('main a[href*="/app/modulos/presupuestos/"]')].find(available);if(quote)return quote;
  }
  if(step.goal==='purchase_orders') {const line=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^Añadir línea$/.test((element.textContent??'').trim()));if(line)return line;}
  if(step.goal==='checks') {
    const results=document.querySelector<HTMLElement>('main [data-demo-check-results]');
    if(results&&available(results)) {
      const affected=document.querySelector<HTMLElement>('main .check-affected-items');
      if(affected&&available(affected)) {
        if(!affected.querySelector('.check-affected-choice input:checked'))return affected;
        const note=[...affected.querySelectorAll<HTMLTextAreaElement>('.check-item-note textarea')].find(element=>available(element)&&!element.value.trim());
        if(note)return note;
        const remaining=affected.querySelector<HTMLInputElement>('.check-remaining-choice input');
        if(remaining&&available(remaining)&&!remaining.checked)return remaining.closest<HTMLElement>('label');
      }
      const selected=results.querySelector('button.active');
      if(selected&&!/^Sin revisar$/.test((selected.textContent??'').trim())) {
        const confirm=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^Confirmar selección$/.test((element.textContent??'').trim()));
        if(confirm)return confirm;
      }
      return results;
    }
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
  if(step.goal==='signatures') {
    const name=[...document.querySelectorAll<HTMLInputElement>('main input')].find(element=>available(element)&&[...element.labels??[]].some(label=>/Nombre firmante/.test(label.textContent??'')));
    if(name&&!name.value.trim())return name;
    const pad=document.querySelector<HTMLElement>('main .signature-pad[data-has-ink="false"]');if(pad&&available(pad))return pad;
    const consent=document.querySelector<HTMLInputElement>('main .signature-consent input[type="checkbox"]');if(consent&&available(consent)&&!consent.checked)return consent.closest<HTMLElement>('label');
    const save=[...document.querySelectorAll<HTMLElement>('main button')].find(element=>available(element)&&/^Guardar firma(?: local)?$/.test((element.textContent??'').trim()));if(save)return save;
    if(name)return name;
  }
  if (step.goal === 'times') {
    const summary = document.querySelector<HTMLElement>('main details:not([open]) > summary[data-demo-hours]');
    if (summary && available(summary)) return summary;
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
  if(step.goal==='checks'&&step.target==='.work-order-check-link') {
    return [...document.querySelectorAll<HTMLElement>(step.target)].find(element=>available(element)&&!/Finalizado/.test(element.textContent??''))??null;
  }
  const selector = step.target.replaceAll('.page-head', '.page-head, .section-header');
  return [...document.querySelectorAll<HTMLElement>(selector)].find(available) ?? null;
}

export function checkTaskHint(target:HTMLElement|null) {
  if(target?.matches('.check-affected-items'))return 'Selecciona solo el componente afectado';
  if(target?.matches('.check-item-note textarea'))return 'Describe qué le ocurre a ese componente';
  if(target?.matches('.check-remaining-choice'))return 'Confirma los demás solo si los has revisado';
  if(target?.matches('button')&&/^Confirmar selección$/.test((target.textContent??'').trim()))return 'Guarda este bloque para continuar';
  return 'Elige el resultado de este bloque';
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
      const caption=target?.matches('canvas.signature-pad')?'Dibuja aquí la firma':target?.matches('label.signature-consent')?'Marca esta casilla cuando hayas revisado el parte':target?.matches('.check-affected-items,.check-remaining-choice')?checkTaskHint(target):field?'Completa '+label:label&&label.length<55?'Pulsa '+label:'Empieza aquí';
      const value = visible ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,caption,modal,field } : null;
      setRect(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'disabled', 'open'] });
    const resize = new ResizeObserver(schedule); resize.observe(document.body);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('focusin',schedule,true);
    update();
    return () => { observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); target?.classList.remove('demo-highlight'); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('input',schedule,true);document.removeEventListener('change',schedule,true);document.removeEventListener('focusin',schedule,true); };
  }, [step.target, step.goal, step.route]);
  if (!rect) return null;
  return createPortal(<div className={'demo-spotlight'+(rect.modal?' in-dialog':'')} aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}>{rect.field?<b className="demo-field-step">{number.toString().padStart(2,'0')}</b>:<span style={{ left: Math.min(0, window.innerWidth - rect.left - 285) }} className={`demo-spotlight-label${rect.top < window.innerHeight * .55 && rect.top + rect.height < window.innerHeight - 70 ? ' is-below' : ''}`}><MousePointer2 size={14} /><b>{number.toString().padStart(2, '0')}</b><span>{rect.caption}</span></span>}<i className="demo-spotlight-corner" /></div>, document.body);
}
