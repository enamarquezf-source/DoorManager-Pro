import { useEffect, useState, type ReactNode } from 'react';
import { accessService } from '../services/accessService';
import { effectivePermissionKeys, moduleLabels, permissionCatalog, permissionLabels } from '../auth/rbac';

type Props = { user: any; onSaved?: () => void };

export function UserAccessPanel({ user, onSaved }: Props) {
  const [access, setAccess] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    setAccess(null); setError('');
    accessService.get(user.id).then((next) => {
      if (!mounted) return;
      setAccess(next);
      const grants = Object.fromEntries((next.permission_grants ?? []).map((item: any) => [item.code, item.granted]));
      setSelected(grants);
      setModules(Object.fromEntries((next.module_visibility ?? []).map((item: any) => [item.code, item.visible])));
    }).catch((reason) => mounted && setError(reason instanceof Error ? reason.message : 'No se han podido cargar los permisos.'));
    return () => { mounted = false; };
  }, [user.id]);
  if (error) return <Card title="Permisos y visibilidad"><p className="form-error">{error}</p></Card>;
  if (!access) return <Card title="Permisos y visibilidad"><p className="large-note">Cargando permisos...</p></Card>;
  const inherited = effectivePermissionKeys({ ...user, roles: access.roles ?? user.roles ?? [] } as any);
  const save = async () => {
    setSaving(true); setError('');
    try {
      const grants = permissionCatalog.filter((code) => !inherited.has(code) && selected[code] === true).map((code) => ({ code, granted: true }));
      const visibility = Object.entries(modules).map(([code, visible]) => ({ code, visible }));
      await accessService.update(user.id, null, grants, visibility);
      onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se han podido guardar los permisos.'); }
    finally { setSaving(false); }
  };
  return <Card title={`Permisos y visibilidad · ${user.first_name} ${user.last_name}`}><p className="large-note">Los permisos heredados por rol no se duplican. Los cambios de esta pantalla son permisos adicionales y preferencias de navegación.</p><h4>Permisos funcionales</h4><div className="component-select permission-grid">{permissionCatalog.map((code) => { const inheritedByRole = inherited.has(code); const checked = inheritedByRole || selected[code] === true; return <label key={code}><input type="checkbox" checked={checked} disabled={inheritedByRole} onChange={(event) => setSelected((current) => ({ ...current, [code]: event.target.checked }))} /> {permissionLabels[code]} <small>{inheritedByRole ? 'Permiso heredado por rol' : checked ? 'Permiso adicional' : ''}</small></label>; })}</div><h4>Visibilidad del menú</h4><div className="component-select permission-grid">{Object.keys(moduleLabels).map((code) => <label key={code}><input type="checkbox" checked={modules[code] !== false} onChange={(event) => setModules((current) => ({ ...current, [code]: event.target.checked }))} /> {moduleLabels[code]}</label>)}</div>{error && <p className="form-error">{error}</p>}<div className="actions"><button className="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></div></Card>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="card"><header><h3>{title}</h3></header>{children}</section>; }
