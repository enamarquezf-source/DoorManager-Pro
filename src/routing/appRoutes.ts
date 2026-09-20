import type { Workspace } from '../shared/types';

export const superadminSharedRoutes = [
  '/app/modulos/presupuestos',
  '/app/modulos/materiales',
  '/app/modulos/administracion',
  '/app/modulos/facturacion',
  '/app/modulos/cobros',
  '/app/modulos/compras',
  '/app/modulos/facturas-proveedor',
  '/app/modulos/rentabilidad',
  '/app/modulos/tarifas-horas',
  '/app/modulos/tipos-equipo',
  '/app/modulos/tesoreria',
] as const;

export function matchesRouteOrChild(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function homeRouteForWorkspace(workspace: Workspace) {
  if (workspace === 'tecnico') return '/app/tecnico';
  if (workspace === 'superadmin') return '/app/superadmin';
  return '/app/inicio';
}

export function entityRoute(workspace: Workspace, entity: 'clientes' | 'centros' | 'equipos' | 'partes' | 'checks', id: string) {
  const prefix = workspace === 'superadmin' ? '/app/superadmin' : '/app';
  return `${prefix}/${entity}/${id}`;
}

export type ManualRouteMatch =
  | { kind: 'technician-profile' | 'commercial-profile' | 'material' | 'quote'; id: string }
  | { kind: 'superadmin-client' | 'superadmin-site' | 'superadmin-equipment' | 'superadmin-work-order' | 'superadmin-case' | 'superadmin-check'; id: string }
  | { kind: 'superadmin-check-block'; id: string; blockId: string }
  | { kind: 'templates' | 'equipment-types' }
  | null;

const patterns: Array<[RegExp, (match: RegExpMatchArray) => ManualRouteMatch]> = [
  [/^\/app\/modulos\/tecnicos\/([^/]+)$/, (match) => ({ kind: 'technician-profile', id: match[1] })],
  [/^\/app\/modulos\/comerciales\/([^/]+)$/, (match) => ({ kind: 'commercial-profile', id: match[1] })],
  [/^\/app\/modulos\/materiales\/([^/]+)$/, (match) => ({ kind: 'material', id: match[1] })],
  [/^\/app\/modulos\/presupuestos\/([^/]+)$/, (match) => ({ kind: 'quote', id: match[1] })],
  [/^\/app\/superadmin\/clientes\/([^/]+)$/, (match) => ({ kind: 'superadmin-client', id: match[1] })],
  [/^\/app\/superadmin\/centros\/([^/]+)$/, (match) => ({ kind: 'superadmin-site', id: match[1] })],
  [/^\/app\/superadmin\/equipos\/([^/]+)$/, (match) => ({ kind: 'superadmin-equipment', id: match[1] })],
  [/^\/app\/superadmin\/partes\/([^/]+)$/, (match) => ({ kind: 'superadmin-work-order', id: match[1] })],
  [/^\/app\/superadmin\/expedientes\/([^/]+)$/, (match) => ({ kind: 'superadmin-case', id: match[1] })],
  [/^\/app\/superadmin\/checks\/([^/]+)\/bloque\/([^/]+)$/, (match) => ({ kind: 'superadmin-check-block', id: match[1], blockId: match[2] })],
  [/^\/app\/superadmin\/checks\/([^/]+)$/, (match) => ({ kind: 'superadmin-check', id: match[1] })],
];

export function parseManualRoute(pathname: string): ManualRouteMatch {
  if (pathname === '/app/plantillas') return { kind: 'templates' };
  if (pathname === '/app/modulos/tipos-equipo') return { kind: 'equipment-types' };
  for (const [pattern, createMatch] of patterns) {
    const match = pathname.match(pattern);
    if (match) return createMatch(match);
  }
  return null;
}
