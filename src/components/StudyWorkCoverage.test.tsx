import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { StudyWorkCoverage } from './StudyWorkCoverage';
import { emptyStudySources, type StudySources } from '../shared/costStudy';

describe('work coverage display', () => {
  it('shows work invoiced without time entries instead of limiting the company list to workers with time', () => {
    const sources: StudySources = { ...emptyStudySources(), work_scope_version: 2, works: [
      { id: 'w1', code: 'PAR-CON-HORAS', status: 'Cerrado', type: 'Correctivo', warranty: false, has_hours: true },
      { id: 'w2', code: 'PAR-SOLO-FACTURA', status: 'Cerrado', type: 'Correctivo', warranty: false, invoiced_in_period: true },
    ], time_entries: [{ id: 't1', work_order_id: 'w1', profile_id: 'p', work_date: '2026-10-01', duration_minutes: 120, hour_type: 'normal', total_cost: 40 }] };
    const html = renderToStaticMarkup(<MemoryRouter><StudyWorkCoverage sources={sources} /></MemoryRouter>);
    expect(html).toContain('PAR-SOLO-FACTURA');
    expect(html).toContain('Sin horas registradas');
    expect(html).toContain('Facturados en el periodo');
    expect(html).toContain('2 partes');
  });
  it('does not report zero invoiced works for legacy snapshots without invoice linkage', () => {
    const html = renderToStaticMarkup(<MemoryRouter><StudyWorkCoverage sources={emptyStudySources()} /></MemoryRouter>);
    expect(html).toContain('Sin desglose');
    expect(html).toContain('Esta captura solo contiene partes con horas');
  });
});
