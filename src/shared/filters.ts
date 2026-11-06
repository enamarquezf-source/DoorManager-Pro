export function normalizeParam(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
}

export function workOrderFilterFromParams(params: URLSearchParams) {
  const filter = normalizeParam(params.get('filtro'));
  const status = normalizeParam(params.get('estado'));
  const priority = normalizeParam(params.get('prioridad'));
  const date = normalizeParam(params.get('fecha'));
  if (['sin-asignar', 'checks-pendientes', 'pendientes-validacion', 'material', 'no-terminados', 'revision-sat', 'revision-comercial'].includes(filter)) return filter;
  if (status === 'realizado') return 'finalizados';
  if (status === 'pendiente') return 'pendientes';
  if (status === 'en-curso') return 'en-curso';
  if (priority === 'critica' || priority === 'alta') return 'urgentes';
  if (date === 'hoy') return 'hoy';
  return 'todos';
}

export function checkTabFromParams(params: URLSearchParams): 'pending' | 'done' {
  return normalizeParam(params.get('estado')) === 'realizado' ? 'done' : 'pending';
}

export function filterChecks<T extends {
  code?: string;
  client_name?: string;
  site_name?: string;
  equipment_name?: string;
  equipment_code?: string;
  work_order_code?: string;
  work_orders?: { code?: string };
  equipment?: {
    code?: string;
    brand?: string;
    model?: string;
    internal_location?: string;
    equipment_types?: { name?: string };
    clients?: { legal_name?: string };
    sites?: { name?: string };
  };
}>(checks: T[], search: string): T[] {
  const terms = search.trim().split(/\s+/).map(normalizeParam).filter(Boolean);
  if (!terms.length) return checks;
  return checks.filter(check => {
    const equipment = check.equipment;
    const fields = [
      check.client_name, check.site_name, equipment?.clients?.legal_name, equipment?.sites?.name,
      equipment?.brand, equipment?.model, equipment?.internal_location, equipment?.equipment_types?.name,
      check.equipment_name, check.equipment_code, equipment?.code, check.code, check.work_order_code, check.work_orders?.code,
    ].map(normalizeParam);
    return terms.every(term => fields.some(field => field.includes(term)));
  });
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
    responsibility: shortcut === 'sin-responsable' ? 'sin-responsable' : 'todos',
  };
}

export function isOpenDeficiencyStatus(status?: string | null) {
  return ['detectada', 'pendiente-de-valoracion', 'en-valoracion', 'pendiente', 'presupuestada', 'aceptada'].includes(normalizeParam(status));
}
