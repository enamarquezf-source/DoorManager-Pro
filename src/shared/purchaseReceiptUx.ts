export function receiptCostSource(line: any): number | null {
  const supplierRelation = Array.isArray(line.material_suppliers) ? line.material_suppliers[0] : line.material_suppliers;
  const candidates = [line.unit_purchase_price, supplierRelation?.purchase_unit_price, line.materials?.cost];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate)));
  return value === undefined ? null : Number(value);
}

export function initialReceiptCost(line: any, existingLine?: any): string {
  if (existingLine?.actual_unit_cost !== null && existingLine?.actual_unit_cost !== undefined) return String(existingLine.actual_unit_cost);
  const value = receiptCostSource(line);
  return value === null ? '' : String(value);
}

export function receiptLineProgress(line: any, receivedBefore: number) {
  const ordered = Number(line.ordered_quantity ?? 0);
  const received = Number(receivedBefore ?? 0);
  return { ordered, received, pending: Math.max(0, ordered - received) };
}
