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
  return {
    workOrder: workOrder?.id && workOrder?.code ? { label: workOrder.code, to: `/app/partes/${workOrder.id}` } : null,
    quote: quote?.id && quote?.code ? { label: quote.code, to: `/app/modulos/presupuestos/${quote.id}` } : null,
  };
}
