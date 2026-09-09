const economicReviewStatuses = ['Finalizado tecnicamente', 'Enviado', 'Cerrado', 'Devuelto por SAT'];

export function shouldLoadEconomicReviewDetail({ workspace, canReview, status, tab }: { workspace: string; canReview: boolean; status?: string; tab: string }) {
  return tab !== 'resumen' || (workspace === 'sat' && canReview && economicReviewStatuses.includes(status ?? ''));
}
