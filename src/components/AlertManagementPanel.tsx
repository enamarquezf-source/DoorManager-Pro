import { useEffect } from 'react';
import { useLoad } from '../query/useLoad';
import { alertsService } from '../services/alertsService';
import { DeleteRecordAction } from './DeleteRecordAction';
import { StateBlock } from './StateBlock';

export function AlertManagementPanel({ profile }: { profile: any }) {
  const {data,loading,error,reload}=useLoad(()=>alertsService.listManageable(),[],[] as any[]);
  useEffect(()=>{const changed=()=>reload();window.addEventListener('dmp-alerts-changed',changed);return()=>window.removeEventListener('dmp-alerts-changed',changed);},[]);
  return <StateBlock loading={loading} error={error} retry={reload} empty={false}>
    <p className="large-note">Avisos enviados de tu empresa. Puedes retirar un aviso incorrecto sin abrir el registro relacionado. El borrado lo retira de todas las bandejas y queda registrado en auditoría.</p>
    {!loading&&!error&&!data.length&&<p>No hay avisos enviados.</p>}
    <div className="alerts-panel compact-list">{data.map(alert=><article key={alert.id} className="alert-record">
      <strong>{alert.title}</strong><p>{alert.description}</p>
      <small>{alert.code} · Destinatarios: {(alert.recipients??[]).map((r:any)=>r.profile_id?(r.name||'Usuario concreto'):r.role).join(', ')||'Sin destinatarios'}</small>
      <DeleteRecordAction kind="alert" recordId={alert.id} title={alert.title} profile={profile} onDeleted={()=>window.dispatchEvent(new Event('dmp-alerts-changed'))}/>
    </article>)}</div>
  </StateBlock>;
}
