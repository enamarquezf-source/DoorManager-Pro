import type { RoleName, Severity, Workspace } from './types';

export const workspaceTitles: Record<Workspace, string> = {
  superadmin: 'Propietario DMP',
  sat: 'Panel SAT',
  comercial: 'Panel comercial',
  oficina: 'Panel oficina',
  gerencia: 'Panel gerencia',
  tecnico: 'Trabajo técnico',
};

export const roleToWorkspace: Record<RoleName, Workspace> = {
  superadmin: 'superadmin',
  SAT: 'sat',
  Comercial: 'comercial',
  Oficina: 'oficina',
  Gerencia: 'gerencia',
  Tecnico: 'tecnico',
};

export const workspaceToRole: Record<Workspace, RoleName> = {
  superadmin: 'superadmin',
  sat: 'SAT',
  comercial: 'Comercial',
  oficina: 'Oficina',
  gerencia: 'Gerencia',
  tecnico: 'Tecnico',
};

export function fullName(row: { first_name?: string; last_name?: string; name?: string } | null | undefined) {
  if (!row) return 'Sin asignar';
  return row.name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
}

export function severityForPriority(value?: string | null): Severity {
  if (!value) return 'muted';
  if (['Critica', 'Crítica', 'Alta'].includes(value)) return 'danger';
  if (['Media', 'Normal'].includes(value)) return 'warn';
  if (value === 'Baja') return 'info';
  return 'muted';
}

export function severityForStatus(value?: string | null): Severity {
  const text = (value ?? '').toLowerCase();
  if (text.includes('cerrado') || text.includes('enviado') || text.includes('realizado') || text.includes('favorable')) return 'ok';
  if (text.includes('material') || text.includes('pendiente')) return 'warn';
  if (text.includes('intervencion') || text.includes('intervención') || text.includes('desplazamiento') || text.includes('curso')) return 'info';
  if (text.includes('averiado') || text.includes('critica') || text.includes('crítica')) return 'danger';
  return 'muted';
}

export function visibleLabel(value: string) {
  return ({ danger: 'Crítico', warn: 'Advertencia', info: 'Información', maintenance: 'Mantenimiento', commercial: 'Comercial', ok: 'Correcto', muted: 'Sin prioridad' } as Record<string, string>)[value] ?? value;
}

export function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES').format(new Date(value));
}

export function nextWorkOrderStatus(status: string) {
  const order = ['Pendiente', 'Trabajo descargado', 'En desplazamiento', 'En intervencion', 'Finalizado tecnicamente', 'Pendiente de envio', 'Enviado'];
  const index = order.indexOf(status);
  return order[Math.min(index + 1, order.length - 1)] ?? 'Trabajo descargado';
}

export function previousWorkOrderStatus(status: string) {
  const order = ['Pendiente', 'Trabajo descargado', 'En desplazamiento', 'En intervencion', 'Finalizado tecnicamente', 'Pendiente de envio', 'Enviado'];
  const index = order.indexOf(status);
  return index > 0 ? order[index - 1] : null;
}

export function displayStatus(status?: string | null) {
  return (status ?? 'Sin estado')
    .replace('superadmin', 'Propietario DMP')
    .replace('tecnico', 'Técnico')
    .replace('sat', 'SAT')
    .replace('comercial', 'Comercial')
    .replace('oficina', 'Oficina')
    .replace('gerencia', 'Gerencia')
    .replace('En intervencion', 'En intervención')
    .replace('Finalizado tecnicamente', 'Finalizado técnicamente')
    .replace('Pendiente de envio', 'Pendiente de envío')
    .replace('Devolucion solicitada', 'Devolución solicitada')
    .replace('Pendiente de revision', 'Pendiente de revisión')
    .replace('Critica', 'Crítica')
    .replace('Averia', 'Avería')
    .replace('Inspeccion', 'Inspección');
}
