import { documentsService } from './documentsService';
import { currentProfileId, currentProfileCompanyId, SupabaseOperationError } from './query';
import { invoiceDocumentExtension } from '../shared/invoiceDocumentFiles';
import { pendingDocumentSave, persistDocumentSave, removeDocumentSave, type DocumentSaveScope } from './documentSaveAttempts';
const active = new Set<string>();
export function createDocumentSave(scope: DocumentSaveScope, payload: Record<string, unknown>, file?: File | null) {
  return send(scope, payload, file);
}
export function recoverDocumentSave(scope: DocumentSaveScope) { return send(scope, null); }
async function send(scope: DocumentSaveScope, payload: Record<string, unknown> | null, file?: File | null) {
  const lockKey = JSON.stringify(['dmp-document-save', scope.companyId, scope.profileId, scope.context]);
  const execute = async () => {
    if (active.has(lockKey)) throw new Error('El documento se está enviando.');
    active.add(lockKey);
    try {
      if (await currentProfileId() !== scope.profileId || await currentProfileCompanyId() !== scope.companyId) {
        throw new Error('La sesión o la empresa ha cambiado. Vuelve a abrir el documento.');
      }
      let attempt = await pendingDocumentSave(scope);
      if (attempt && payload) throw new Error('Recupera el envío pendiente antes de guardar otros cambios.');
      if (!attempt) {
        if (!payload) throw new Error('No hay un envío documental pendiente.');
        const operationId = crypto.randomUUID();
        const extension = file ? invoiceDocumentExtension(file) : null;
        attempt = { operationId, payload: JSON.parse(JSON.stringify(payload)),
          ...(file ? { blob: file, filename: file.name, uploadPath: `${scope.companyId}/documents/${operationId}.${extension}` } : {}) };
        await persistDocumentSave(scope, attempt);
      }
      try {
        const upload = attempt.blob ? new File([attempt.blob], attempt.filename!, { type: attempt.blob.type }) : null;
        const id = await documentsService.saveOnce(attempt.operationId, attempt.payload, upload, attempt.uploadPath);
        await removeDocumentSave(scope, attempt.operationId);
        return id;
      } catch (error) {
        // Known RPC rejections rolled back; storage failures and uncertain responses
        // retain the binary and metadata, including when the form is closed.
        if (error instanceof SupabaseOperationError && /^(P0001|235\d\d|22\d\d|42501|PGRST202)$/.test(error.code ?? '')) await removeDocumentSave(scope, attempt.operationId);
        throw error;
      }
    } finally { active.delete(lockKey); }
  };
  if (typeof navigator === 'undefined' || !navigator.locks) return execute();
  return navigator.locks.request(lockKey, { ifAvailable: true }, lock => {
    if (!lock) throw new Error('El documento se está enviando desde otra pestaña.');
    return execute();
  });
}
