import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, LogOut, X } from 'lucide-react';
import { publicDemoService } from './service';
import { demoRoles, demoTourSteps, type DemoSession } from './model';

type Progress = { step: number; open: boolean };
function progressFor(id: string): Progress {
  try { const value = JSON.parse(localStorage.getItem(`dmp-demo-tour:${id}`) ?? 'null'); if (Number.isInteger(value?.step) && value.step >= 0 && typeof value.open === 'boolean') return value; } catch { /* Start with the guide if storage is unavailable. */ }
  return { step: 0, open: true };
}
function DemoGuide({ session, progress, setProgress }: { session: DemoSession; progress: Progress; setProgress: (value: Progress) => void }) {
  const navigate = useNavigate();
  const steps = demoTourSteps(session); const index = Math.min(progress.step, steps.length - 1); const step = steps[index];
  useEffect(() => {
    if (!progress.open) return;
    let highlighted: Element | null = null;
    const highlight = () => {
      const element = document.querySelector(step.target);
      if (element === highlighted) return;
      highlighted?.classList.remove('demo-highlight'); highlighted = element; highlighted?.classList.add('demo-highlight');
    };
    highlight(); const observer = new MutationObserver(highlight); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); highlighted?.classList.remove('demo-highlight'); };
  }, [step.target, progress.open]);
  if (!progress.open) return null;
  const go = (next: number) => { setProgress({ step: next, open: true }); navigate(steps[next].route); };
  return <aside className="demo-guide" aria-label="Guía de primeros pasos"><header><span>PASO {index + 1} DE {steps.length}</span><button type="button" aria-label="Ocultar guía" onClick={() => setProgress({ ...progress, open: false })}><X size={18} /></button></header>
    <h2>{step.title}</h2><p>{step.text}</p><div className="demo-guide-progress" aria-hidden="true">{steps.map((item, n) => <i key={item.title} className={n <= index ? 'is-reached' : ''} />)}</div>
    <div className="demo-guide-actions"><button type="button" disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft size={16} />Anterior</button><button type="button" onClick={() => navigate(step.route)}>Ir a este paso</button><button type="button" className="demo-guide-next" onClick={() => index === steps.length - 1 ? setProgress({ ...progress, open: false }) : go(index + 1)}>{index === steps.length - 1 ? 'Terminar guía' : 'Siguiente'}<ArrowRight size={16} /></button></div>
  </aside>;
}

export function PublicDemoBoundary({ userId, onFinish, children }: { userId: string | null; onFinish: () => Promise<void>; children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null); const [error, setError] = useState(''); const [finishing, setFinishing] = useState(false);
  const [remaining, setRemaining] = useState(0); const [progress, setProgress] = useState<Progress>({ step: 0, open: true });
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const finishingRef = useRef(false);
  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true); setError('');
    try { await finishRef.current(); } catch (reason) { finishingRef.current = false; setError(reason instanceof Error ? reason.message : 'No se ha completado la limpieza. Vuelve a intentarlo.'); setFinishing(false); }
  };
  useEffect(() => {
    const requested = () => { void finish(); };
    window.addEventListener('dmp-demo-finish-request', requested);
    return () => window.removeEventListener('dmp-demo-finish-request', requested);
  }, []);
  useEffect(() => {
    setSession(null); setError(''); setFinishing(false);
    if (!userId) return;
    let active = true;
    publicDemoService.session().then(value => {
      if (!active) return;
      if (value.ended || Date.parse(value.expires_at) <= Date.now()) { void finish(); return; }
      setSession(value); setProgress(progressFor(value.id));
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!session || finishing) return;
    let active = true; let lastHeartbeat = Date.now(); let sending = false; let expired = false;
    const tick = () => {
      const milliseconds = Date.parse(session.expires_at) - Date.now();
      setRemaining(Math.max(0, Math.ceil(milliseconds / 60000)));
      if (milliseconds <= 0 && !expired) { expired = true; void finish(); }
    };
    const activity = () => {
      if (document.visibilityState === 'hidden' || expired || sending || Date.now() - lastHeartbeat < 60000) return;
      lastHeartbeat = Date.now(); sending = true;
      publicDemoService.heartbeat().then(value => {
        if (!active) return;
        if (value.ended) { expired = true; void finish(); } else setSession(value);
      }).catch(() => { /* Never extend a lease locally when the server cannot confirm it. */ }).finally(() => { sending = false; });
    };
    tick(); const timer = setInterval(tick, 1000);
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity);
    return () => { active = false; clearInterval(timer); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); };
  }, [session, finishing]);
  const saveProgress = (value: Progress) => {
    setProgress(value); if (!session) return;
    try { localStorage.setItem(`dmp-demo-tour:${session.id}`, JSON.stringify(value)); } catch { /* Guide works for this session without persistence. */ }
  };
  if (!userId) return children;
  if (finishing) return <main className="demo-state"><h1>Finalizando tu prueba…</h1><p role="status">Cerrando el acceso y limpiando los datos de esta sesión.</p></main>;
  if (error) return <main className="demo-state"><h1>No se ha podido abrir la sesión de prueba</h1><p role="alert">{error}</p><button type="button" onClick={() => void finish()}>Finalizar y volver a la portada</button></main>;
  if (!session) return <main className="demo-state"><p role="status">Verificando tu espacio temporal…</p></main>;
  return <div className="public-demo-app" data-guide-open={progress.open ? 'true' : 'false'}><div className="demo-session-bar"><div><strong>DEMO · {demoRoles.find(role => role.id === session.role)?.title}</strong><span>Simulación · usa datos ficticios</span></div><small>{remaining} min de sesión</small><button type="button" onClick={() => saveProgress({ ...progress, open: !progress.open })}><BookOpen size={16} />Guía</button><button type="button" onClick={() => void finish()}><LogOut size={16} />Finalizar demo</button></div>{children}<DemoGuide session={session} progress={progress} setProgress={saveProgress} /></div>;
}
