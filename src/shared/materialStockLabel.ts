export function materialStockLabel(row: { stock_validation_status?: string; stock_deducted_quantity?: number | string; stock_warehouse_id?: string | null }) {
  if (Number(row.stock_deducted_quantity ?? 0) > 0 && !row.stock_warehouse_id) return 'Descuento registrado sin trazabilidad por almacén';
  if (row.stock_validation_status === 'pending') return 'Pendiente de validar';
  if (row.stock_validation_status === 'rejected') return 'Consumo rechazado';
  if (row.stock_validation_status === 'validated') return 'Validado';
  return 'Estado no informado';
}
