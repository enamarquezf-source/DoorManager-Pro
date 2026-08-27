export function normalizeParam(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function workOrderFilterFromParams(params: URLSearchParams) {
  const filter = normalizeParam(params.get('filtro'));
  const status = normalizeParam(params.get('estado'));
  const priority = normalizeParam(params.get('prioridad'));
  const date = normalizeParam(params.get('fecha'));
  if (['sin-asignar', 'checks-pendientes', 'pendientes-validacion'].includes(filter)) return filter;
  if (status === 'realizado') return 'finalizados';
  if (status === 'pendiente') return 'pendientes';
  if (status === 'en-curso') return 'en-curso';
  if (priority === 'critica' || priority === 'alta') return 'urgentes';
  if (date === 'hoy') return 'hoy';
  return 'todos';
}

export function deficiencyFiltersFromParams(params: URLSearchParams) {
  const state = normalizeParam(params.get('estado'));
  const severity = normalizeParam(params.get('gravedad'));
  const origin = normalizeParam(params.get('origen'));
  const shortcut = normalizeParam(params.get('filtro'));
  return {
    state: ['abierta', 'pendiente', 'valoracion', 'presupuestada', 'corregida', 'cerrada'].includes(state) ? state : shortcut === 'desviaciones' ? 'abierta' : 'todos',
    severity: ['baja', 'media', 'alta', 'critica'].includes(severity) ? severity : 'todas',
    origin: origin === 'oportunidad' ? 'oportunidad' : 'todos',
  };
}

export function isOpenDeficiencyStatus(status?: string | null) {
  return ['detectada', 'pendiente-de-valoracion', 'en-valoracion', 'pendiente', 'presupuestada', 'aceptada'].includes(normalizeParam(status));
}
