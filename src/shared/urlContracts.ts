import { normalizeParam } from './filters';

export const workOrderFilterValues = ['todos', 'sin-asignar', 'checks-pendientes', 'pendientes-validacion', 'material', 'no-terminados', 'revision-sat', 'revision-comercial', 'en-curso', 'finalizados', 'pendientes', 'urgentes', 'hoy'] as const;
export type WorkOrderFilterValue = (typeof workOrderFilterValues)[number];

export function workOrderFilterFromUrl(params: URLSearchParams): WorkOrderFilterValue {
  const filter = normalizeParam(params.get('filtro')) as WorkOrderFilterValue;
  if (workOrderFilterValues.includes(filter)) return filter;
  const status = normalizeParam(params.get('estado'));
  if (status === 'realizado') return 'finalizados';
  if (status === 'pendiente') return 'pendientes';
  if (status === 'en-curso') return 'en-curso';
  if (['critica', 'alta'].includes(normalizeParam(params.get('prioridad')))) return 'urgentes';
  if (normalizeParam(params.get('fecha')) === 'hoy') return 'hoy';
  return 'todos';
}

export function alertFilterFromUrl(params: URLSearchParams) {
  const priority = normalizeParam(params.get('prioridad'));
  const type = normalizeParam(params.get('tipo'));
  if (type === 'administrativo') return 'administrativos';
  if (priority === 'critica' || type === 'critico') return 'criticos';
  if (priority === 'alta') return 'alta';
  return 'todos';
}

export function documentAreaFromUrl(params: URLSearchParams) {
  const area = normalizeParam(params.get('area'));
  return ['compras', 'proveedores', 'facturacion'].includes(area) ? area : 'todos';
}

export function clientStatusFromUrl(params: URLSearchParams) {
  return normalizeParam(params.get('estado')) === 'activo' ? 'Activo' : 'Todos';
}
