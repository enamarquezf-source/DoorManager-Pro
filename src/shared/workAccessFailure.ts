export function isWorkAccessFailure(error: string) {
  return /^No tienes permiso para acceder a este trabajo/.test(error) || /^Parte bloqueado\. Motivo:/.test(error);
}
