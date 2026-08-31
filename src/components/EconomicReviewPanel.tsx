import { useState } from 'react';
import { workOrdersService } from '../services/workOrdersService';
import { normalizedRoleNames, canReviewWorkOrderEconomic } from '../auth/permissions';
import { economicDecisionFor, economicEntryRows, economicReviewSummary, type EconomicEntryDecision } from '../shared/economicReview';

function money(value: unknown) { return `${Number(value ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function roleOf(profile: any) { return normalizedRoleNames(profile?.primary_area, profile?.roles ?? []); }
function entryLabel(row: any) { return row.kind === 'time' ? 'HORAS' : row.kind === 'material' ? 'MATERIALES' : 'DESPLAZAMIENTOS / RECURSOS'; }

export function EconomicReviewPanel({ workOrder, profile, onChanged }: { workOrder: any; profile: any; onChanged: () => void }) {
  const rows = economicEntryRows(workOrder);
  const [decisions, setDecisions] = useState<EconomicEntryDecision[]>(() => rows.map(economicDecisionFor));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const roles = roleOf(profile);
  const canReview = canReviewWorkOrderEconomic(profile);
  const assignedCommercial = roles.includes('Comercial') && !roles.some((role) => ['superadmin', 'Gerencia'].includes(role)) && workOrder.current_responsible_id !== profile?.id;
  const summary = economicReviewSummary(workOrder, rows.map((row) => ({ ...row, ...decisions.find((decision) => decision.entry_id === row.id) })));
  if (!canReview || !['Finalizado tecnicamente', 'Enviado', 'Cerrado', 'Devuelto por SAT'].includes(workOrder?.status)) return null;

  const updateDecision = (entryId: string, patch: Partial<EconomicEntryDecision>) => setDecisions((current) => current.map((decision) => decision.entry_id === entryId ? { ...decision, ...patch } : decision));
  const submit = async () => {
    if (saving || assignedCommercial) return;
    if (!reason.trim()) { setError('El motivo de revisión económica es obligatorio.'); return; }
    setSaving(true); setError('');
    try { await workOrdersService.reviewWorkOrderEconomic(workOrder.id, decisions, reason.trim()); onChanged(); setReason(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar la revisión económica.'); }
    finally { setSaving(false); }
  };
  return <section className="card economic-review-panel"><header className="card-header"><div><p className="eyebrow">Revisión económica del parte</p><h3>{workOrder.code} · Economía y facturación</h3></div><strong>{workOrder.economic_review_status === 'approved' ? 'APROBADA' : 'PENDIENTE'}</strong></header><div className="stats-grid"><div className="metric warn"><span>Coste real</span><strong>{money(summary.realCost)}</strong></div><div className="metric info"><span>Venta propuesta</span><strong>{money(summary.proposedSale)}</strong></div><div className="metric commercial"><span>Venta aprobada</span><strong>{money(summary.approvedSale)}</strong></div><div className={summary.margin >= 0 ? 'metric ok' : 'metric danger'}><span>Margen</span><strong>{money(summary.margin)}</strong></div></div><p className="large-note">Presupuesto: {workOrder.quotes?.code ?? workOrder.quote_id ?? 'Sin presupuesto'} · Garantía: {workOrder.warranty ? 'Sí' : 'No'} · Facturable: {workOrder.billable === false ? 'No' : 'Sí'}</p><div className="economic-review-lines">{rows.map((row) => { const decision = decisions.find((item) => item.entry_id === row.id) ?? economicDecisionFor(row); const zeroPrice = decision.contributes_to_sale && decision.unit_price <= 0; const catalogPrice = row.kind === 'material' ? Number(row.materials?.price ?? 0) : 0; return <article key={`${row.kind}-${row.id}`}><div><span className="eyebrow">{entryLabel(row)}</span><strong>{row.description}</strong><p>{row.quantity.toLocaleString('es-ES')} {row.unit} · Coste {money(row.cost_unit)}/{row.unit} · Coste total {money(row.cost_total)} · Venta actual {money(row.sale_total)}</p><small>source: {decision.source}{row.quote_line_id ? ` · quote_line: ${row.quote_line_id}` : ''}{catalogPrice > 0 ? ` · Referencia catálogo actual: ${money(catalogPrice)} (no copiada)` : ''}</small></div><div className="economic-review-controls"><label>Precio venta snapshot<input type="number" min="0" step="0.01" value={decision.unit_price} onChange={(event) => updateDecision(row.id, { unit_price: Number(event.target.value) })} disabled={assignedCommercial} /></label><label className="check-consent"><input type="checkbox" checked={decision.contributes_to_sale} onChange={(event) => updateDecision(row.id, { contributes_to_sale: event.target.checked })} disabled={assignedCommercial} /> Facturable</label>{zeroPrice && <p className="form-error">Precio snapshot obligatorio para marcarlo como facturable.</p>}</div></article>; })}</div>{!rows.length && <p className="large-note">No hay conceptos económicos registrados.</p>}{assignedCommercial && <p className="state-warning">Parte asignado a otro Comercial. Solo el responsable o un supervisor puede aprobarlo.</p>}{canReview && !assignedCommercial && <><label>Motivo de revisión económica *<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Confirmación, cambio de precio o excepción" /></label><div className="actions"><button className="primary" onClick={submit} disabled={saving}>{saving ? 'Guardando...' : 'APROBAR ECONOMÍA'}</button></div></>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
