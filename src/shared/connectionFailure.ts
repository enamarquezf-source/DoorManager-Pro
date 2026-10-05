// Preserve server validation and permission failures instead of reporting an offline save.
export function isConnectionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { originalError?: unknown; message?: unknown; code?: unknown };
  if (value.originalError && value.originalError !== error) return isConnectionFailure(value.originalError);
  // A database/API code means that a server answered the request.
  if (value.code) return false;
  return typeof value.message === 'string' && /failed to fetch|networkerror|network request failed|fetch failed|load failed|no hay conexión/i.test(value.message);
}
