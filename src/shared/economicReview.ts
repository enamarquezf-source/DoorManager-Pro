export type EconomicEntryKind = 'time' | 'material' | 'cost';

export type EconomicEntryDecision = {
  kind: EconomicEntryKind;
  entry_id: string;
  contributes_to_sale: boolean | null;
  source: 'quote' | 'manual' | 'additional';
  unit_price: number;
  decision: 'enters' | 'does_not_enter' | null;
};

export function economicEntryRows(workOrder: any) {
  return [
    ...(workOrder?.time_entries ?? []).map((entry: any) => ({ ...entry, kind: 'time' as const, description: entry.description || 'Horas técnicas', quantity: Number(entry.duration_minutes ?? 0) / 60, unit: 'h', unit_price: Number(entry.hourly_price ?? 0), cost_unit: Number(entry.hourly_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0) })),
    ...(workOrder?.materials ?? []).map((entry: any) => ({ ...entry, kind: 'material' as const, description: entry.description || entry.materials?.description || 'Material', quantity: Number(entry.used_quantity ?? 0), unit: entry.unit || 'ud', unit_price: Number(entry.unit_price ?? 0), cost_unit: Number(entry.unit_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0) })),
    ...(workOrder?.cost_entries ?? []).map((entry: any) => ({ ...entry, kind: 'cost' as const, description: entry.description || entry.cost_type || 'Recurso / desplazamiento', quantity: Number(entry.quantity ?? 0), unit: entry.unit || 'ud', unit_price: Number(entry.unit_price ?? 0), cost_unit: Number(entry.unit_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0) })),
  ];
}

export function economicReviewSummary(workOrder: any, rows = economicEntryRows(workOrder)) {
  const realCost = rows.reduce((sum, row) => sum + Number(row.cost_total ?? 0), 0);
  const hasQuote = Boolean(workOrder?.quote_id || workOrder?.quotes?.id);
  const saleRows = rows.filter((row) => row.contributes_to_sale && (hasQuote ? row.source === 'additional' : row.source !== 'quote'));
  const proposedSale = hasQuote
    ? Number((Number(workOrder?.quoted_sale_amount ?? 0) + saleRows.reduce((sum, row) => sum + Number((row.unit_price * row.quantity).toFixed(2)), 0)).toFixed(2))
    : Number(saleRows.reduce((sum, row) => sum + Number((row.unit_price * row.quantity).toFixed(2)), 0).toFixed(2));
  const explicitDecision = rows.length > 0 && rows.every((row) => typeof row.contributes_to_sale === 'boolean');
  const approvedSale = explicitDecision ? proposedSale : Number(workOrder?.sale_amount ?? proposedSale);
  return { realCost: Number(realCost.toFixed(2)), proposedSale: Number(proposedSale.toFixed(2)), approvedSale: Number(approvedSale.toFixed(2)), margin: Number((approvedSale - realCost).toFixed(2)) };
}

export function economicDecisionFor(row: any): EconomicEntryDecision {
  return { kind: row.kind, entry_id: row.id, contributes_to_sale: null, decision: null, source: row.source ?? 'manual', unit_price: Number(row.unit_price ?? 0) };
}
