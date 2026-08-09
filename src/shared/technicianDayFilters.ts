export type TechnicianDayTab = 'todos' | 'hoy' | 'anteriores' | 'proximos' | 'urgentes' | 'curso' | 'checks' | 'sin-hora' | 'finalizados';

export const technicianDayTabs: [TechnicianDayTab, string][] = [
  ['todos', 'Todos activos'],
  ['hoy', 'Hoy'],
  ['anteriores', 'Anteriores pendientes'],
  ['proximos', 'Próximos'],
  ['urgentes', 'Urgentes'],
  ['curso', 'En curso'],
  ['checks', 'Checks pendientes'],
  ['sin-hora', 'Sin hora'],
  ['finalizados', 'Historial'],
];

const activeStates = ['Pendiente', 'Trabajo descargado', 'En desplazamiento', 'En intervencion', 'Pausado', 'Pendiente de material'];

export function technicianDayRows(tab: TechnicianDayTab, activeRows: any[], historyRows: any[], today: string) {
  const source = tab === 'finalizados' ? historyRows : activeRows;
  return source.filter((row) => {
    if (tab === 'todos') return true;
    if (tab === 'hoy') return row.assignment_date === today;
    if (tab === 'anteriores') return row.assignment_date < today && activeStates.includes(row.work_order_status);
    if (tab === 'proximos') return row.assignment_date > today;
    if (tab === 'urgentes') return ['Alta', 'Critica'].includes(row.priority);
    if (tab === 'curso') return ['En desplazamiento', 'En intervencion', 'Pausado', 'Pendiente de material'].includes(row.work_order_status);
    if (tab === 'checks') return Number(row.pending_checks_count ?? 0) > 0 || (row.check_status && row.check_status !== 'Realizado');
    if (tab === 'sin-hora') return !row.planned_start_time;
    return true;
  });
}

export function technicianDayCounts(activeRows: any[], historyRows: any[], today: string) {
  return Object.fromEntries(technicianDayTabs.map(([tab]) => [tab, technicianDayRows(tab, activeRows, historyRows, today).length])) as Record<TechnicianDayTab, number>;
}

export function technicianDayEmptyMessage(tab: TechnicianDayTab, activeCount: number, filteredCount: number, error?: string | null) {
  if (error) return /perfil|sesion|sesión|auth|jwt/i.test(error) ? `Sesión o perfil no válido: ${error}` : `Error al consultar Supabase: ${error}`;
  if (tab === 'todos' && activeCount === 0) return 'No existen asignaciones activas para tu perfil.';
  if (activeCount > 0 && filteredCount === 0) return 'Existen asignaciones activas, pero este filtro no tiene resultados.';
  return 'No hay datos para este filtro.';
}
