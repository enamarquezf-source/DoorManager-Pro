export const movementLabels: Record<string, string> = {
  Entrada: 'Entrada',
  Salida: 'Salida',
  Reserva: 'Reserva',
  Devolucion: 'Devolución de material',
  Ajuste: 'Ajuste manual',
  'Consumo en parte': 'Consumo en parte',
};

export function movementLabel(type?: string | null) {
  return movementLabels[type ?? ''] ?? type ?? 'Movimiento';
}

export function movementDirection(type?: string | null) {
  return ['Entrada', 'Devolucion'].includes(type ?? '') ? 'Entrada' : ['Salida', 'Consumo en parte'].includes(type ?? '') ? 'Salida' : 'Ajuste';
}

export function movementDisplayQuantity(type: string | null | undefined, quantity: number | string | null | undefined) {
  const amount = Math.abs(Number(quantity ?? 0));
  return movementDirection(type) === 'Salida' ? -amount : amount;
}

export function movementLinks(movement: any) {
  const workOrder = movement?.work_orders;
  const quote = workOrder?.quotes;
  const receipt = movement?.purchase_receipts;
  const purchaseOrder = movement?.purchase_orders;
  return {
    workOrder: workOrder?.id && workOrder?.code ? { label: workOrder.code, to: `/app/partes/${workOrder.id}` } : null,
    quote: quote?.id && quote?.code ? { label: quote.code, to: `/app/modulos/presupuestos/${quote.id}` } : null,
    ...(receipt?.id && receipt?.code ? { receipt: { label: receipt.code, to: `/app/modulos/compras?pedido=${movement.purchase_order_id}` } } : {}),
    ...(purchaseOrder?.id && purchaseOrder?.code ? { purchaseOrder: { label: purchaseOrder.code, to: `/app/modulos/compras?pedido=${purchaseOrder.id}` } } : {}),
  };
}

export function movementOrigin(movement: any) {
  const links = movementLinks(movement);
  if (links.receipt) return { ...links.receipt, text: `Recepción ${links.receipt.label}` };
  if (links.workOrder) return { ...links.workOrder, text: `Parte ${links.workOrder.label}` };
  if (links.purchaseOrder) return { ...links.purchaseOrder, text: `Pedido ${links.purchaseOrder.label}` };
  const source = [movement?.source, movement?.notes].filter(Boolean).join(' ').toLowerCase();
  if (source.includes('initial') || source.includes('legacy')) return { text: 'Importación inicial', technical: movement.source };
  if (source.includes('adjust')) return { text: 'Ajuste de stock', technical: movement.source };
  return { text: 'Movimiento manual', technical: movement.source };
}

export function movementReason(movement: any) {
  const reason = String(movement?.notes ?? '').trim();
  if (!reason) return 'Sin motivo informado';
  if (/legacy_migration|initial stock|initial-batch/i.test(reason)) return 'Importación inicial';
  return reason.replace(/\s*batch=[0-9a-f-]{20,}/ig, '').replace(/\s+/g, ' ').trim() || 'Sin motivo informado';
}
