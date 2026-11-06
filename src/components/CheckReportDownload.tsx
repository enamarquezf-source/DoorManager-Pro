import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadCheckReport } from '../checks/downloadCheckReport';

export function CheckReportDownload({ work, offline = false }: { work: any; offline?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checks = (work.checks ?? []).filter((check: any) => !check.deleted_at && check.status === 'Realizado');
  if (!checks.length) return null;

  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await downloadCheckReport(work, offline, checks);
    } catch {
      setError('No se ha podido descargar el informe de checks. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" className="link-button" onClick={() => void download()} disabled={busy}><Download size={16} aria-hidden="true" /> {busy ? 'Preparando informe…' : 'Descargar informe de checks'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
