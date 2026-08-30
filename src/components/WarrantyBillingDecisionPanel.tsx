import { useState } from 'react';
import { workOrdersService } from '../services/workOrdersService';

type BillingDecision = 'cubierto_garantia' | 'facturable';

export function WarrantyBillingDecisionPanel({ workOrder, lines, canDecide, onChanged }: { workOrder: any; lines: any[]; canDecide: boolean; onChanged: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!workOrder?.warranty || !canDecide || !lines.length) return null;
  const materialDecisions = workOrder.planned_material_decisions ?? workOrder.work_order_planned_material_decisions ?? [];
  const lineDecisions = workOrder.planned_quote_line_decisions ?? workOrder.work_order_quote_line_decisions ?? [];
  const setDecision = async (line: any, billingDecision: BillingDecision) => {
    const conceptType = line.line_type === 'material' || line.material_id ? 'planned_material' : 'quote_line';
    const key = `${conceptType}:${line.id}`;
    setSaving(key); setError('');
    try { await workOrdersService.setWarrantyBillingDecision(workOrder.id, conceptType, line.id, billingDecision); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se ha podido guardar la decisión de garantía.'); }
    finally { setSaving(null); }
  };
  return <section className="warranty-billing-decisions"><h4>DECISIÓN DE GARANTÍA</h4><p className="large-note">NULL significa cubierto por garantía por defecto.</p><div className="compact-list">{lines.filter((line: any) => !['fee', 'discount', 'labor'].includes(line.line_type)).map((line: any) => { const material = line.line_type === 'material' || line.material_id; const row = (material ? materialDecisions : lineDecisions).find((item: any) => item.quote_line_id === line.id); const decision = row?.billing_decision; const key = `${material ? 'planned_material' : 'quote_line'}:${line.id}`; return <article key={line.id}><strong>{line.description}</strong><p>{decision === 'facturable' ? 'Facturable' : 'Cubierto por garantía (por defecto)'}</p><div className="row-actions"><button disabled={saving === key} onClick={() => setDecision(line, 'cubierto_garantia')}>Cubierto por garantía</button><button className="primary" disabled={saving === key} onClick={() => setDecision(line, 'facturable')}>Facturable</button></div></article>; })}</div>{error && <p className="form-error">{error}</p>}</section>;
}
