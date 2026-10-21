import type { HrRecord } from './employeeHr';
export type StudyEmployeeInput = {
  profile_id: string;
  payroll_cost: number | null;
  paid_hours: number | null;
  presence_hours: number | null;
  standard_completed_hours: number | null;
  standard_basis: string;
  payroll_partial?: boolean;
  payroll_source?: 'auto'|'manual';
  paid_hours_manual?: boolean;
  presence_hours_manual?: boolean;
};
export type StudyInputs = {
  employees: StudyEmployeeInput[];
  overheads: { description: string; amount: number }[];
  cost_budget: number | null;
  notes: string;
};
export type StudySources = {
  profiles: { id: string; first_name: string; last_name: string }[];
  works: { id: string; code: string; status: string; type: string; warranty: boolean; estimated_duration_minutes?: number | null; has_hours?: boolean; has_materials?: boolean; has_resources?: boolean; invoiced_in_period?: boolean; completed_in_period?: boolean; scheduled_in_period?: boolean }[];
  time_entries: { id: string; profile_id: string; work_order_id: string; work_date: string; duration_minutes: number; hour_type: string; total_cost: number | null }[];
  materials: { id: string; work_order_id: string; total_cost: number | null }[];
  resources: { id: string; work_order_id: string; total_cost: number | null }[];
  invoices: { id: string; subtotal: number | null }[];
  captured_at: string;
  work_scope_version?: number;
  period_from?: string;
  period_to?: string;
  hr_payroll_records?: HrRecord[];
};
export const emptyStudyInputs = (): StudyInputs => ({ employees: [], overheads: [], cost_budget: null, notes: '' });
export const emptyStudySources = (): StudySources => ({ profiles: [], works: [], time_entries: [], materials: [], resources: [], invoices: [], captured_at: '' });
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const ratio = (numerator: number, denominator: number | null) => denominator != null && denominator > 0 ? numerator / denominator : null;
const finished = new Set(['Finalizado tecnicamente', 'Enviado', 'Cerrado']);

export function calculateCostStudy(sources: StudySources, inputs: StudyInputs) {
  const works = new Map(sources.works.map(work => [work.id, work]));
  const profiles = new Map(sources.profiles.map(profile => [profile.id, profile]));
  const entriesByEmployee = new Map<string, StudySources['time_entries']>();
  for (const entry of sources.time_entries) {
    const entries = entriesByEmployee.get(entry.profile_id) ?? [];
    entries.push(entry);
    entriesByEmployee.set(entry.profile_id, entries);
  }
  const configured = new Map(inputs.employees.map(input => [input.profile_id, input]));
  const ids = new Set([...entriesByEmployee.keys(), ...configured.keys()]);
  const employees = [...ids].map(id => {
    const profile = profiles.get(id);
    const input = configured.get(id);
    const entries = entriesByEmployee.get(id) ?? [];
    const hours = entries.reduce((sum, entry) => sum + n(entry.duration_minutes) / 60, 0);
    const travelHours = entries.filter(entry => entry.hour_type === 'desplazamiento').reduce((sum, entry) => sum + n(entry.duration_minutes) / 60, 0);
    const completedHours = entries.filter(entry => finished.has(works.get(entry.work_order_id)?.status ?? '') && entry.hour_type !== 'desplazamiento').reduce((sum, entry) => sum + n(entry.duration_minutes) / 60, 0);
    const warrantyHours = entries.filter(entry => works.get(entry.work_order_id)?.warranty).reduce((sum, entry) => sum + n(entry.duration_minutes) / 60, 0);
    const recordedCost = entries.reduce((sum, entry) => sum + n(entry.total_cost), 0);
    const payrollCost = input?.payroll_cost ?? null;
    const paidHours = input?.paid_hours ?? null;
    const presenceHours = input?.presence_hours ?? null;
    const standardHours = input?.standard_completed_hours ?? null;
    return {
      id, name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Empleado sin nombre',
      hours, travelHours, directHours: hours - travelHours, completedHours, warrantyHours, recordedCost,
      workCount: new Set(entries.map(entry => entry.work_order_id)).size,
      payrollCost, paidHours, presenceHours, standardHours,
      payrollPartial: input?.payroll_partial??false,
      labourCost: payrollCost ?? recordedCost,
      costPerPaidHour: payrollCost == null ? null : ratio(payrollCost, paidHours),
      costPerDirectHour: payrollCost == null ? null : ratio(payrollCost, hours - travelHours),
      occupation: ratio(hours, presenceHours),
      efficiency: standardHours == null || !input?.standard_basis.trim() ? null : ratio(standardHours, completedHours),
      missingCosts: entries.filter(entry => entry.total_cost == null).length,
      zeroCosts: entries.filter(entry => entry.total_cost != null && n(entry.total_cost) === 0).length,
      inconsistentHours: (presenceHours != null && hours > presenceHours + 0.01) || (presenceHours != null && paidHours != null && presenceHours > paidHours + 0.01),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const labourCost = employees.reduce((sum, employee) => sum + employee.labourCost, 0);
  const materialsCost = sources.materials.reduce((sum, row) => sum + n(row.total_cost), 0);
  const resourcesCost = sources.resources.reduce((sum, row) => sum + n(row.total_cost), 0);
  const overheadCost = inputs.overheads.reduce((sum, row) => sum + n(row.amount), 0);
  const invoiceAmount = sources.invoices.reduce((sum, row) => sum + n(row.subtotal), 0);
  const totalCost = labourCost + materialsCost + resourcesCost + overheadCost;
  return {
    employees, labourCost, materialsCost, resourcesCost, overheadCost, totalCost, invoiceAmount,
    invoiceBalance: invoiceAmount - totalCost,
    budgetDeviation: inputs.cost_budget == null ? null : totalCost - inputs.cost_budget,
    missingPayroll: employees.filter(employee => employee.payrollCost == null||employee.payrollPartial).length,
    missingCosts: sources.materials.concat(sources.resources).filter(row => row.total_cost == null).length,
    zeroCosts: sources.materials.concat(sources.resources).filter(row => row.total_cost != null && n(row.total_cost) === 0).length,
  };
}

export function validateStudyInputs(inputs: StudyInputs, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Selecciona un periodo válido.');
  for (const date of [from, to]) {
    const parsed = new Date(date);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Selecciona un periodo válido.');
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!Number.isFinite(days) || days > 366) throw new Error('El periodo no puede superar 366 días.');
  const nonnegative = (value: number | null) => value == null || (Number.isFinite(value) && value >= 0 && value <= 1e12);
  if (!nonnegative(inputs.cost_budget)) throw new Error('El presupuesto de coste no es válido.');
  const ids = new Set<string>();
  for (const employee of inputs.employees) {
    if (ids.has(employee.profile_id)) throw new Error('Hay empleados duplicados.');
    ids.add(employee.profile_id);
    if (![employee.payroll_cost, employee.paid_hours, employee.presence_hours, employee.standard_completed_hours].every(nonnegative)) throw new Error('Los importes y horas deben ser números positivos o cero.');
    if ((employee.paid_hours ?? 0) > days * 24 || (employee.presence_hours ?? 0) > days * 24) throw new Error('Las horas superan la duración del periodo.');
    if (employee.standard_completed_hours != null && !employee.standard_basis.trim()) throw new Error('Explica cómo se han obtenido las horas estándar del trabajo terminado.');
  }
  if (inputs.overheads.some(row => !row.description.trim() || row.amount == null || !nonnegative(row.amount))) throw new Error('Cada gasto general necesita un concepto y un importe válido.');
}
