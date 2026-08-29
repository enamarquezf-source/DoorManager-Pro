export function isPendingCommercialReview(workOrder: any, actor: any) {
  if (workOrder?.sat_review_status !== 'approved' || workOrder?.sat_review_destination !== 'comercial' || workOrder?.commercial_review_status !== 'pending') return false;
  const roles = [actor?.primary_area, ...(actor?.roles ?? [])].map((role) => String(typeof role === 'string' ? role : role?.name ?? '').toLowerCase());
  const supervisor = roles.some((role) => ['superadmin', 'gerencia'].includes(role));
  const commercial = roles.includes('comercial');
  return supervisor || (commercial && workOrder?.current_responsible_id === actor?.id);
}
