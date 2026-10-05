import { operationalRegistersService, type OperationalRegisterKind } from './operationalRegistersService';
import { currentProfileId, currentProfileCompanyId, SupabaseOperationError } from './query';

export type RegisterCreationScope = { profileId: string; companyId: string };
export type RegisterCreationAttempt = { operationId: string; payload: Record<string, unknown> };
const active = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(scope: RegisterCreationScope, kind: OperationalRegisterKind) {
  if (!scope.profileId || !scope.companyId) throw new Error('No se puede identificar el propietario del alta.');
  return `dmp-register-creation-v1:${scope.companyId}:${scope.profileId}:${kind}`;
}

export function pendingRegisterCreation(scope: RegisterCreationScope, kind: OperationalRegisterKind): RegisterCreationAttempt | null {
  const raw = localStorage.getItem(key(scope, kind));
  if (!raw) return null;
  const attempt = JSON.parse(raw) as RegisterCreationAttempt;
  if (!uuid.test(attempt.operationId ?? '') || !attempt.payload || typeof attempt.payload !== 'object'
    || Array.isArray(attempt.payload) || attempt.payload.id) {
    throw new Error('El alta pendiente necesita revisión antes de continuar.');
  }
  return attempt;
}

// Recovery deliberately takes no editable payload: it always replays the stored request.
export function recoverRegisterCreation(scope: RegisterCreationScope, kind: OperationalRegisterKind) {
  return send(scope, kind, null);
}

export function createRegisterOperation(scope: RegisterCreationScope, kind: OperationalRegisterKind, payload: Record<string, unknown>) {
  if (payload.id) return Promise.reject(new Error('Las modificaciones no son altas nuevas.'));
  return send(scope, kind, payload);
}

async function send(scope: RegisterCreationScope, kind: OperationalRegisterKind, payload: Record<string, unknown> | null) {
  const storageKey = key(scope, kind);
  const execute = async () => {
    if (active.has(storageKey)) throw new Error('El alta se está enviando. Espera a que termine.');
    active.add(storageKey);
    try {
      if (await currentProfileId() !== scope.profileId || await currentProfileCompanyId() !== scope.companyId) {
        throw new Error('La sesión o la empresa ha cambiado. Vuelve a abrir el formulario.');
      }
      let attempt = pendingRegisterCreation(scope, kind);
      if (payload && attempt) throw new Error('Hay un alta pendiente de confirmar. Recupera ese envío antes de crear otro registro.');
      if (!attempt) {
        if (!payload) throw new Error('No hay un alta pendiente de recuperar.');
        // Round-trip first to freeze dates/values and reject unserializable data before RPC.
        attempt = JSON.parse(JSON.stringify({ operationId: crypto.randomUUID(), payload })) as RegisterCreationAttempt;
        localStorage.setItem(storageKey, JSON.stringify(attempt));
      }
      try {
        const id = await operationalRegistersService.createOnce(kind, attempt.operationId, attempt.payload);
        localStorage.removeItem(storageKey);
        return id;
      } catch (error) {
        // Only explicit database rejection permits a new, corrected request.
        // Unknown outcomes keep the operation available after closing the form.
        if (error instanceof SupabaseOperationError && /^(P0001|235\d\d|22\d\d|42501|PGRST202)$/.test(error.code ?? '')) {
          localStorage.removeItem(storageKey);
        }
        throw error;
      }
    } finally { active.delete(storageKey); }
  };
  if (typeof navigator === 'undefined' || !navigator.locks) return execute();
  return navigator.locks.request(storageKey, { ifAvailable: true }, lock => {
    if (!lock) throw new Error('El alta se está enviando desde otra pestaña.');
    return execute();
  });
}
