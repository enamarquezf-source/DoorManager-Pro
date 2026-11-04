import { useState } from 'react';

export function AccessRecovery({ retry }: { retry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recover = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await retry(); }
    catch { setError('No se ha podido comprobar el acceso todavía. Revisa la conexión y vuelve a intentarlo.'); }
    finally { setBusy(false); }
  };
  return <><button type="button" className="primary" disabled={busy} onClick={() => void recover()}>{busy ? 'Comprobando acceso…' : 'Reintentar acceso'}</button>{error && <p role="alert" className="form-error">{error}</p>}</>;
}
