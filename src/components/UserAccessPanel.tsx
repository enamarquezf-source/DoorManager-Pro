import { useEffect, useState, type ReactNode } from 'react';
import { accessService } from '../services/accessService';
import { superadminService } from '../services/superadminService';
import { authAdminService } from '../services/authAdminService';
import { effectivePermissionKeys, moduleLabels, permissionCatalog, permissionLabels } from '../auth/rbac';

type Props = { user: any; actor?: any; onSaved?: () => void };

const roleOptions = ['superadmin', 'Gerencia', 'SAT', 'Comercial', 'Oficina', 'Tecnico'];

export function UserAccessPanel({ user, actor, onSaved }: Props) {
  const [access, setAccess] = useState<any>(null);
  const [values, setValues] = useState({ first_name: user.first_name ?? '', last_name: user.last_name ?? '', email: user.email ?? '', phone: user.phone ?? '', active: user.active !== false });
  const [roles, setRoles] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inviteState, setInviteState] = useState<'idle' | 'loading' | 'success'>('idle');
  const canInvite = actor?.active === true && !actor.deleted_at && actor.company_id === user.company_id && (actor.roles ?? []).includes('superadmin') && !user.auth_user_id;

  useEffect(() => {
    let mounted = true;
    setAccess(null); setError(''); setDirty(false);
    accessService.get(user.id).then((next) => {
      if (!mounted) return;
      setAccess(next);
      setValues({ first_name: next.profile?.first_name ?? user.first_name ?? '', last_name: next.profile?.last_name ?? user.last_name ?? '', email: next.profile?.email ?? user.email ?? '', phone: next.profile?.phone ?? user.phone ?? '', active: next.profile?.active !== false });
      setRoles(next.roles ?? []);
      setSelected(Object.fromEntries((next.permission_grants ?? []).map((item: any) => [item.code, item.granted])));
      setModules(Object.fromEntries((next.module_visibility ?? []).map((item: any) => [item.code, item.visible])));
    }).catch((reason) => mounted && setError(reason instanceof Error ? reason.message : 'No se han podido cargar los permisos.'));
    return () => { mounted = false; };
  }, [user.id]);

  if (error) return <Card title="Ficha de usuario"><p className="form-error">{error}</p></Card>;
  if (!access) return <Card title="Ficha de usuario"><p className="large-note">Cargando ficha...</p></Card>;

  const inherited = effectivePermissionKeys({ ...access.profile, primary_area: null, roles: access.roles ?? [], permission_grants: [] } as any);
  const existingGrants = new Set<string>((access.permission_grants ?? []).filter((item: any) => item.granted).map((item: any) => item.code));
  const isSelf = access.profile?.id === user.id;
  const hasTechnicianRole = roles.includes('Tecnico');
  const setValue = (key: keyof typeof values, value: string | boolean) => { setDirty(true); setValues((current) => ({ ...current, [key]: value })); };
  const toggleRole = (role: string) => { if (isSelf) return; setDirty(true); setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]); };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const grants = permissionCatalog.filter((code) => !inherited.has(code) && existingGrants.has(code) !== (selected[code] === true)).map((code) => ({ code, granted: selected[code] === true }));
      const visibility = Object.entries(modules).map(([code, visible]) => ({ code, visible }));
      await superadminService.saveProfileWithRoles(user.id, values, roles as any);
      await accessService.update(user.id, roles, grants, visibility);
      onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se han podido guardar los cambios de la ficha.'); }
    finally { setSaving(false); }
  };
  const invite = async () => {
    setInviteState('loading'); setError('');
    try {
      await authAdminService.inviteProfile(user.id);
      setInviteState('success');
      onSaved?.();
    } catch (reason) {
      setInviteState('idle');
      setError(reason instanceof Error ? reason.message : 'No se ha podido enviar la invitacion Auth.');
    }
  };

  return <Card title={`Ficha completa · ${user.first_name} ${user.last_name}`}>
    <p className="large-note">Una ficha administra datos, roles, visibilidad y permisos adicionales. Auth se muestra sólo como estado y no se modifica desde el navegador.</p>
    <section><h4>General</h4><div className="form-grid"><label>Nombre<input value={values.first_name} onChange={(event) => setValue('first_name', event.target.value)} /></label><label>Apellidos<input value={values.last_name} onChange={(event) => setValue('last_name', event.target.value)} /></label><label>Email de perfil<input type="email" value={values.email} onChange={(event) => setValue('email', event.target.value)} /></label><label>Teléfono<input value={values.phone} onChange={(event) => setValue('phone', event.target.value)} /></label><label>Estado<select value={String(values.active)} disabled={isSelf} onChange={(event) => setValue('active', event.target.value === 'true')}><option value="true">Activo</option><option value="false">Inactivo</option></select></label></div></section>
     <section><h4>Seguridad</h4><p className="large-note">Cuenta Auth: {user.auth_user_id ? 'Enlazada' : 'No vinculada'}.</p>{!user.auth_user_id && <p className="large-note">El perfil DMP existe, pero todavía no tiene cuenta Auth.</p>}{canInvite && <div className="actions"><button type="button" className="primary" onClick={invite} disabled={inviteState === 'loading'}>{inviteState === 'loading' ? 'Enviando invitacion...' : 'Enviar invitacion'}</button></div>}{inviteState === 'success' && <p className="success-note">Invitacion enviada y cuenta Auth vinculada.</p>}<p className="large-note">El restablecimiento y la contraseña requieren un flujo posterior; no se exponen credenciales ni service role.</p></section>
    <section><h4>Acceso y roles</h4><div className="component-select permission-grid">{roleOptions.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} disabled={isSelf} onChange={() => toggleRole(role)} /> {role === 'superadmin' ? 'Superadmin de tenant' : role}</label>)}</div>{isSelf && <p className="large-note">Tu propio Superadmin no puede degradarse ni desactivarse desde esta ficha.</p>}</section>
    <section><h4>Permisos efectivos</h4><p className="large-note">{roles.includes('superadmin') ? 'Acceso funcional completo dentro del tenant por rol Superadmin.' : `${inherited.size + permissionCatalog.filter((code) => !inherited.has(code) && selected[code] === true).length} permisos efectivos: rol + grants individuales positivos.`}</p><div className="component-select permission-grid">{permissionCatalog.map((code) => { const inheritedByRole = inherited.has(code); const checked = inheritedByRole || selected[code] === true; return <label key={code}><input type="checkbox" checked={checked} disabled={inheritedByRole} onChange={(event) => { setDirty(true); setSelected((current) => ({ ...current, [code]: event.target.checked })); }} /> {permissionLabels[code] ?? code} <small>{inheritedByRole ? 'Concedido por rol' : checked ? 'Grant individual' : 'No concedido'}</small></label>; })}</div></section>
    <section><h4>Módulos visibles</h4><div className="component-select permission-grid">{Object.keys(modules).map((code) => <label key={code}><input type="checkbox" checked={modules[code] !== false} onChange={(event) => { setDirty(true); setModules((current) => ({ ...current, [code]: event.target.checked })); }} /> {moduleLabels[code] ?? code}</label>)}</div></section>
    <section><h4>Operativa</h4><p className="large-note">{hasTechnicianRole ? 'Este perfil puede actuar como Técnico. El enlace operativo usa profile.id en partes, asignaciones, horas y checks.' : 'Sin rol Técnico. No existe una entidad técnica separada que deba enlazarse desde esta ficha.'}</p></section>
    {error && <p className="form-error">{error}</p>}<div className="actions"><button className="primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Guardando...' : 'Guardar ficha'}</button></div>
  </Card>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="card"><header><h3>{title}</h3></header>{children}</section>; }
