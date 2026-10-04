export function isModernBillingRouting(workOrder: any) {
  return workOrder?.sat_review_status === 'approved'
    && ((workOrder?.sat_review_destination === 'facturacion')
      || (workOrder?.sat_review_destination === 'comercial' && workOrder?.commercial_review_status === 'approved'));
}

export function isBillingEligibleWithoutOffice(workOrder: any) {
  const modern = isModernBillingRouting(workOrder);
  const economicReady = ['pendiente_facturar', 'pendiente_validacion'].includes(workOrder?.economic_status);
  const approvedModern = workOrder?.economic_review_status === 'approved' && economicReady && modern;
  const legacy = workOrder?.economic_review_status === 'not_started'
    && workOrder?.economic_status === 'pendiente_facturar'
    && workOrder?.office_validation_status === 'validated';
  return workOrder?.billable !== false && Number(workOrder?.sale_amount ?? 0) > 0 && (approvedModern || legacy);
}

export function billingBlockers(workOrder: any): string[] {
  if (!workOrder) return ['No se ha podido comprobar la situación del parte.'];
  const reasons: string[] = [];
  if (workOrder.billable === false) reasons.push('Parte marcado como no facturable.');
  if (!(Number(workOrder.sale_amount ?? 0) > 0)) reasons.push('Falta un importe de venta aprobado mayor que cero.');
  if (!['pendiente_facturar', 'pendiente_validacion'].includes(workOrder.economic_status)) reasons.push('El estado económico del parte todavía no permite facturar.');
  if (workOrder.economic_review_status === 'approved') {
    if (!isModernBillingRouting(workOrder)) reasons.push('Falta completar la revisión SAT o Comercial y enviarlo a Facturación.');
  } else if (workOrder.economic_review_status === 'not_started' && workOrder.economic_status === 'pendiente_facturar') {
    if (workOrder.office_validation_status !== 'validated') reasons.push('Parte histórico pendiente de validación de Oficina.');
  } else reasons.push('Revisión económica pendiente de aprobación.');
  return reasons;
}
