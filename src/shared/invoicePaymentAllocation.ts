export type InvoiceWorkOrderNet = { workOrderId: string; netAmount: number };

/** Contract mirrored by migration 147: net paid amount, excluding manual lines. */
export function allocateInvoicePaidAmount(invoiceSubtotal: number, invoiceTotal: number, paidAmount: number, lines: InvoiceWorkOrderNet[]) {
  const linkedNet = round(lines.reduce((sum, line) => sum + line.netAmount, 0));
  const paidNet = invoiceTotal > 0 ? round(Math.min(invoiceSubtotal, paidAmount / invoiceTotal * invoiceSubtotal)) : 0;
  const distributable = invoiceSubtotal > 0
    ? round(Math.min(linkedNet, paidNet * linkedNet / invoiceSubtotal))
    : 0;
  const ordered = [...lines].sort((a, b) => a.workOrderId.localeCompare(b.workOrderId));
  if (linkedNet <= 0 || distributable <= 0) return ordered.map((line) => ({ workOrderId: line.workOrderId, paidAmount: 0 }));
  let allocated = 0;
  return ordered.map((line, index) => {
    const amount = index === ordered.length - 1 ? round(distributable - allocated) : round(distributable * line.netAmount / linkedNet);
    const safe = Math.max(amount, 0);
    allocated = round(allocated + safe);
    return { workOrderId: line.workOrderId, paidAmount: safe };
  });
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
