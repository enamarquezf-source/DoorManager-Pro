export function userFacingErrorMessage(error: unknown, fallback = 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.') {
  const detail = error instanceof Error ? error.message : '';
  if (/create purchase order|update purchase order|add purchase order line|dmp_create_purchase_order/i.test(detail)) return 'No tienes permisos para crear o modificar pedidos de compra.';
  if (/supplier.*(invalid|not found|company)|proveedor.*(invalido|no valido)/i.test(detail)) return 'El proveedor seleccionado no está disponible.';
  if (/warehouse.*(invalid|company)|almacen.*(invalido|empresa)/i.test(detail)) return 'El almacén seleccionado no pertenece a la empresa.';
  if (/permission|not allowed|permiso/i.test(detail)) return 'No tienes permisos para completar esta operación.';
  return fallback;
}
