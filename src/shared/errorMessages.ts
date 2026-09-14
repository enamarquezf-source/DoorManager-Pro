export function userFacingErrorMessage(error: unknown, fallback = 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.') {
  const detail = error instanceof Error ? error.message : '';
  if (/supplier.*(invalid|not found|company)|proveedor.*(invalido|no valido)/i.test(detail)) return 'El proveedor seleccionado no está disponible.';
  if (/warehouse.*(invalid|company)|almacen.*(invalido|empresa)/i.test(detail)) return 'El almacén seleccionado no pertenece a la empresa.';
  if (/permission denied|not allowed|permiso|insufficient privilege/i.test(detail)) {
    if (/create purchase order/i.test(detail)) return 'No tienes permisos para crear pedidos de compra.';
    if (/purchase order|pedido de compra/i.test(detail)) return 'No tienes permisos para realizar esta operación sobre pedidos de compra.';
    return 'No tienes permisos para completar esta operación.';
  }
  return fallback;
}
