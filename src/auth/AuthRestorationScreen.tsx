import { useEffect, useState } from 'react';
import { requestManualAppUpdate } from '../shared/manualAppUpdate';
import { currentBuild } from '../shared/versioning';

export function AuthRestorationScreen({ retry = () => window.location.reload(), update = () => { void requestManualAppUpdate('tecnico', currentBuild.version); } }: { retry?: () => void; update?: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(timer);
  }, []);
  return <main className="page"><section className="card" role="status">
    <h3>{slow ? 'La sesión está tardando en abrirse' : 'Restaurando sesión'}</h3>
    <p className="large-note">{slow ? 'No hemos podido completar la comprobación todavía. Comprueba la conexión y vuelve a intentarlo.' : 'Comprobando la sesión activa antes de abrir la ruta solicitada.'}</p>
    {slow && <><p>Tus partes descargados y cambios pendientes siguen guardados en este dispositivo.</p><div className="actions"><button type="button" className="primary" onClick={retry}>Reintentar acceso</button><button type="button" onClick={update}>Actualizar DMP</button></div></>}
  </section></main>;
}
