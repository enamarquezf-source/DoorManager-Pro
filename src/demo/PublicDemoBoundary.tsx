import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, LogOut, X } from 'lucide-react';
import { publicDemoService } from './service';
import { demoRoles, demoTourSteps, demoStepDone, type DemoRole, type DemoSession, type DemoTour } from './model';
import { DemoSpotlight, findDemoTarget } from './DemoSpotlight';

type Progress = { step: number; open: boolean };
function tourFor(id:string):DemoTour {try{return localStorage.getItem('dmp-demo-tour-choice:'+id)==='purchases'?'purchases':'work';}catch{return 'work';}}
function progressFor(id: string): Progress {
  try { const value = JSON.parse(localStorage.getItem(`dmp-demo-tour:${id}`) ?? 'null'); if (Number.isInteger(value?.step) && value.step >= 0 && typeof value.open === 'boolean') return value; } catch { /* Start with the guide if storage is unavailable. */ }
  return { step: 0, open: true };
}
export function DemoGuide({ session, progress, setProgress, onRole, roleSwitchAvailable=true, tour='work', onTour }: { session: DemoSession; progress: Progress; setProgress: (value: Progress) => void; onRole: (role:DemoRole)=>Promise<void>; roleSwitchAvailable?:boolean; tour?:DemoTour; onTour?:(tour:DemoTour)=>void }) {
  const navigate = useNavigate();
  const location=useLocation();
  const [expanded,setExpanded]=useState(false);
  const [completion,setCompletion]=useState<Record<string,number>>({});
  const steps = demoTourSteps(session,tour); const index = Math.min(progress.step, steps.length - 1); const step = steps[index];
  useEffect(()=>{
    if(!progress.open || !roleSwitchAvailable) return;
    let active=true; let pending=false;
    const update=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;try{const value=await publicDemoService.progress();if(active)setCompletion(value);}catch{/* Older demo SQL keeps the guide manual. */}finally{pending=false;}};
    void update();const timer=setInterval(()=>void update(),5000);window.addEventListener('focus',update);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);};
  },[session.role,session.id,progress.open,roleSwitchAvailable]);
  useEffect(()=>{
    if(progress.open && location.pathname===step.route.split('?')[0] && demoStepDone(step,completion) && index<steps.length-1 && !document.querySelector('[role="dialog"], .modal-overlay'))setProgress({step:index+1,open:true});
  },[completion,index,progress.open,step.goal,location.pathname]);
  if (!progress.open) return null;
  const go = (next: number) => { setProgress({ step: next, open: true }); navigate(steps[next].route); };
  const showTask = () => {
    if (location.pathname !== step.route.split('?')[0] || location.search !== (step.route.includes('?') ? '?' + step.route.split('?')[1] : '')) navigate(step.route);
    else findDemoTarget(step)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  };
  return <><DemoSpotlight step={step} number={index + 1} /><aside className="demo-guide" data-expanded={expanded} aria-label="Guía de primeros pasos"><header><span>PASO {index + 1} DE {steps.length}</span><button type="button" className="demo-guide-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Menos ayuda':'Ver ayuda'}</button><button type="button" aria-label="Ocultar guía" onClick={() => setProgress({ ...progress, open: false })}><X size={18} /></button></header>
    {onTour&&<div className="demo-guide-tours" role="group" aria-label="Recorrido de la guía"><button type="button" aria-pressed={tour==='work'} onClick={()=>onTour('work')}>Trabajo y facturación</button><button type="button" aria-pressed={tour==='purchases'} onClick={()=>onTour('purchases')}>Materiales y compras</button></div>}<h2>{step.title}</h2><div className="demo-guide-detail"><p>{step.text}</p>{step.goal&&<p className="demo-task-hint">{demoStepDone(step,completion)?'Acción guardada.':'Avanza al guardar y sincronizar la acción. También puedes omitir este paso.'}</p>}<div className="demo-guide-progress" aria-hidden="true">{steps.map((item, n) => <i key={item.title} className={n <= index ? 'is-reached' : ''} />)}</div></div>
    <div className="demo-guide-actions"><button type="button" disabled={index === 0} aria-label="Paso anterior" onClick={() => go(index - 1)}><ArrowLeft size={16} /></button>{step.role?<button type="button" className="demo-guide-next" disabled={!roleSwitchAvailable} onClick={()=>{setProgress({step:Math.min(index+1,steps.length-1),open:true});void onRole(step.role!);}}>Cambiar a {demoRoles.find(r=>r.id===step.role)?.title}<ArrowRight size={16}/></button>:<button type="button" className="demo-guide-next" onClick={showTask}>Ir a la tarea<ArrowRight size={16}/></button>}<button type="button" onClick={() => index === steps.length - 1 ? setProgress({ ...progress, open: false }) : go(index + 1)}>{index === steps.length - 1 ? 'Terminar guía' : step.goal?'Omitir':'Siguiente'}</button></div>
  </aside></>;
}

export function PublicDemoBoundary({ userId, onFinish, onRoleChanged, children }: { userId: string | null; onFinish: () => Promise<void>; onRoleChanged: (session:DemoSession, navigateToHome?:boolean)=>Promise<void>; children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null); const [error, setError] = useState(''); const [finishing, setFinishing] = useState(false);
  const [switching,setSwitching]=useState(false); const [roleError,setRoleError]=useState(''); const [roleMenu,setRoleMenu]=useState(false);
  const [journeys,setJourneys]=useState(false); const [tour,setTour]=useState<DemoTour>('work');
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
      void publicDemoService.journeysAvailable().then(async available=>{
        if(!active)return;setJourneys(available);
        if(available){const prepared=await publicDemoService.prepareJourney(value.role);if(!active)return;await onRoleChanged(prepared,false);setSession(prepared);const chosen=tourFor(prepared.id);setTour(chosen);setProgress(progressFor(prepared.id+':'+prepared.role+':'+chosen));}
        else {setSession(value);const chosen=tourFor(value.id);setTour(chosen);setProgress(progressFor(value.id+':'+value.role+':'+chosen));}
      }).catch(reason=>{if(active)setError(reason.message);});
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
  const switchRole=async(role:DemoRole)=>{
    if(switching||!session||role===session.role)return;
    setSwitching(true);setRoleError('');setRoleMenu(false);
    try{const next=await publicDemoService.prepareJourney(role);await onRoleChanged(next);setSession(next);setProgress(progressFor(next.id+':'+next.role+':'+tour));}
    catch(reason){setRoleError(reason instanceof Error?reason.message:'No se ha podido cambiar el perfil.');}
    finally{setSwitching(false);}
  };
  const changeTour=(next:DemoTour)=>{
    if(!session)return;setTour(next);setProgress({...progressFor(session.id+':'+session.role+':'+next),open:true});
    try{localStorage.setItem('dmp-demo-tour-choice:'+session.id,next);}catch{/* Selection remains usable in memory. */}
  };
  const saveProgress = (value: Progress) => {
    setProgress(value); if (!session) return;
    try { localStorage.setItem(`dmp-demo-tour:${session.id}:${session.role}:${tour}`, JSON.stringify(value)); } catch { /* Guide works for this session without persistence. */ }
  };
  if (!userId) return children;
  if (switching) return <main className="demo-state"><h1>Preparando el siguiente perfil…</h1><p>Conservando los datos de tu empresa de prueba.</p></main>;
  if (finishing) return <main className="demo-state"><h1>Finalizando tu prueba…</h1><p role="status">Cerrando el acceso y limpiando los datos de esta sesión.</p></main>;
  if (error) return <main className="demo-state"><h1>No se ha podido abrir la sesión de prueba</h1><p role="alert">{error}</p><button type="button" onClick={() => void finish()}>Finalizar y volver a la portada</button></main>;
  if (!session) return <main className="demo-state"><p role="status">Verificando tu espacio temporal…</p></main>;
  return <div className="public-demo-app" data-guide-open={progress.open ? 'true' : 'false'}><div className="demo-session-bar"><div><strong>DEMO · {demoRoles.find(role => role.id === session.role)?.title}</strong><span>Simulación · usa datos ficticios</span></div><small>{remaining} min de sesión</small>{journeys&&<button type="button" aria-expanded={roleMenu} onClick={()=>setRoleMenu(!roleMenu)}>Cambiar perfil</button>}<button type="button" onClick={() => saveProgress({ ...progress, open: !progress.open })}><BookOpen size={16} />Guía</button><button type="button" onClick={() => void finish()}><LogOut size={16} />Finalizar demo</button></div>{roleMenu&&<nav className="demo-role-menu" aria-label="Cambiar perfil de la prueba">{demoRoles.map(role=><button type="button" key={role.id} disabled={role.id===session.role} onClick={()=>void switchRole(role.id)}>{role.title}</button>)}<p>Misma empresa de prueba, permisos propios de cada perfil.</p></nav>}{roleError&&<p role="alert" className="demo-role-error">{roleError}</p>}{children}<DemoGuide session={session} progress={progress} setProgress={saveProgress} onRole={switchRole} roleSwitchAvailable={journeys} tour={tour} onTour={changeTour} /></div>;
}
