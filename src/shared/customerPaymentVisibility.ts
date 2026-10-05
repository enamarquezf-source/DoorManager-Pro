export type CustomerPaymentInvoice = { id: string; status: string; paid_amount: unknown; total_amount: unknown };

export function customerPaymentVisibility(invoice: CustomerPaymentInvoice, pending: boolean, canRecord: boolean) {
  const outstanding = !['borrador', 'cancelada'].includes(invoice.status)
    && Number(invoice.paid_amount) < Number(invoice.total_amount);
  const recovery = pending && canRecord;
  return { visibleInCollections: outstanding || recovery, canOpenPayment: canRecord && (outstanding || recovery), recovery };
}
