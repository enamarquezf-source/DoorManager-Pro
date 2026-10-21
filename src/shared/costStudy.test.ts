import { describe, expect, it } from 'vitest';
import { calculateCostStudy, emptyStudyInputs, emptyStudySources, validateStudyInputs, type StudyEmployeeInput } from './costStudy';

const employee = (values: Partial<StudyEmployeeInput> = {}): StudyEmployeeInput => ({ profile_id: 'p', payroll_cost: null, paid_hours: null, presence_hours: null, standard_completed_hours: null, standard_basis: '', ...values });
function sources() {
  return { ...emptyStudySources(),
    profiles: [{ id: 'p', first_name: 'Ana', last_name: 'Pérez' }],
    works: [{ id: 'w', code: 'P1', status: 'Cerrado', type: 'Correctivo', warranty: false }],
    time_entries: [
      { id: 't1', profile_id: 'p', work_order_id: 'w', work_date: '2026-10-01', duration_minutes: 120, hour_type: 'normal', total_cost: 40 },
      { id: 't2', profile_id: 'p', work_order_id: 'w', work_date: '2026-10-01', duration_minutes: 60, hour_type: 'desplazamiento', total_cost: 20 },
    ],
    materials: [{ id: 'm', work_order_id: 'w', total_cost: 100 }],
    resources: [{ id: 'r', work_order_id: 'w', total_cost: 50 }],
    invoices: [{ id: 'i', subtotal: 1000 }],
  };
}

describe('cost and productivity study', () => {
  it('replaces imputed labour with complete payroll without double counting; includes general costs and budget', () => {
    const report = calculateCostStudy(sources(), { ...emptyStudyInputs(), employees: [employee({ payroll_cost: 300, paid_hours: 8, presence_hours: 6, standard_completed_hours: 3, standard_basis: 'Tres tareas de una hora' })], overheads: [{ description: 'Alquiler del periodo', amount: 25 }], cost_budget: 400 });
    expect(report).toMatchObject({ labourCost: 300, materialsCost: 100, resourcesCost: 50, overheadCost: 25, totalCost: 475, invoiceBalance: 525, budgetDeviation: 75, missingPayroll: 0 });
    expect(report.employees[0]).toMatchObject({ hours: 3, directHours: 2, travelHours: 1, completedHours: 2, occupation: 0.5, efficiency: 1.5, costPerPaidHour: 37.5, costPerDirectHour: 150, workCount: 1 });
  });
  it('includes payroll for staff with no work entries and does not fabricate ratios with missing or zero denominators', () => {
    const report = calculateCostStudy(emptyStudySources(), { ...emptyStudyInputs(), employees: [employee({ payroll_cost: 800, paid_hours: 0, presence_hours: 0 })] });
    expect(report.totalCost).toBe(800);
    expect(report.employees[0]).toMatchObject({ hours: 0, efficiency: null, occupation: null, costPerPaidHour: null, costPerDirectHour: null });
  });
  it('uses imputed costs only when payroll is unknown and preserves an explicitly confirmed zero payroll', () => {
    expect(calculateCostStudy(sources(), emptyStudyInputs())).toMatchObject({ labourCost: 60, missingPayroll: 1 });
    expect(calculateCostStudy(sources(), { ...emptyStudyInputs(), employees: [employee({ payroll_cost: 0 })] })).toMatchObject({ labourCost: 0, missingPayroll: 0 });
  });
  it('keeps team hours by worker and excludes unfinished work and travel from the efficiency denominator', () => {
    const data = sources();
    data.works.push({ id: 'open', code: 'P2', status: 'En intervencion', type: 'Correctivo', warranty: true });
    data.time_entries.push({ id: 't3', profile_id: 'p', work_order_id: 'open', work_date: '2026-10-02', duration_minutes: 60, hour_type: 'normal', total_cost: 20 });
    data.time_entries.push({ id: 't4', profile_id: 'q', work_order_id: 'w', work_date: '2026-10-02', duration_minutes: 60, hour_type: 'normal', total_cost: 20 });
    const report = calculateCostStudy(data, { ...emptyStudyInputs(), employees: [employee({ standard_completed_hours: 2, standard_basis: 'Tareas terminadas del periodo' })] });
    expect(report.employees.find(row => row.id === 'p')).toMatchObject({ hours: 4, completedHours: 2, efficiency: 1, warrantyHours: 1, workCount: 2 });
    expect(report.employees.find(row => row.id === 'q')).toMatchObject({ hours: 1, efficiency: null });
  });
  it('surfaces missing and zero costs, and impossible presence instead of silently treating them as complete data', () => {
    const data = sources();
    data.time_entries[0].total_cost = null as any;
    data.time_entries[1].total_cost = 0;
    data.materials[0].total_cost = null as any;
    data.resources[0].total_cost = 0;
    const report = calculateCostStudy(data, { ...emptyStudyInputs(), employees: [employee({ presence_hours: 1 })] });
    expect(report).toMatchObject({ missingCosts: 1, zeroCosts: 1 });
    expect(report.employees[0]).toMatchObject({ missingCosts: 1, zeroCosts: 1, inconsistentHours: true });
  });
});

describe('study validation', () => {
  it('accepts a leap-year interval of 366 days and rejects longer or reversed intervals', () => {
    expect(() => validateStudyInputs(emptyStudyInputs(), '2024-01-01', '2024-12-31')).not.toThrow();
    expect(() => validateStudyInputs(emptyStudyInputs(), '2024-01-01', '2025-01-01')).toThrow();
    expect(() => validateStudyInputs(emptyStudyInputs(), '2026-11-01', '2026-10-01')).toThrow();
    expect(() => validateStudyInputs(emptyStudyInputs(), '2026-02-30', '2026-03-01')).toThrow();
  });
  it.each([-1, Infinity, NaN])('rejects invalid costs: %s', value => {
    expect(() => validateStudyInputs({ ...emptyStudyInputs(), employees: [employee({ payroll_cost: value })] }, '2026-10-01', '2026-10-31')).toThrow();
  });
  it('requires a standard basis and rejects duplicates or hours outside the period', () => {
    expect(() => validateStudyInputs({ ...emptyStudyInputs(), employees: [employee({ standard_completed_hours: 4 })] }, '2026-10-01', '2026-10-31')).toThrow(/estándar/);
    expect(() => validateStudyInputs({ ...emptyStudyInputs(), employees: [employee(), employee()] }, '2026-10-01', '2026-10-31')).toThrow(/duplicados/);
    expect(() => validateStudyInputs({ ...emptyStudyInputs(), employees: [employee({ paid_hours: 25 })] }, '2026-10-01', '2026-10-01')).toThrow(/superan/);
  });
});
