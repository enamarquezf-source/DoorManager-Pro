export type CollectionStatus = 'Pendiente' | 'Parcialmente cobrada' | 'Cobrada' | 'Vencida' | 'Cancelada';

export function collectionStatus(invoice: any, today = new Date()): CollectionStatus {
  if (invoice?.status === 'cancelada') return 'Cancelada';
  const total = Number(invoice?.total_amount ?? 0);
  const paid = Number(invoice?.paid_amount ?? 0);
  if (total > 0 && paid >= total) return 'Cobrada';
  const due = invoice?.due_date ? new Date(`${invoice.due_date}T00:00:00`) : null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (due && due < current && paid < total) return 'Vencida';
  if (paid > 0) return 'Parcialmente cobrada';
  return 'Pendiente';
}
