export function publicErrorMessage(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'La operación no se completó correctamente.';
  if (/jwt|token|auth|session/i.test(raw)) return 'La sesión puede haber caducado. Vuelve a intentarlo o cierra sesión si el problema continúa.';
  if (/fetch|network|failed to fetch|load failed/i.test(raw)) return 'Hay un problema de conexión. Revisa la cobertura y vuelve a intentarlo.';
  return raw.slice(0, 180);
}

export function buildTechnicalReference(prefix = 'DMP', now = Date.now()) {
  return `${prefix}-${now.toString(36).toUpperCase()}`;
}
