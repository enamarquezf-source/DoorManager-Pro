import { useEffect, useState } from 'react';
import { ArrowRight, Building2, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, Wrench, Check, ScanLine, ShieldCheck } from 'lucide-react';
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
    <section className="demo-welcome"><div className="demo-intro-copy"><span className="demo-eyebrow"><span /> GESTIÓN CONECTADA · TRABAJO REAL</span><h1>Todo empieza con un aviso.<br /><em>Descubre hasta dónde llega.</em></h1><p>Cliente, equipo, trabajo y resultado. Ponte al mando de DMP y sigue el recorrido desde dentro, con una guía que te señala el siguiente paso.</p><p className="demo-intro-scope">Esta demo es una pequeña muestra de todo lo que puedes hacer con DMP.</p></div><div className="demo-intro-signal" aria-hidden="true"><ScanLine size={30} /><span>EXPLORA DMP</span><strong>Tu próximo paso,<br />siempre a la vista.</strong><div><i /><i /><i /><i /><i /></div></div></section>
    {previous && <p className="demo-ended" role="status">{previous === 'complete' ? 'Tu prueba anterior ha terminado y sus datos se han eliminado.' : 'Tu prueba anterior ha terminado. La limpieza remota queda pendiente de confirmación del servidor.'}</p>}
    <section className="demo-start"><div className="demo-start-heading"><div><span className="demo-eyebrow">01 / ELIGE TU PUNTO DE VISTA</span><h2>¿Desde dónde quieres probarla?</h2></div><span className="demo-start-note"><ShieldCheck size={16} /> Sin registro · A tu ritmo</span></div><fieldset className="demo-role-options" disabled={busy}><legend className="sr-only">Elige tu rol de prueba</legend>
      {demoRoles.map(option => { const Icon = icons[option.icon]; return <label key={option.id} className={`demo-role${role === option.id ? ' is-selected' : ''}`}><input type="radio" name="demo-role" value={option.id} checked={role === option.id} onChange={() => setRole(option.id)} /><Icon size={24} aria-hidden="true" /><strong>{option.title}</strong><span>{option.description}</span><Check size={17} className="demo-role-check" aria-hidden="true" /></label>; })}
    </fieldset>
    <div className="demo-scenario" role="status">{role === 'Tecnico' ? <><Wrench size={21} aria-hidden="true" /><div><strong>Tu jornada está preparada</strong><p>Un parte ficticio, tres equipos: puerta seccional, corredera y barrera. Todos sus componentes empiezan sin revisar.</p></div></> : <><Building2 size={21} aria-hidden="true" /><div><strong>{role === 'Oficina' ? 'Un trabajo listo para facturar' : role === 'Gerencia' ? 'Una empresa con actividad para analizar' : role ? 'Empieza tu propio recorrido' : 'Elige cómo quieres entrar'}</strong><p>{role === 'Oficina' ? 'Recibe un parte ficticio revisado y prueba factura y cobro. Después puedes cambiar de perfil sin perder el trabajo.' : role === 'Gerencia' ? 'Explora clientes, horas, materiales y márgenes de trabajos ficticios de las últimas semanas. Todos los datos pertenecen a tu prueba.' : role ? 'Crea un cliente, planifica un trabajo y cambia a Técnico para ejecutarlo en la misma empresa de prueba.' : 'Cada perfil tiene una guía propia. El técnico dispone de un trabajo preparado para empezar a revisar.'}</p></div></>}</div>
    {!checked && <p role="status">Comprobando disponibilidad…</p>}
    {checked && (!ready || !siteKey) && <p role="status" className="demo-preparing">Estamos preparando la demostración. El acceso estará disponible cuando terminemos de configurar los espacios temporales.</p>}
    {ready && siteKey && <DemoTurnstile siteKey={siteKey} onToken={setToken} resetKey={reset} />}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="demo-launch" type="button" disabled={!role || !ready || !siteKey || !token || busy} onClick={() => void launch()}>{busy ? 'Preparando tu espacio…' : 'Probar DMP'}<ArrowRight size={18} aria-hidden="true" /></button>
    <p className="demo-privacy">Sin correo ni contraseña. Espacio temporal y separado para cada visitante. Usa datos ficticios: se eliminan al finalizar o tras 30 minutos sin actividad, con un máximo de dos horas. La limpieza por caducidad se procesa periódicamente.</p>
    </section><section className="demo-beyond"><div><span className="demo-eyebrow">ESTO ES SOLO EL PRINCIPIO</span><h2>Una pequeña muestra.<br />Mucho DMP por descubrir.</h2><p>La demo te invita a recorrer algunos procesos con datos ficticios. La aplicación va mucho más allá: conecta el trabajo de campo con la planificación, las compras y la gestión económica de tu empresa.</p></div><div className="demo-capabilities">{[{icon:ClipboardList,title:'Planifica y conecta',text:'Clientes, centros, equipos, contratos y visitas de mantenimiento.'},{icon:Wrench,title:'Trabaja sobre el terreno',text:'Partes, checks por componente, fotos, horas y trabajo sin cobertura con la jornada preparada.'},{icon:ChartNoAxesCombined,title:'Entiende tu negocio',text:'Materiales, compras, facturación, cobros y estudios de costes y rentabilidad.'}].map(({icon:Icon,title,text})=><article key={title}><Icon size={22} aria-hidden="true"/><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section><footer className="demo-entry-footer"><BrandMark size={22} /><span>DoorManager Pro · Del primer aviso al resultado.</span><span>Demo pública · Usa siempre datos ficticios</span></footer>
  </main>;
}
