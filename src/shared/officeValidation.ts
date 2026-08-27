const unavailableCodes = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205']);

export function isOfficeValidationUnavailable(error: any) {
  if (unavailableCodes.has(String(error?.code ?? '').toUpperCase())) return true;
  if (Number(error?.status) === 404) return true;
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return /could not find the function|function .* does not exist|schema cache.*office_validation_status|column .*office_validation_status.*does not exist/.test(message);
}

export function canShowOfficeValidationActions(status: string | null | undefined, authorized: boolean) {
  return status === 'pending' && authorized;
}

export function canCloseOfficeValidationModal(saving: boolean) {
  return !saving;
}

export async function submitOfficeValidationReview({ decision, reason, saving, review, onSuccess, onError }: {
  decision: 'validated' | 'rejected' | null;
  reason: string;
  saving: boolean;
  review: (decision: 'validated' | 'rejected', reason: string) => Promise<unknown>;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}) {
  const trimmedReason = reason.trim();
  if (!decision || saving || !trimmedReason) return false;
  try {
    await review(decision, trimmedReason);
    onSuccess();
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
