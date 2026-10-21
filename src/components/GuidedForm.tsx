import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Pencil } from 'lucide-react';

type Element = ReactElement<any>;
type Step = { title: string; description?: string; content: ReactNode };
export function FormStep({ children }: { title: string; description?: string; children: ReactNode }) { return <>{children}</>; }

function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => isValidElement(child) && child.type === Fragment ? flatten((child as Element).props.children) : [child]);
}
export function collectFormSteps(children: ReactNode): Step[] {
  const steps: Step[] = [];
  let pending: ReactNode[] = [];
  const flush = () => { if (pending.length) { steps.push({ title: steps.length ? 'Información adicional' : 'Datos principales', content: pending }); pending = []; } };
  for (const child of flatten(children)) {
    if (isValidElement(child) && (child.type === FormStep || typeof (child as Element).props.title === 'string')) {
      flush();
      const element = child as Element;
      steps.push({ title: element.props.title, description: element.props.description, content: element.type === FormStep ? element.props.children : element });
    } else pending.push(child);
  }
  flush();
  return steps.length ? steps : [{ title: 'Datos principales', content: null }];
}

type Review = { label: string; value: string; step: number };
export function readFormReview(form: HTMLFormElement): Review[] {
  const rows = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).flatMap(control => {
    if (control.matches('input[type="hidden"],input[type="password"],input[type="button"],input[type="submit"],input[type="reset"]') || control.closest('[data-review="omit"]')) return [];
    const step = control.closest<HTMLElement>('[data-guided-step]');
    if (!step) return [];
    const label = control.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    label?.querySelectorAll('input,select,textarea,button,svg,small').forEach(node => node.remove());
    const name = (control.getAttribute('aria-label') || label?.textContent || control.getAttribute('placeholder') || '').replace(/\s+/g, ' ').replace(/\s*\*$/, '').trim();
    if (!name) return [];
    let value = control.value;
    if (control instanceof HTMLSelectElement) value = control.value ? Array.from(control.selectedOptions).map(option => option.textContent).join(', ') : '';
    if (control instanceof HTMLInputElement) {
      if (control.type === 'checkbox' || control.type === 'radio') { if (!control.checked) return []; value = 'Sí'; }
      if (control.type === 'file') value = Array.from(control.files ?? []).map(file => file.name).join(', ');
      if (control.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = value.split('-').reverse().join('/');
    }
    return value.trim() ? [{ label: name, value, step: Number(step.dataset.guidedStep) }] : [];
  });
  form.querySelectorAll<HTMLElement>('[data-review-summary]').forEach(element => {
    const step = element.closest<HTMLElement>('[data-guided-step]');
    if (step) rows.push({label: element.dataset.reviewSummary || 'Selección', value: element.textContent?.trim() || 'Sin selección', step: Number(step.dataset.guidedStep)});
  });
  return rows;
}

/** Keeps every step mounted, so files, local drafts and dependent controls survive navigation. */
export function GuidedForm({ form, busy = false }: { form: Element; busy?: boolean }) {
  const root = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const submitting = useRef(false);
  const id = useId();
  const [step, setStep] = useState(0);
  const [review, setReview] = useState<Review[]>([]);
  const children = flatten(form.props.children);
  const footer = children.find(child => isValidElement(child) && (child as Element).props.className?.split(' ').includes('modal-footer')) as Element;
  const errors = children.filter(child => isValidElement(child) && ((child as Element).props.role === 'alert' || (child as Element).props.className?.split(' ').includes('form-error')));
  const content = children.filter(child => child !== footer && !errors.includes(child));
  const steps = collectFormSteps(content);
  const current = Math.min(step, steps.length);
  const reviewing = current === steps.length;
  useEffect(() => { if (moved.current) { heading.current?.focus(); heading.current?.scrollIntoView?.({ block: 'nearest' }); } }, [current]);
  useEffect(() => { if (!busy) submitting.current = false; }, [busy, errors.length]);
  const go = (next: number) => { moved.current = true; setStep(next); };
  const validate = (onlyStep?: number) => {
    const controls = Array.from(root.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea') ?? []);
    const invalid = controls.find(control => control.willValidate && (onlyStep === undefined || control.closest<HTMLElement>('[data-guided-step]')?.dataset.guidedStep === String(onlyStep)) && !control.validity.valid);
    if (!invalid) return true;
    go(Number(invalid.closest<HTMLElement>('[data-guided-step]')?.dataset.guidedStep ?? 0));
    requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
    return false;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submitting.current) return;
    if (!reviewing) {
      if (!validate(current)) return;
      if (current === steps.length - 1) {
        if (!validate()) return;
        if (root.current) setReview(readFormReview(root.current));
      }
      go(current + 1);
      return;
    }
    if (footer && flatten(footer.props.children).some(child => isValidElement(child) && child.type === 'button' && !['button','reset'].includes((child as Element).props.type) && (child as Element).props.disabled)) return;
    if (!validate()) return;
    // Each application handler still owns persistence, errors and retry identity.
    submitting.current = true;
    try { const result = form.props.onSubmit(event); Promise.resolve(result).then(() => { submitting.current = false; }, () => { submitting.current = false; }); }
    catch (error) { submitting.current = false; throw error; }
  };
  const footerItems = footer ? flatten(footer.props.children) : [];
  return cloneElement(form, { ref: (element: HTMLFormElement | null) => { root.current = element; const originalRef = form.props.ref; if (typeof originalRef === 'function') return originalRef(element); if (originalRef) originalRef.current = element; }, noValidate: true, onSubmit: submit, className: `${form.props.className ?? ''} guided-form`.trim() },
    <>
      <ol className="guided-progress" aria-label="Pasos del formulario">{[...steps.map(item => item.title), 'Revisión'].map((title, index) => <li key={index} className={index === current ? 'is-current' : index < current ? 'is-done' : ''} aria-current={index === current ? 'step' : undefined}><span>{index < current ? <Check size={14} aria-hidden="true"/> : index + 1}</span><span>{title}</span></li>)}</ol>
      <div className="guided-step-intro"><span className="study-eyebrow">PASO {current + 1} DE {steps.length + 1}</span><h3 ref={heading} tabIndex={-1}>{reviewing ? 'Revisa antes de guardar' : steps[current].title}</h3><p>{reviewing ? 'Comprueba los datos. Puedes volver a cualquier apartado para corregirlos.' : steps[current].description ?? 'Completa los datos que conozcas. Los campos con * son obligatorios.'}</p></div>
      {steps.map((item, index) => <div key={index} id={`${id}-step-${index}`} className="guided-step" data-guided-step={index} hidden={current !== index}><fieldset disabled={busy}>{item.content}</fieldset></div>)}
      {reviewing && <section className="guided-review" aria-label="Resumen antes de guardar">{steps.map((item, index) => <article key={index}><header><h4><ClipboardCheck size={17} aria-hidden="true"/>{item.title}</h4><button type="button" disabled={busy} onClick={() => go(index)}><Pencil size={14} aria-hidden="true"/>Editar</button></header><dl>{review.filter(row => row.step === index).map((row, position) => <div key={position}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>{!review.some(row => row.step === index) && <p>Sin datos adicionales. Se conservarán las opciones seleccionadas.</p>}</article>)}</section>}
      {errors}
      <div className="modal-footer guided-footer"><div>{current > 0 && <button type="button" disabled={busy} onClick={() => go(current - 1)}><ArrowLeft size={16} aria-hidden="true"/>Anterior</button>}{!reviewing && footerItems.filter(child => isValidElement(child) && (child as Element).props.type === 'button')}</div><span>Paso {current + 1} de {steps.length + 1}</span><div>{reviewing ? footerItems : <button type="submit" className="primary" disabled={busy}>{current === steps.length - 1 ? 'Revisar datos' : 'Siguiente'}<ArrowRight size={16} aria-hidden="true"/></button>}</div></div>
    </>);
}

/** Only normal data forms opt in; confirmation dialogs retain their original actions. */
export function guideModalChildren(children: ReactNode, busy: boolean): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement(child) || child.type !== 'form') return child;
    const form = child as Element;
    if (!form.props.onSubmit || form.props['data-guided'] === false || form.props['data-guided'] === 'false') return child;
    const footer = flatten(form.props.children).find(node => isValidElement(node) && (node as Element).props.className?.split(' ').includes('modal-footer')) as Element | undefined;
    if (!footer) return child;
    const submits = flatten(footer.props.children).filter(node => isValidElement(node) && node.type === 'button' && !['button', 'reset'].includes((node as Element).props.type));
    if (submits.length !== 1) return child;
    return <GuidedForm form={form} busy={busy}/>;
  });
}
