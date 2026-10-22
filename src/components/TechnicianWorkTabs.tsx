import { useId, useRef, type ReactNode, type KeyboardEvent } from 'react';

export type TechnicianWorkTab = 'work' | 'checks' | 'records' | 'close';
type Panel = { id: TechnicianWorkTab; label: string; detail: string; icon: ReactNode; content: ReactNode };

export function TechnicianWorkTabs({ panels, active, onChange, staged = false }: { panels: Panel[]; active: TechnicianWorkTab; onChange: (id: TechnicianWorkTab) => void; staged?: boolean }) {
  const id = useId();
  const nav = useRef<HTMLDivElement>(null);
  const stageFor = (tab: TechnicianWorkTab) => tab === 'work' || tab === 'checks' ? 'field' : 'report';
  const stage = stageFor(active);
  const lastTab = useRef<Record<'field' | 'report', TechnicianWorkTab>>({ field: 'work', report: 'records' });
  lastTab.current[stage] = active;
  const visiblePanels = staged ? panels.filter(panel => stageFor(panel.id) === stage) : panels;
  const select = (next: TechnicianWorkTab, focus = false) => {
    onChange(next);
    requestAnimationFrame(() => {
      if (focus) nav.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
      nav.current?.scrollIntoView?.({ block: 'start' });
    });
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % visiblePanels.length : event.key === 'ArrowLeft' ? (index + visiblePanels.length - 1) % visiblePanels.length : event.key === 'Home' ? 0 : event.key === 'End' ? visiblePanels.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); select(visiblePanels[next].id, true);
  };
  return <div className={`technician-work-flow${staged ? ' technician-staged-flow' : ''}`} data-stage={stage}>
    <div ref={nav} className="technician-work-navigation">
      {staged && <div className="technician-stage-switch" role="group" aria-label="Momento de la intervención">
        <button type="button" data-stage="field" aria-pressed={stage === 'field'} onClick={() => select(lastTab.current.field)}><span className="technician-stage-number" aria-hidden="true">01</span><span><strong>En campo</strong><small>Consultar y revisar</small></span></button>
        <button type="button" data-stage="report" aria-pressed={stage === 'report'} onClick={() => select(lastTab.current.report)}><span className="technician-stage-number" aria-hidden="true">02</span><span><strong>Completar parte</strong><small>Registrar y cerrar</small></span></button>
      </div>}
    <div className={`technician-work-tabs${staged ? ' technician-work-subtabs' : ''}`} role="tablist" aria-label={staged ? stage === 'field' ? 'Trabajo en campo' : 'Registro de la intervención' : 'Secciones del parte'}>
      {panels.map(panel => <button type="button" role="tab" key={panel.id} id={`${id}-tab-${panel.id}`} data-tab={panel.id} hidden={staged && stageFor(panel.id) !== stage} aria-controls={`${id}-panel-${panel.id}`} aria-selected={active === panel.id} tabIndex={active === panel.id ? 0 : -1} onClick={() => select(panel.id)} onKeyDown={event => keyDown(event, visiblePanels.findIndex(row => row.id === panel.id))}>
        {panel.icon}<span>{panel.label}</span><small>{panel.detail}</small>
      </button>)}
    </div>
    </div>
    {panels.map(panel => <div key={panel.id} id={`${id}-panel-${panel.id}`} className="technician-work-panel" role="tabpanel" aria-labelledby={`${id}-tab-${panel.id}`} tabIndex={0} hidden={active !== panel.id}>
      {panel.content}
    </div>)}
    {staged && stage === 'field' && <button type="button" className="technician-stage-next" onClick={() => select(lastTab.current.report)}><span><strong>Completar parte</strong><small>Cuando termines: trabajo realizado, horas y material</small></span><span aria-hidden="true">→</span></button>}
  </div>;
}
