import { describe, expect, it } from 'vitest';
import { technicianDayCounts, technicianDayEmptyMessage, technicianDayRows } from './technicianDayFilters';

const today = '2026-08-10';
const active = [
  { work_order_id: 'today', assignment_date: today, work_order_status: 'Pendiente', priority: 'Normal', planned_start_time: '08:00' },
  { work_order_id: 'yesterday', assignment_date: '2026-08-09', work_order_status: 'Pendiente', priority: 'Normal', planned_start_time: '09:00' },
  { work_order_id: 'tomorrow', assignment_date: '2026-08-11', work_order_status: 'Pendiente', priority: 'Normal', planned_start_time: '10:00' },
  { work_order_id: 'no-hour', assignment_date: today, work_order_status: 'Pendiente', priority: 'Normal', planned_start_time: null },
  { work_order_id: 'urgent', assignment_date: today, work_order_status: 'Pendiente', priority: 'Critica', planned_start_time: '11:00' },
  { work_order_id: 'course', assignment_date: today, work_order_status: 'En intervencion', priority: 'Normal', planned_start_time: '12:00' },
  { work_order_id: 'checks', assignment_date: today, work_order_status: 'Pendiente', priority: 'Normal', planned_start_time: '13:00', pending_checks_count: 1 },
];
const history = [
  { work_order_id: 'finished', assignment_date: today, work_order_status: 'Finalizado tecnicamente' },
  { work_order_id: 'unassigned', assignment_date: today, work_order_status: 'Pendiente', assignment_status: 'Desasignada' },
];

describe('technician day filters', () => {
  it('muestra hoy, anteriores, próximos, sin hora y urgentes sin ocultar activos', () => {
    expect(technicianDayRows('todos', active, history, today).map((row) => row.work_order_id)).toEqual(active.map((row) => row.work_order_id));
    expect(technicianDayRows('hoy', active, history, today).map((row) => row.work_order_id)).toContain('today');
    expect(technicianDayRows('anteriores', active, history, today).map((row) => row.work_order_id)).toEqual(['yesterday']);
    expect(technicianDayRows('proximos', active, history, today).map((row) => row.work_order_id)).toEqual(['tomorrow']);
    expect(technicianDayRows('sin-hora', active, history, today).map((row) => row.work_order_id)).toEqual(['no-hour']);
    expect(technicianDayRows('urgentes', active, history, today).map((row) => row.work_order_id)).toEqual(['urgent']);
  });

  it('mantiene finalizados y desasignados fuera de activos y dentro de historial', () => {
    expect(technicianDayRows('todos', active, history, today).some((row) => ['finished', 'unassigned'].includes(row.work_order_id))).toBe(false);
    expect(technicianDayRows('finalizados', active, history, today).map((row) => row.work_order_id)).toEqual(['finished', 'unassigned']);
  });

  it('calcula contadores por pestaña', () => {
    const counts = technicianDayCounts(active, history, today);
    expect(counts.todos).toBe(7);
    expect(counts.hoy).toBe(5);
    expect(counts.proximos).toBe(1);
    expect(counts.finalizados).toBe(2);
  });

  it('diagnostica vacío, filtro sin resultados, conexión y sesión/perfil', () => {
    expect(technicianDayEmptyMessage('todos', 0, 0)).toContain('No existen asignaciones activas');
    expect(technicianDayEmptyMessage('urgentes', 3, 0)).toContain('filtro no tiene resultados');
    expect(technicianDayEmptyMessage('todos', 0, 0, 'Failed to fetch')).toContain('No se han podido cargar los trabajos');
    expect(technicianDayEmptyMessage('todos', 0, 0, 'perfil activo no encontrado')).toContain('Sesión o perfil no válido');
  });
});
