import { useEffect, useRef, useState } from 'react';
import { workOrdersService } from '../services/workOrdersService';
import { normalizedRoleNames, canReviewWorkOrderEconomic } from '../auth/permissions';
import { economicDecisionFor, economicEntryRows, economicReviewSummary, reconcileEconomicDecisions, type EconomicEntryDecision } from '../shared/economicReview';

function money(value: unknown) { return `${Number(value ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function economicValue(value: unknown, configured: boolean, missing: string) { return configured ? money(value) : missing; }
function roleOf(profile: any) { return normalizedRoleNames(profile?.primary_area, profile?.roles ?? []); }
function entryLabel(row: any) { return row.kind === 'time' ? 'HORAS' : row.kind === 'material' ? 'MATERIALES' : 'DESPLAZAMIENTOS / RECURSOS'; }
function workerLabel(row: any) { return [row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(' ') || 'Técnico no informado'; }

export function EconomicReviewPanel({ workOrder, profile, onChanged }: { workOrder: any; profile: any; onChanged: () => void }) {
  const rows = economicEntryRows(workOrder);
  const [decisions, setDecisions] = useState<EconomicEntryDecision[]>(() => rows.map(economicDecisionFor));
  const previousWorkOrderId = useRef(workOrder?.id);
  const [reason, setReason] = useState('');
  const [zeroSaleConfirmed, setZeroSaleConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const roles = roleOf(profile);
  const canReview = canReviewWorkOrderEconomic(profile);
  const assignedCommercial = roles.includes('Comercial') && !roles.some((role) => ['superadmin', 'Gerencia'].includes(role)) && workOrder.current_responsible_id !== profile?.id;
  const approved = workOrder.economic_review_status === 'approved';
  const decisionsComplete = decisions.length > 0 && decisions.every((decision) => typeof decision.contributes_to_sale === 'boolean');
  const mergedRows = rows.map((row) => ({ ...row, ...decisions.find((decision) => decision.kind === row.kind && decision.entry_id === row.id) }));
  const summary = economicReviewSummary(workOrder, mergedRows);
  const needsZeroConfirmation = decisionsComplete && workOrder.billable !== false && workOrder.warranty !== true && summary.proposedSale === 0;
  const economicInputFingerprint = JSON.stringify({ id: workOrder?.id, billable: workOrder?.billable, warranty: workOrder?.warranty, quote_id: workOrder?.quote_id, quoted_sale_amount: workOrder?.quoted_sale_amount, rows: rows.map((row) => ({ kind: row.kind, id: row.id, quantity: row.quantity, unit_price: row.unit_price, source: row.source, contributes_to_sale: row.contributes_to_sale, sale_total: row.sale_total, cost_total: row.cost_total })) });
  useEffect(() => { const preserveExisting = previousWorkOrderId.current === workOrder?.id; setDecisions((current) => reconcileEconomicDecisions(rows, current, preserveExisting)); previousWorkOrderId.current = workOrder?.id; setZeroSaleConfirmed(false); }, [economicInputFingerprint]);
  if (!canReview || !['Finalizado tecnicamente', 'Enviado', 'Cerrado', 'Devuelto por SAT'].includes(workOrder?.status)) return null;

  const updateDecision = (kind: EconomicEntryDecision['kind'], entryId: string, patch: Partial<EconomicEntryDecision>) => { setZeroSaleConfirmed(false); setDecisions((current) => current.map((decision) => decision.kind === kind && decision.entry_id === entryId ? { ...decision, ...patch } : decision)); };
  const submit = async () => {
    if (saving || assignedCommercial || approved) return;
    if (!decisionsComplete) { setError('Selecciona Facturable Sí o No para cada concepto.'); return; }
    if (!reason.trim()) { setError('El motivo de revisión económica es obligatorio.'); return; }
    if (needsZeroConfirmation && !zeroSaleConfirmed) { setError('Confirma expresamente que la venta aprobada es 0,00 €.'); return; }
    setSaving(true); setError('');
    try { await workOrdersService.reviewWorkOrderEconomic(workOrder.id, decisions, reason.trim(), zeroSaleConfirmed); onChanged(); setReason(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar la revisión económica.'); }
    finally { setSaving(false); }
  };
  const renderRow = (row: any) => { const decision = decisions.find((item) => item.kind === row.kind && item.entry_id === row.id) ?? economicDecisionFor(row); const potential = Number((decision.unit_price * row.quantity).toFixed(2)); const enters = decision.contributes_to_sale === true; const saleConfigured = row.sale_unit_configured || decision.unit_price !== row.unit_price; return <article key={`${row.kind}-${row.id}`}><div><span className="eyebrow">{entryLabel(row)}</span><strong>{row.description}</strong>{row.kind === 'material' && <p>Cantidad técnica: {row.quantity.toLocaleString('es-ES')} {row.unit} · Stock: {row.stock_validation_status ?? 'Estado no informado'}</p>}{row.kind === 'time' && <p>Técnico: {workerLabel(row)} · {row.quantity.toLocaleString('es-ES')} {row.unit} · Tipo: {row.hour_type ?? 'no informado'}</p>}{row.kind === 'cost' && <p>Tipo: {row.cost_type ?? 'No informado'} · Cantidad: {row.quantity.toLocaleString('es-ES')} {row.unit}</p>}<p>Coste unitario: {economicValue(row.cost_unit, row.cost_unit_configured, row.kind === 'time' ? 'Tarifa interna no configurada' : 'Coste no configurado')} · Coste total: {economicValue(row.cost_total, row.cost_total_configured, 'Coste total pendiente')}</p><p>Venta unitaria: {saleConfigured ? money(decision.unit_price) : 'Tarifa de venta no configurada'} · Venta total propuesta: {saleConfigured ? money(potential) : 'Venta propuesta pendiente'}</p><small>Venta actual snapshot: {economicValue(row.sale_total, row.sale_total_configured, 'Venta snapshot no registrada')} · source: {decision.source}</small></div><div className="economic-review-controls"><label>Precio venta snapshot<input type="number" min="0" step="0.01" value={decision.unit_price} onChange={(event) => updateDecision(row.kind, decision.entry_id, { unit_price: Number(event.target.value) })} disabled={approved || assignedCommercial} /></label><div className="row-actions"><button type="button" className={decision.contributes_to_sale === false ? 'active' : ''} onClick={() => updateDecision(row.kind, decision.entry_id, { contributes_to_sale: false, decision: 'does_not_enter' })} disabled={approved || assignedCommercial}>Facturable: No</button><button type="button" className={enters ? 'primary' : ''} onClick={() => updateDecision(row.kind, decision.entry_id, { contributes_to_sale: true, decision: 'enters' })} disabled={approved || assignedCommercial}>Facturable: Sí</button></div><strong>{decision.contributes_to_sale === null ? 'PENDIENTE DE DECISIÓN' : enters ? `ENTRA EN VENTA: ${money(potential)}` : 'NO ENTRA EN VENTA'}</strong>{enters && decision.unit_price <= 0 && <small className="form-error">Precio snapshot obligatorio para un concepto que entra en venta.</small>}</div></article>; };
  const materialRows = rows.filter((row) => row.kind === 'material');
  const laborRows = rows.filter((row) => row.kind === 'time');
  const otherRows = rows.filter((row) => row.kind === 'cost');
  const reopen = async () => {
    const reopenReason = window.prompt('Motivo obligatorio de reapertura económica');
    if (!reopenReason?.trim()) return;
    setSaving(true); setError('');
    try { await workOrdersService.reopenWorkOrderEconomic(workOrder.id, reopenReason.trim()); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido reabrir la revisión económica.'); }
    finally { setSaving(false); }
  };
  return <section className="card economic-review-panel">
    <header className="card-header"><div><p className="eyebrow">Revisión económica del parte</p><h3>{workOrder.code} · Economía y facturación</h3></div><strong>{approved ? 'APROBADA' : workOrder.economic_review_status === 'returned' ? 'REABIERTA' : 'PENDIENTE'}</strong></header>
    <div className="stats-grid"><div className="metric warn"><span>Coste real</span><strong>{money(summary.realCost)}</strong></div><div className="metric info"><span>Venta propuesta</span><strong>{money(summary.proposedSale)}</strong></div><div className="metric commercial"><span>Venta aprobada</span><strong>{money(summary.approvedSale)}</strong></div><div className={summary.margin >= 0 ? 'metric ok' : 'metric danger'}><span>Margen</span><strong>{money(summary.margin)}</strong></div></div>
    <p className="large-note">Presupuesto: {workOrder.quotes?.code ?? workOrder.quote_id ?? 'Sin presupuesto'} · Garantía: {workOrder.warranty ? 'Sí' : 'No'} · Parte facturable: {workOrder.billable === false ? 'No' : 'Sí'}</p>
     <div className="economic-review-lines"><section><h4>MATERIALES</h4>{materialRows.length ? materialRows.map(renderRow) : <p className="large-note">Sin materiales reales registrados.</p>}</section><section><h4>MANO DE OBRA</h4>{laborRows.length ? laborRows.map(renderRow) : <p className="large-note">Sin horas técnicas registradas.</p>}</section><section><h4>OTROS COSTES</h4>{otherRows.length ? otherRows.map(renderRow) : <p className="large-note">Sin otros costes registrados.</p>}</section></div>
     {!rows.length && <p className="large-note">No hay conceptos económicos registrados. No se puede aprobar la revisión hasta que existan conceptos económicos.</p>}
     {approved ? <div className="actions"><button type="button" onClick={reopen} disabled={saving}>Reabrir revisión económica</button></div> : rows.length > 0 ? <><p className="large-note">Debes decidir explícitamente la facturabilidad de cada concepto antes de aprobar.</p>{needsZeroConfirmation && <label className="zero-sale-confirmation"><input type="checkbox" checked={zeroSaleConfirmed} onChange={(event) => setZeroSaleConfirmed(event.target.checked)} /> Confirmo que la venta aprobada es 0,00 € y que no hay líneas facturables.</label>}<label>Motivo de revisión<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{assignedCommercial && <p className="state-warning">Parte asignado a otro Comercial. Solo el responsable o un supervisor puede aprobarlo.</p>}<div className="modal-footer"><button type="button" className="primary" onClick={submit} disabled={saving || assignedCommercial}>{saving ? 'GUARDANDO...' : 'APROBAR REVISIÓN ECONÓMICA'}</button></div></> : null}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
