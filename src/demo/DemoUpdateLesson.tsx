import { useState } from 'react';
import { CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { checkForNewVersion, type VersionCheckResult } from '../shared/versioning';
import { requestManualAppUpdate } from '../shared/manualAppUpdate';
import type { DemoRole } from './model';

export function DemoUpdateLesson({ role }: { role: DemoRole }) {
  const [result,setResult] = useState<VersionCheckResult | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const check = async () => {
    setBusy(true);setError('');
    try {setResult(await checkForNewVersion());}
    catch {setError('No se ha podido comprobar. Reintenta con conexión.');}
    finally {setBusy(false);}
  };
  const update = async () => {
    if(result?.status!=='update-available')return;
    try {await requestManualAppUpdate(role==='Tecnico'?'tecnico':role==='SAT'?'sat':role==='Oficina'?'oficina':role==='Comercial'?'comercial':'gerencia',result.latest.version);}
    catch {setError('No se ha podido abrir el actualizador. Guarda tu trabajo y vuelve a intentarlo.');}
  };
  return <section className="demo-update-lesson" aria-label="Aprende a actualizar DMP">
    <p>En el menú encontrarás <strong>Buscar actualizaciones</strong>. Si aparece <strong>Actualizar ahora</strong>, hay una versión nueva. También puedes comprobarlo aquí:</p>
    <button type="button" className="demo-update-check" disabled={busy} onClick={()=>void check()}><RefreshCw size={16}/>{busy?'Comprobando…':'Comprobar mi versión'}</button>
    <div role="status" aria-live="polite">
      {result?.status==='current'&&<p className="demo-update-success"><CheckCircle2 size={18}/>Estás al día. No necesitas actualizar ahora.</p>}
      {result?.status==='update-available'&&<><p>Hay una versión nueva: <strong>{result.latest.version}</strong>.</p><button type="button" className="demo-update-check" onClick={()=>void update()}><Download size={16}/>Actualizar DMP</button></>}
      {result?.status==='unavailable'&&<p>No hemos podido consultar la versión publicada. Comprueba tu conexión y vuelve a intentarlo.</p>}
    </div>
    <small>Guarda los formularios antes de actualizar. DMP conserva tu sesión y los datos locales; comprueba después los cambios pendientes de sincronizar.</small>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
