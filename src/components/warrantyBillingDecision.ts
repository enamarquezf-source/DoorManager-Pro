export async function runWarrantyDecisionOnce(
  pending: Set<string>,
  key: string,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (pending.has(key)) return false;
  pending.add(key);
  try {
    await operation();
    return true;
  } finally {
    pending.delete(key);
  }
}
