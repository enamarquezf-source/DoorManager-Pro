const economicReviewStatuses = ['Finalizado tecnicamente', 'Enviado', 'Cerrado', 'Devuelto por SAT'];

export function shouldLoadEconomicReviewDetail({ workspace, canReview, status, tab }: { workspace: string; canReview: boolean; status?: string; tab: string }) {
  return tab !== 'resumen' || (['sat', 'comercial', 'oficina', 'gerencia', 'superadmin'].includes(workspace) && canReview && economicReviewStatuses.includes(status ?? ''));
}
