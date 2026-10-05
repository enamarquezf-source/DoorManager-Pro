import { supabase } from '../lib/supabase/client';
import { currentProfileId, expectData, SupabaseOperationError } from './query';

export type PaymentScope = { profileId: string; companyId: string };
export type PaymentKind = 'customer' | 'supplier';
export type PaymentPayload = { invoice_id: string; amount: number; date: string; method: string; reference: string | null; notes: string | null; treasury_account_id: string | null };
export type PaymentAttempt = { operationId: string; payload: PaymentPayload };
const active = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(scope: PaymentScope, kind: PaymentKind, invoiceId: string) {
  if (!scope.profileId || !scope.companyId || !invoiceId) throw new Error('No se puede identificar el envío del pago.');
  return `dmp-payment-attempt-v1:${scope.companyId}:${scope.profileId}:${kind}:${invoiceId}`;
}

export function pendingPaymentAttempt(scope: PaymentScope, kind: PaymentKind, invoiceId: string): PaymentAttempt | null {
  const raw = localStorage.getItem(key(scope, kind, invoiceId));
  if (!raw) return null;
  const attempt = JSON.parse(raw) as PaymentAttempt;
  if (!uuid.test(attempt.operationId ?? '') || attempt.payload?.invoice_id !== invoiceId
    || !Number.isFinite(attempt.payload.amount) || typeof attempt.payload.date !== 'string'
    || typeof attempt.payload.method !== 'string') throw new Error('El envío pendiente del pago necesita revisión antes de continuar.');
  return attempt;
}

export async function recordPaymentOperation(scope: PaymentScope, kind: PaymentKind, payload: PaymentPayload) {
  if (await currentProfileId() !== scope.profileId) throw new Error('La sesión ha cambiado. Vuelve a abrir la factura.');
  const storageKey = key(scope, kind, payload.invoice_id);
  const send = async () => {
    if (active.has(storageKey)) throw new Error('Este pago se está enviando. Espera a que termine.');
    active.add(storageKey);
    try {
      let attempt = pendingPaymentAttempt(scope, kind, payload.invoice_id);
      if (attempt && JSON.stringify(attempt.payload) !== JSON.stringify(payload)) {
        throw new Error('Hay un envío pendiente de confirmar. Recupera ese envío antes de registrar otro pago.');
      }
      if (!attempt) {
        attempt = { operationId: crypto.randomUUID(), payload };
        // Persist before sending. If storage fails, no financial write is attempted.
        localStorage.setItem(storageKey, JSON.stringify(attempt));
      }
      try {
        const paymentId = await expectData<string>(supabase.rpc('dmp_record_payment_once', {
          p_operation_id: attempt.operationId, p_kind: kind, p_payload: attempt.payload,
        }), kind === 'supplier' ? 'Registrar pago' : 'Registrar cobro');
        localStorage.removeItem(storageKey);
        return paymentId;
      } catch (error) {
        // SQL validation/permission failures roll back the operation. Uncertain
        // transport or server outcomes retain the exact request for recovery.
        if (error instanceof SupabaseOperationError && /^(P0001|235\d\d|22\d\d|42501|PGRST202)$/.test(error.code ?? '')) {
          localStorage.removeItem(storageKey);
        }
        throw error;
      }
    } finally { active.delete(storageKey); }
  };
  if (typeof navigator === 'undefined' || !navigator.locks) return send();
  return navigator.locks.request(storageKey, { ifAvailable: true }, lock => {
    if (!lock) throw new Error('Este pago se está enviando desde otra pestaña. Actualiza el saldo antes de continuar.');
    return send();
  });
}
