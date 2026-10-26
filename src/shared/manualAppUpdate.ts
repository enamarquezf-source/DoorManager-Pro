import { technicianOfflineService } from '../services/technicianOfflineService';
import type { Workspace } from './types';

export function hasPotentialUnsavedFormData() {
  return Array.from(document.querySelectorAll('form input, form textarea, form select')).some(element => {
    if (element instanceof HTMLInputElement) return !['hidden','submit','button','checkbox','radio','password'].includes(element.type) && Boolean(element.value.trim());
    if (element instanceof HTMLTextAreaElement) return Boolean(element.value.trim());
    if (element instanceof HTMLSelectElement) return Boolean(element.value);
    return false;
  });
}
/** The guide and sidebar share the same safeguards and updater. */
export async function requestManualAppUpdate(workspace: Workspace, version: string) {
  const pending = workspace === 'tecnico' && (await technicianOfflineService.pending()).length > 0;
  if ((pending || hasPotentialUnsavedFormData()) && !window.confirm('Hay formularios con datos o cambios técnicos pendientes en este dispositivo. Actualiza solo si ya has guardado o sincronizado lo importante.')) return false;
  sessionStorage.setItem('dmp-last-manual-update', version);
  window.location.assign(`/actualizar.html?volver=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  return true;
}
