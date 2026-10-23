import { useEffect, useState } from 'react';
import { ArrowRight, Building2, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Wrench, Check } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { demoRoles, type DemoRole, type DemoSession } from './model';
import { DemoTurnstile } from './Turnstile';
const icons = { chart: ChartNoAxesCombined, office: Building2, planning: ClipboardList, sales: BriefcaseBusiness, tools: Wrench };

export function PublicDemoEntry({ checkReady, start, onReady, siteKey = import.meta.env.VITE_DEMO_TURNSTILE_SITE_KEY ?? '' }: {
  checkReady: () => Promise<boolean>; start: (role: DemoRole, token: string) => Promise<DemoSession>; onReady: (session: DemoSession) => Promise<void>; siteKey?: string;
}) {
  const [role, setRole] = useState<DemoRole | null>(null); const [ready, setReady] = useState(false); const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [token, setToken] = useState(''); const [reset, setReset] = useState(0);
  useEffect(() => { let active = true; checkReady().then(value => { if (active) setReady(value); }).catch(() => { if (active) setReady(false); }).finally(() => { if (active) setChecked(true); }); return () => { active = false; }; }, [checkReady]);
  const launch = async () => {
    if (busy || !ready || !token || !role) return; setBusy(true); setError('');
    try { await onReady(await start(role, token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se ha podido empezar.'); setToken(''); setReset(value => value + 1); }
    finally { setBusy(false); }
  };
  const previous = sessionStorage.getItem('dmp-demo-end-status');
  return <main className="public-demo-entry">
    <header className="demo-wordmark"><BrandMark size={32} /><strong>DoorManager Pro</strong><span>BETA PÚBLICA</span></header>
    <section className="demo-welcome"><p className="eyebrow">DESCUBRE TU FORMA DE TRABAJAR</p><h1>Entra en DMP.<br />Pruébala a tu manera.</h1><p>Del primer aviso al trabajo terminado. Explora la gestión o ponte en la piel del técnico, con una guía que te acompaña.</p></section>
    {previous && <p className="demo-ended" role="status">{previous === 'complete' ? 'Tu prueba anterior ha terminado y sus datos se han eliminado.' : 'Tu prueba anterior ha terminado. La limpieza remota queda pendiente de confirmación del servidor.'}</p>}
    <section className="demo-start"><h2>¿Desde dónde quieres probarla?</h2><fieldset className="demo-role-options" disabled={busy}><legend className="sr-only">Elige tu rol de prueba</legend>
      {demoRoles.map(option => { const Icon = icons[option.icon]; return <label key={option.id} className={`demo-role${role === option.id ? ' is-selected' : ''}`}><input type="radio" name="demo-role" value={option.id} checked={role === option.id} onChange={() => setRole(option.id)} /><Icon size={24} aria-hidden="true" /><strong>{option.title}</strong><span>{option.description}</span><Check size={17} className="demo-role-check" aria-hidden="true" /></label>; })}
    </fieldset>
    <div className="demo-scenario" role="status">{role === 'Tecnico' ? <><Wrench size={21} aria-hidden="true" /><div><strong>Tu jornada está preparada</strong><p>Un parte ficticio, tres equipos: puerta seccional, corredera y barrera. Todos sus componentes empiezan sin revisar.</p></div></> : <><Building2 size={21} aria-hidden="true" /><div><strong>{role === 'Oficina' ? 'Un trabajo listo para facturar' : role === 'Gerencia' ? 'Una empresa con actividad para analizar' : role ? 'Empieza tu propio recorrido' : 'Elige cómo quieres entrar'}</strong><p>{role === 'Oficina' ? 'Recibe un parte ficticio revisado y prueba factura y cobro. Después puedes cambiar de perfil sin perder el trabajo.' : role === 'Gerencia' ? 'Explora clientes, horas, materiales y márgenes de trabajos ficticios de las últimas semanas. Todos los datos pertenecen a tu prueba.' : role ? 'Crea un cliente, planifica un trabajo y cambia a Técnico para ejecutarlo en la misma empresa de prueba.' : 'Cada perfil tiene una guía propia. El técnico dispone de un trabajo preparado para empezar a revisar.'}</p></div></>}</div>
    {!checked && <p role="status">Comprobando disponibilidad…</p>}
    {checked && (!ready || !siteKey) && <p role="status" className="demo-preparing">Estamos preparando la demostración. El acceso estará disponible cuando terminemos de configurar los espacios temporales.</p>}
    {ready && siteKey && <DemoTurnstile siteKey={siteKey} onToken={setToken} resetKey={reset} />}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="demo-launch" type="button" disabled={!role || !ready || !siteKey || !token || busy} onClick={() => void launch()}>{busy ? 'Preparando tu espacio…' : 'Probar DMP'}<ArrowRight size={18} aria-hidden="true" /></button>
    <p className="demo-privacy">Sin correo ni contraseña. Espacio temporal y separado para cada visitante. Usa datos ficticios: se eliminan al finalizar o tras 30 minutos sin actividad, con un máximo de dos horas. La limpieza por caducidad se procesa periódicamente.</p>
    </section><footer className="demo-entry-footer">Partes · Equipos · Mantenimientos · Checks · Gestión</footer>
  </main>;
}
