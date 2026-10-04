import { useRef, useState } from 'react';
import { hasPermission } from '../auth/rbac';
import { recordDeletionService, type DeletableRecordKind } from '../services/recordDeletionService';
const permission = { alert: 'alerts.delete', vehicle: 'vehicles.delete', document: 'documents.delete' };
const label = { alert: 'aviso', vehicle: 'vehículo', document: 'documento' };
export function DeleteRecordAction({ kind, recordId, title, profile, onDeleted }: { kind: DeletableRecordKind; recordId: string; title: string; profile: any; onDeleted: () => void }) {
 const [confirming, setConfirming] = useState(false);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState('');
 const pending = useRef(false);
 if (!hasPermission(profile, permission[kind]) || !profile.roles?.some((r: string) => ['superadmin', 'SAT', 'Oficina', 'Gerencia'].includes(r))) return null;
 const remove = async () => {
  if (pending.current) return;
  pending.current = true; setSaving(true); setError('');
  try { await recordDeletionService.remove(kind, recordId); onDeleted(); }
  catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido eliminar el registro.'); }
  finally { pending.current = false; setSaving(false); }
 };
 return <div className="record-deletion">{!confirming ? <button className="danger-action" onClick={() => setConfirming(true)}>Eliminar {label[kind]}</button> : <div className="deletion-confirmation"><p>¿Eliminar «{title}»?</p><p>{kind === 'alert' ? 'Desaparecerá de las bandejas de todos sus destinatarios.' : kind === 'vehicle' ? 'Desaparecerá del listado. Sus documentos se conservarán en Documentación.' : 'Desaparecerá del listado y de los registros vinculados.'} La operación quedará registrada en auditoría.</p><div className="actions"><button disabled={saving} onClick={() => { setConfirming(false); setError(''); }}>Cancelar</button><button className="danger-action" disabled={saving} onClick={remove}>{saving ? 'Eliminando...' : 'Confirmar eliminación'}</button></div></div>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
