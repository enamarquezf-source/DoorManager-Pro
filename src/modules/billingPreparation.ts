export async function prepareInvoiceOnce<T>(pending: Set<string>, workOrderId: string, operation: () => Promise<T>) {
  if (pending.has(workOrderId)) return false;
  pending.add(workOrderId);
  try {
    await operation();
    return true;
  } finally {
    pending.delete(workOrderId);
  }
}
