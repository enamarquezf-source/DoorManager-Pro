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
