import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CostStudyInsights } from './CostStudyInsights';
import { calculateCostStudy, emptyStudyInputs, emptyStudySources, type StudyInputs } from '../shared/costStudy';

describe('company cost exploration', () => {
  it('weights company indicators by their denominators and explains incomplete employee coverage', () => {
    const sources = { ...emptyStudySources(), works: [{ id: 'w', code: 'PAR-1', status: 'Cerrado', type: 'Correctivo', warranty: false }], time_entries: [
      { id: 'a', profile_id: 'p', work_order_id: 'w', work_date: '2026-10-01', duration_minutes: 60, hour_type: 'normal', total_cost: 10 },
      { id: 'b', profile_id: 'q', work_order_id: 'w', work_date: '2026-10-01', duration_minutes: 180, hour_type: 'normal', total_cost: 30 },
      { id: 'c', profile_id: 'r', work_order_id: 'w', work_date: '2026-10-02', duration_minutes: 60, hour_type: 'normal', total_cost: 50 },
    ], materials: [{ id: 'm', work_order_id: 'w', total_cost: 100 }], resources: [{ id: 'r', work_order_id: 'w', total_cost: 50 }], invoices: [{ id: 'i', subtotal: 1000 }] };
    const inputs: StudyInputs = { ...emptyStudyInputs(), employees: [
      { profile_id: 'p', payroll_cost: 100, paid_hours: 2, presence_hours: 2, standard_completed_hours: 2, standard_basis: 'Dos tareas' },
      { profile_id: 'q', payroll_cost: 300, paid_hours: 4, presence_hours: 4, standard_completed_hours: 3, standard_basis: 'Tres tareas' },
    ] };
    const html = renderToStaticMarkup(<MemoryRouter><CostStudyInsights report={calculateCostStudy(sources, inputs)} sources={sources} inputs={inputs} onConfigure={() => {}} /></MemoryRouter>);
    expect(html).toContain('66,7 % de ocupación registrada');
    expect(html).toContain('125 % de eficiencia frente al estándar');
    expect(html).toContain('2 de 3 empleados con presencia informada');
    expect(html).toContain('2 de 3 empleados con estándar informado');
    expect(html).toContain('600,00'); // full labour 450 + materials 100 + resources 50
    expect(html).toContain('400,00'); // issued invoices minus studied costs
    expect(html).toContain('aria-pressed="true"');
  });

  it('does not invent productivity when the period has no activity or reference data', () => {
    const sources = emptyStudySources();
    const inputs = emptyStudyInputs();
    const html = renderToStaticMarkup(<MemoryRouter><CostStudyInsights report={calculateCostStudy(sources, inputs)} sources={sources} inputs={inputs} onConfigure={() => {}} /></MemoryRouter>);
    expect(html).toContain('Sin dato de ocupación registrada');
    expect(html).toContain('Sin dato de eficiencia frente al estándar');
    expect(html).toContain('No hay horas registradas');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});
