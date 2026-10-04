export type EconomicEntryKind = 'time' | 'material' | 'cost';

export type EconomicEntryDecision = {
  kind: EconomicEntryKind;
  entry_id: string;
  contributes_to_sale: boolean | null;
  source: 'quote' | 'manual' | 'additional';
  unit_price: number;
  decision: 'enters' | 'does_not_enter' | null;
};

// Legacy entries can contain default zeros without an economic rate snapshot.
// A zero backed by a rate version remains a valid amount, including free rates.
export function needsTimeRateRepair(entry: any) {
  return Number(entry.duration_minutes ?? 0) > 0 && !entry.rate_version_id
    && (entry.source == null || entry.source === 'manual')
    && [entry.hourly_cost, entry.hourly_price, entry.total_cost, entry.total_price]
      .every((value) => value == null || Number(value) === 0);
}

export function economicReviewReadiness(workOrder: any, rows: any[], decisions: EconomicEntryDecision[]) {
  const costComplete = rows.every((row) => row.cost_total_configured && !(row.kind === 'time' && needsTimeRateRepair(row)));
  const decisionsComplete = decisions.length > 0 && decisions.every((decision) => typeof decision.contributes_to_sale === 'boolean');
  const hasQuote = Boolean(workOrder?.quote_id || workOrder?.quotes?.id);
  const quoteConfigured = !hasQuote || workOrder?.quoted_sale_amount != null;
  const saleComplete = decisionsComplete && quoteConfigured && decisions.every((decision) => {
    if (!decision.contributes_to_sale || (hasQuote ? decision.source !== 'additional' : decision.source === 'quote')) return true;
    return Number.isFinite(decision.unit_price) && decision.unit_price > 0;
  });
  const approved = workOrder?.economic_review_status === 'approved';
  return { costComplete, saleComplete, approvedSaleConfigured: approved && workOrder?.sale_amount != null, marginConfigured: approved && workOrder?.sale_amount != null && costComplete };
}

export function economicEntryRows(workOrder: any) {
  return [
    ...(workOrder?.time_entries ?? []).map((entry: any) => ({ ...entry, kind: 'time' as const, description: entry.description || 'Horas técnicas', quantity: Number(entry.duration_minutes ?? 0) / 60, unit: 'h', unit_price: Number(entry.hourly_price ?? 0), cost_unit: Number(entry.hourly_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0), cost_unit_configured: entry.hourly_cost != null, sale_unit_configured: entry.hourly_price != null, cost_total_configured: entry.total_cost != null, sale_total_configured: entry.total_price != null })),
    ...(workOrder?.materials ?? []).map((entry: any) => ({ ...entry, kind: 'material' as const, description: entry.description || entry.materials?.description || 'Material', quantity: Number(entry.used_quantity ?? 0), unit: entry.unit || 'ud', unit_price: Number(entry.unit_price ?? 0), cost_unit: Number(entry.unit_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0), cost_unit_configured: entry.unit_cost != null, sale_unit_configured: entry.unit_price != null, cost_total_configured: entry.total_cost != null, sale_total_configured: entry.total_price != null })),
    ...(workOrder?.cost_entries ?? []).map((entry: any) => ({ ...entry, kind: 'cost' as const, description: entry.description || entry.cost_type || 'Recurso / desplazamiento', quantity: Number(entry.quantity ?? 0), unit: entry.unit || 'ud', unit_price: Number(entry.unit_price ?? 0), cost_unit: Number(entry.unit_cost ?? 0), cost_total: Number(entry.total_cost ?? 0), sale_total: Number(entry.total_price ?? 0), cost_unit_configured: entry.unit_cost != null, sale_unit_configured: entry.unit_price != null, cost_total_configured: entry.total_cost != null, sale_total_configured: entry.total_price != null })),
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
  const approvedSale = workOrder?.economic_review_status === 'approved'
    ? Number(workOrder?.sale_amount ?? 0)
    : 0;
  return { realCost: Number(realCost.toFixed(2)), proposedSale: Number(proposedSale.toFixed(2)), approvedSale: Number(approvedSale.toFixed(2)), margin: Number((approvedSale - realCost).toFixed(2)) };
}

export function economicDecisionFor(row: any): EconomicEntryDecision {
  return { kind: row.kind, entry_id: row.id, contributes_to_sale: null, decision: null, source: row.source ?? 'manual', unit_price: Number(row.unit_price ?? 0) };
}

export function reconcileEconomicDecisions(rows: any[], current: EconomicEntryDecision[], preserveExisting = true): EconomicEntryDecision[] {
  const existing = preserveExisting
    ? new Map(current.map((decision) => [`${decision.kind}:${decision.entry_id}`, decision]))
    : new Map<string, EconomicEntryDecision>();
  const reconciled = rows.map((row) => existing.get(`${row.kind}:${row.id}`) ?? economicDecisionFor(row));
  return reconciled.every((decision, index) => decision === current[index]) && reconciled.length === current.length ? current : reconciled;
}
