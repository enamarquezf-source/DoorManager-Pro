const assignableStates = ['Pendiente', 'Trabajo descargado', 'En desplazamiento', 'En intervencion', 'Pausado', 'Pendiente de material', 'Devuelto por SAT'];
export function canAssignTechnicalWorkOrder(workOrder: { status?: string; deleted_at?: string | null } | null | undefined) {
 return Boolean(workOrder && !workOrder.deleted_at && assignableStates.includes(workOrder.status ?? ''));
}
export const assignmentBlockedMessage = 'Este parte ya no admite trabajo técnico. Para una nueva intervención, crea otro parte o solicita su reapertura a SAT.';
