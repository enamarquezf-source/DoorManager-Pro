export type ModuleMeta = {
  title: string;
  description: string;
  links: { label: string; to: string }[];
  permission: string[];
  visibility: string;
  /** Stable renderer key resolved by the application renderer registry. */
  renderer: string;
};

export type ModuleDefinition = ModuleMeta & {
  moduleId: string;
  route: string;
  workspace: string;
  renderer: string;
};

/** Canonical read contract shared by sidebar, route guards and renderers. */
export const moduleMeta: Record<string, ModuleMeta> = {
  'tipos-equipo': { title: 'Tipos de equipo', description: 'Catálogo técnico de tipos disponibles.', links: [], permission: ['sat.read'], visibility: 'sat', renderer: 'tipos-equipo' },
  planificacion: { title: 'Planificación', description: '', links: [{ label: 'Ver partes', to: '/app/partes' }], permission: ['sat.read'], visibility: 'sat', renderer: 'planificacion' },
  tecnicos: { title: 'Técnicos', description: '', links: [{ label: 'Partes sin asignar', to: '/app/partes?filtro=sin-asignar' }], permission: ['sat.read'], visibility: 'sat', renderer: 'tecnicos' },
  comerciales: { title: 'Comerciales', description: '', links: [], permission: ['commercial.read'], visibility: 'commercial', renderer: 'comerciales' },
  oportunidades: { title: 'Oportunidades', description: '', links: [{ label: 'Clientes', to: '/app/clientes' }], permission: ['commercial.read', 'sat.read', 'billing.read'], visibility: 'commercial', renderer: 'oportunidades' },
  presupuestos: { title: 'Presupuestos', description: '', links: [{ label: 'Deficiencias valorables', to: '/app/deficiencias' }], permission: ['commercial.read', 'sat.read', 'billing.read'], visibility: 'commercial', renderer: 'presupuestos' },
  materiales: { title: 'Materiales', description: '', links: [{ label: 'Partes con material', to: '/app/partes?filtro=material' }], permission: ['materials.read'], visibility: 'materials', renderer: 'materiales' },
  contratos: { title: 'Contratos', description: 'Contratos de mantenimiento y renovaciones.', links: [{ label: 'Clientes', to: '/app/clientes' }], permission: ['documents.read'], visibility: 'documents', renderer: 'operational' },
  visitas: { title: 'Visitas', description: 'Visitas comerciales y técnicas planificadas.', links: [{ label: 'Calendario SAT', to: '/app/modulos/planificacion' }], permission: ['commercial.read', 'sat.read'], visibility: 'commercial', renderer: 'operational' },
  'informes-comerciales': { title: 'Informes comerciales', description: 'Indicadores comerciales específicos.', links: [{ label: 'Inicio comercial', to: '/app/inicio' }], permission: ['commercial.read'], visibility: 'commercial', renderer: 'operational' },
  administracion: { title: 'Administración', description: 'Gestión administrativa interna.', links: [{ label: 'Documentos', to: '/app/documentos' }], permission: ['admin.users.read'], visibility: 'admin', renderer: 'administracion' },
  facturacion: { title: 'Facturación', description: 'Facturación y seguimiento administrativo de partes cerrados.', links: [{ label: 'Documentación', to: '/app/documentos' }], permission: ['billing.read'], visibility: 'billing', renderer: 'facturacion' },
  cobros: { title: 'Cobros', description: 'Seguimiento de cobros y avisos administrativos.', links: [{ label: 'Avisos', to: '/app/avisos' }], permission: ['billing.read'], visibility: 'billing', renderer: 'cobros' },
  'facturas-proveedor': { title: 'Facturas de proveedor', description: 'Obligaciones financieras de proveedores.', links: [{ label: 'Proveedores', to: '/app/modulos/proveedores' }], permission: ['supplier_invoices.read'], visibility: 'supplier_invoices', renderer: 'facturas-proveedor' },
  tesoreria: { title: 'Tesorería', description: 'Cuentas, movimientos y transferencias de la empresa.', links: [], permission: ['treasury.read'], visibility: 'treasury', renderer: 'tesoreria' },
  compras: { title: 'Compras', description: 'Pedidos de compra a proveedores.', links: [{ label: 'Proveedores', to: '/app/modulos/proveedores' }, { label: 'Materiales', to: '/app/modulos/materiales' }], permission: ['purchase_orders.read'], visibility: 'purchase_orders', renderer: 'compras' },
  proveedores: { title: 'Proveedores', description: 'Gestión de proveedores y documentación asociada.', links: [{ label: 'Documentos', to: '/app/documentos' }], permission: ['suppliers.read'], visibility: 'suppliers', renderer: 'proveedores' },
  prl: { title: 'PRL y personal', description: 'Prevención, documentación laboral y formación.', links: [{ label: 'Documentos', to: '/app/documentos' }], permission: ['documents.read'], visibility: 'documents', renderer: 'operational' },
  vehiculos: { title: 'Vehículos', description: 'Flota, revisiones y documentación de vehículos.', links: [{ label: 'Documentos', to: '/app/documentos' }], permission: ['documents.read'], visibility: 'documents', renderer: 'operational' },
  ventas: { title: 'Ventas', description: 'Indicadores de ventas y presupuestos aceptados.', links: [{ label: 'Gerencia', to: '/app/gerencia' }], permission: ['commercial.read', 'sat.read', 'billing.read'], visibility: 'commercial', renderer: 'ventas' },
  operaciones: { title: 'Operaciones', description: 'Visión ejecutiva de operaciones.', links: [{ label: 'Partes', to: '/app/partes' }], permission: ['sat.read', 'commercial.read', 'billing.read'], visibility: 'sat', renderer: 'operaciones' },
  rentabilidad: { title: 'Rentabilidad', description: 'Análisis de rentabilidad y desviaciones.', links: [{ label: 'Gerencia', to: '/app/gerencia' }], permission: ['billing.read', 'commercial.read', 'sat.read'], visibility: 'billing', renderer: 'rentabilidad' },
  personal: { title: 'Personal', description: 'Equipo humano, roles y carga de trabajo.', links: [{ label: 'Técnicos', to: '/app/modulos/tecnicos' }], permission: ['sat.read'], visibility: 'sat', renderer: 'personal' },
  informes: { title: 'Informes', description: 'Informes de dirección e indicadores agregados.', links: [{ label: 'Métricas', to: '/app/gerencia' }], permission: ['billing.read', 'commercial.read', 'sat.read'], visibility: 'billing', renderer: 'informes' },
  'tarifas-horas': { title: 'Tarifas horas', description: 'Catálogo de costes y precios horarios.', links: [], permission: ['billing.write'], visibility: 'billing', renderer: 'tarifas-horas' },
};

/** Single route/module/permission/renderer registry consumed by guards and navigation tooling. */
export const moduleRegistry: Record<string, ModuleDefinition> = Object.fromEntries(
  Object.entries(moduleMeta).map(([moduleId, meta]) => [moduleId, {
    ...meta,
    moduleId,
    route: `/app/modulos/${moduleId}`,
    workspace: meta.visibility,
    renderer: meta.renderer,
  }]),
) as Record<string, ModuleDefinition>;

export function moduleReadRequirements(moduleId: string) {
  return moduleMeta[moduleId]?.permission ?? [];
}

export function moduleVisibilityKey(moduleId: string) {
  return moduleMeta[moduleId]?.visibility ?? moduleId;
}
