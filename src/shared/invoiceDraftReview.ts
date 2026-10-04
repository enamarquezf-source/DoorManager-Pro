export type InvoiceLine = { work_order_id?: string | null; quantity: number; unit_price: number; discount: number; tax_rate: number };
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);

export function invoiceLineAmounts(line: InvoiceLine) {
  const base = cents(line.quantity * line.unit_price * (1 - line.discount / 100));
  const tax = cents((base / 100) * line.tax_rate / 100);
  return { subtotal: base / 100, tax: tax / 100, total: (base + tax) / 100 };
}

// The draft RPC refreshes the expected amount on save. Compare edited lines to
// today's approved sale, rather than the status of the previously loaded draft.
export function reviewInvoiceDraft(invoice: any, lines: InvoiceLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + cents(invoiceLineAmounts(line).subtotal), 0) / 100;
  const ids = [...new Set(lines.map((line) => line.work_order_id).filter(Boolean))];
  const strict = ids.length === 1 && lines.every((line) => Boolean(line.work_order_id));
  const work = invoice.context?.work_order;
  const expected = strict && work?.id === ids[0] && work.sale_amount != null ? Number(work.sale_amount) : null;
  return { subtotal, expected, mismatch: strict && (expected == null ? invoice.economic_detail_status === 'inconsistent' : cents(subtotal) !== cents(expected)) };
}
