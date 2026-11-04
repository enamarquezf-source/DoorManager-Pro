import { useEffect, useRef, useState } from 'react';
import { AuthRestorationScreen } from './AuthRestorationScreen';
import { AccessRecovery } from './AccessRecovery';

export function AccessDeniedScreen({ retry, signOut, home, homeLabel }: { retry: () => Promise<void>; signOut: () => Promise<void>; home: string; homeLabel: string }) {
  const verify = useRef(retry); verify.current = retry;
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    // The route guard will open the requested screen if fresh permissions allow
    // it. A failed verification never grants access or signs the visitor out.
    void verify.current().catch(() => undefined).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  if (checking) return <AuthRestorationScreen />;
  return <section className="page"><article className="card">
    <h3>No tienes permiso para acceder a esta zona</h3>
    <p>Este perfil no tiene acceso a esta pantalla con los permisos que hemos podido comprobar. Tu sesión sigue abierta.</p>
    <div className="actions"><a className="primary" style={{ color: '#fff' }} href={home}>{homeLabel}</a><AccessRecovery retry={retry} /><button type="button" onClick={() => void signOut()}>Cerrar sesión</button></div>
  </article></section>;
}
