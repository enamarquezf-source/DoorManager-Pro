/** Retry a failed verification, never infer roles or bypass a server rejection. */
export async function verifyProfile<T>(load: () => Promise<T>): Promise<T> {
  try { return await load(); }
  catch (error) {
    if (definitiveProfileRejection(error)) throw error;
    return load();
  }
}

export function definitiveProfileRejection(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /Usuario desactivado|No hay un perfil enlazado|sesión no válida/i.test(message);
}

export function profileRecoveryMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/Usuario desactivado|sesión no válida/i.test(message)) return 'Tu perfil está desactivado o no corresponde a esta sesión. Contacta con el administrador.';
  if (/No hay un perfil enlazado/i.test(message)) return 'No hay un perfil enlazado a esta cuenta. Contacta con el administrador si acabas de recibir acceso.';
  return 'No se han podido comprobar tus permisos. Tu sesión sigue abierta: puedes reintentar sin cerrar sesión.';
}
