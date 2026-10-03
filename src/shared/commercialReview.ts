export function isPendingCommercialReview(workOrder: any, actor: any) {
  if (workOrder?.sat_review_status !== 'approved' || workOrder?.sat_review_destination !== 'comercial' || workOrder?.commercial_review_status !== 'pending') return false;
  const roles = (actor?.roles ?? []).map((role: any) => String(typeof role === 'string' ? role : role?.name ?? '').toLowerCase());
  const supervisor = roles.includes('superadmin') || (roles.includes('gerencia') && hasPermission(actor, 'commercial.write'));
  const commercial = roles.includes('comercial') && hasPermission(actor, 'commercial.write');
  return supervisor || (commercial && workOrder?.current_responsible_id === actor?.id);
}
import { hasPermission } from '../auth/permissions';
