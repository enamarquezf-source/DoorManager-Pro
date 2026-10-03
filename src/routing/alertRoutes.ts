const alertRoutes: Record<string, (id: string) => string> = {
  work_orders: (id) => `/app/partes/${id}`,
  deficiencies: (id) => `/app/deficiencias/${id}`,
  equipment: (id) => `/app/equipos/${id}`,
  checks: (id) => `/app/checks/${id}`,
  clients: (id) => `/app/clientes/${id}`,
  sites: (id) => `/app/centros/${id}`,
  cases: (id) => `/app/expedientes/${id}`,
  documents: (id) => `/app/documentos/${id}`,
  invoices: (id) => `/app/modulos/facturacion?invoice=${encodeURIComponent(id)}`,
  customer_payments: (id) => `/app/modulos/cobros?payment=${encodeURIComponent(id)}`,
  supplier_invoices: (id) => `/app/modulos/facturas-proveedor?id=${encodeURIComponent(id)}`,
  supplier_payments: (id) => `/app/modulos/facturas-proveedor?id=${encodeURIComponent(id)}`,
  purchase_orders: (id) => `/app/modulos/compras?pedido=${encodeURIComponent(id)}`,
};

export function isSupportedAlertRoute(alert: any) {
  return Boolean(alert?.related_entity && alert?.related_id && alertRoutes[alert.related_entity]);
}

export function routeForAlert(alert: any) {
  if (!isSupportedAlertRoute(alert)) return alert?.related_entity ? `/app/avisos?entidad-no-soportada=${encodeURIComponent(String(alert.related_entity))}` : '/app/avisos';
  return alertRoutes[alert.related_entity](String(alert.related_id));
}

export function alertRouteFallbackReason(alert: any) {
  if (!alert?.related_entity) return 'Aviso sin entidad relacionada.';
  if (!alert?.related_id) return 'Aviso relacionado sin identificador de recurso.';
  if (!alertRoutes[alert.related_entity]) return `Entidad de aviso no soportada: ${alert.related_entity}.`;
  return null;
}
