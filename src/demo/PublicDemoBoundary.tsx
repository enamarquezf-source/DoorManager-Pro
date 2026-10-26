import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, LogOut, X } from 'lucide-react';
import { publicDemoService } from './service';
import { demoRoles, demoTourSteps, demoStepDone, type DemoRole, type DemoSession, type DemoTour } from './model';
import { DemoSpotlight, findDemoTarget } from './DemoSpotlight';
import { DemoUpdateLesson } from './DemoUpdateLesson';
import { guideCopy } from './guideCopy';
import {journeyProgressKey,sharedJourney,observeMission,readEvidence,type MissionEvidence} from './journey';
import {DemoJourneyFinish} from './DemoJourneyFinish';
import {navigationCompletes,interactionCompletes,navigationMission} from './autoGuide';
import { Sparkles, CheckCircle2, MousePointer2 } from 'lucide-react';

type Progress = { step: number; open: boolean };
function tourFor(id:string):DemoTour {try{const value=localStorage.getItem('dmp-demo-tour-choice:'+id);return value==='purchases'||value==='updates'||value==='connected'||value==='discover'?value:'work';}catch{return 'work';}}
function progressFor(id: string): Progress {
  try { const value = JSON.parse(localStorage.getItem(`dmp-demo-tour:${id}`) ?? 'null'); if (Number.isInteger(value?.step) && value.step >= 0 && typeof value.open === 'boolean') return value; } catch { /* Start with the guide if storage is unavailable. */ }
  return { step: 0, open: true };
}
export function DemoGuide({ session, progress, setProgress, onRole, roleSwitchAvailable=true, tour='work', onTour }: { session: DemoSession; progress: Progress; setProgress: (value: Progress) => void; onRole: (role:DemoRole)=>Promise<void|boolean>; roleSwitchAvailable?:boolean; tour?:DemoTour; onTour?:(tour:DemoTour)=>void }) {
  const navigate = useNavigate();
  const location=useLocation();
  const [expanded,setExpanded]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [paused,setPaused]=useState(false);
  const [formOpen,setFormOpen]=useState(false);
  const lastLocation=useRef(location.pathname+location.search);
  const lastAdvanced=useRef('');
  const evidenceKey='dmp-demo-evidence:'+journeyProgressKey(session,tour);
  const [evidence,setEvidence]=useState<Record<string,MissionEvidence>>(()=>readEvidence(evidenceKey));
  useEffect(()=>setEvidence(readEvidence(evidenceKey)),[evidenceKey]);
  const [completion,setCompletion]=useState<Record<string,number>>({});
  const steps = demoTourSteps(session,tour); const index = Math.min(progress.step, steps.length - 1); const baseStep = steps[index]; const step=completion.work_checks===0&&baseStep.goal==='photos'?{...baseStep,text:'Abre Fotos de la intervención y añade una imagen ficticia del trabajo. Este parte no tiene checks de equipo; la foto puede quedar vinculada al propio parte. Guarda y envía los cambios.',route:baseStep.route.replace('vista=checks','vista=work'),target:'.component-photo'}:baseStep;
  useEffect(()=>{
    if(!progress.open || !roleSwitchAvailable) return;
    let active=true; let pending=false;
    const update=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;try{const value=await publicDemoService.progress(session,step.goal);if(active){setCompletion(value);setEvidence(previous=>{const next={...previous};steps.forEach((mission,n)=>{if(mission.goal&&(!mission.requiredRole||mission.requiredRole===session.role)&&Number.isFinite(value[mission.goal]))next[n]=observeMission(previous[n],value[mission.goal]);});try{localStorage.setItem(evidenceKey,JSON.stringify(next));}catch{}return next;});}}catch{/* Older demo SQL keeps the guide manual. */}finally{pending=false;}};
    void update();const timer=setInterval(()=>void update(),2000);window.addEventListener('focus',update);window.addEventListener('dmp-offline-queue-changed',update);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('dmp-offline-queue-changed',update);};
  },[session.role,session.id,progress.open,roleSwitchAvailable,index,tour,evidenceKey]);
  const required=step.requiredRole&&step.requiredRole!==session.role?step.requiredRole:step.role;
  const detected=Boolean(evidence[index]?.saved);
  const automatic=progress.open&&!paused&&!required&&!step.finale&&tour!=='updates';
  const advance=()=>{const key=tour+':'+index;if(lastAdvanced.current===key||index>=steps.length-1)return;lastAdvanced.current=key;setProgress({step:index+1,open:true});setExpanded(false);};
  useEffect(()=>{if(!progress.open)return;const scan=()=>setFormOpen(Boolean(document.querySelector('[role="dialog"],.mini-modal')));scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[progress.open]);
  useEffect(()=>{if(automatic&&!formOpen&&(detected||(step.goal==='checks'&&completion.work_checks===0)))advance();},[automatic,detected,formOpen,index,tour,completion.work_checks]);
  useEffect(()=>{const path=location.pathname+location.search;const before=lastLocation.current;lastLocation.current=path;if(!automatic||before===path)return;if(navigationCompletes(step,before,path))advance();else {const found=navigationMission(steps,index,path,session.role);if(found>=0){setProgress({step:found,open:true});setExpanded(false);}}},[location.pathname,location.search,automatic,index,tour]);
  useEffect(()=>{if(!automatic)return;const click=(event:Event)=>{const element=event.target instanceof Element?event.target.closest('button,a,summary'):null;if(!element||element.closest('.demo-guide,[role="dialog"],.mini-modal'))return;if(interactionCompletes(step,(element.textContent??'').trim()))advance();};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);},[automatic,index,tour]);
  if (!progress.open) return null;
  const go = (next: number) => { setProgress({ step: next, open: true }); if(!steps[next].requiredRole||steps[next].requiredRole===session.role)navigate(steps[next].route); };
  const showTask = () => {
    if (location.pathname !== step.route.split('?')[0] || location.search !== (step.route.includes('?') ? '?' + step.route.split('?')[1] : '')) navigate(step.route);
    else findDemoTarget(step)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  };
  const copy = guideCopy(step);
  if(minimized||formOpen)return <>{!required&&<DemoSpotlight step={step} number={index+1}/>}<aside className="demo-guide demo-guide-mini" aria-label="Guía reducida"><button type="button" disabled={formOpen} onClick={()=>{setMinimized(false);setExpanded(true);}}><Sparkles size={16}/>{index+1}/{steps.length} · {step.title}<span>{formOpen?'Te acompaño en el formulario':'Continuar guía'}</span></button></aside></>;
  return <>{!required&&!step.finale&&<DemoSpotlight step={step} number={index + 1} />}<aside className="demo-guide demo-guide-v2" data-expanded={expanded} data-compact={expanded?'false':'true'} aria-label="Guía de primeros pasos">
    <header><span className="demo-guide-brand"><Sparkles size={14}/> TU GUÍA DMP</span>{tour!=='updates'&&!step.finale&&<button type="button" className="demo-guide-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Menos detalle':'Cómo hacerlo'}</button>}<button type="button" className="demo-auto-toggle" aria-pressed={!paused} onClick={()=>setPaused(!paused)}>{paused?'Reanudar guía':'Pausar'}</button><button type="button" className="demo-minimize" onClick={()=>setMinimized(true)}>Reducir</button><button type="button" aria-label="Ocultar guía" onClick={()=>setProgress({...progress,open:false})}><X size={18}/></button></header>
    {onTour&&<details className="demo-tour-picker"><summary>Cambiar recorrido</summary><div className="demo-path-options"><button type="button" aria-pressed={tour==='discover'} onClick={()=>onTour('discover')}>Visita rápida · 3 min</button><button type="button" aria-pressed={tour==='connected'} onClick={()=>onTour('connected')}>Mi recorrido completo</button></div></details>}
    {onTour&&<div className="demo-guide-tours" role="group" aria-label="Recorrido de la guía"><button type="button" aria-pressed={tour==='work'} onClick={()=>onTour('work')}>Trabajo y facturación</button><button type="button" aria-pressed={tour==='purchases'} onClick={()=>onTour('purchases')}>Materiales y compras</button><button type="button" aria-pressed={tour==='updates'} onClick={()=>onTour('updates')}>App al día</button></div>}
    <div className="demo-mission-heading"><span className="demo-mission-number">{String(index+1).padStart(2,'0')}</span><div><span className="demo-mission-kicker">{tour==='updates'?'BUENOS HÁBITOS':tour==='connected'?'MI RECORRIDO COMPLETO':tour==='discover'?'DESCUBRE DMP':'TU SIGUIENTE MISIÓN'} · {index+1}/{steps.length}</span><h2>{step.title}</h2></div></div>
    {step.finale?<DemoJourneyFinish steps={steps} evidence={evidence} onTour={next=>{if(next===tour)go(0);else onTour?.(next);}}/>:tour==='updates'?<DemoUpdateLesson role={session.role}/>:<>
      <div className="demo-action-cue"><MousePointer2 size={18}/><p>{required?'Continúa como '+demoRoles.find(r=>r.id===required)?.title+'. Conservamos tu empresa y el punto del recorrido.':copy.action}</p></div>
      <div className="demo-guide-detail"><p>{step.text}</p><div className="demo-mission-benefit"><Sparkles size={15}/><p><strong>Lo que ganas con DMP</strong>{copy.benefit}</p></div>{step.goal&&<p className="demo-task-hint">{detected?'Acción guardada. La guía continúa al cerrar el formulario.':'Guarda la acción: la guía reconocerá el resultado y continuará.'}</p>}
      <details className="demo-mission-map"><summary>Ver las {steps.length} misiones</summary><ol>{steps.map((item,n)=><li key={item.title}><button type="button" aria-current={n===index?'step':undefined} onClick={()=>go(n)}><span>{n+1}</span>{item.title}{(sharedJourney(tour)?evidence[n]?.saved:demoStepDone(item,completion))&&<CheckCircle2 size={14} aria-label="Hay datos guardados"/>}</button></li>)}</ol></details></div>
      {step.goal&&sharedJourney(tour)&&<p className={'demo-save-status'+(detected?' is-saved':'')} role="status">{detected?'Acción detectada. Preparando la siguiente misión…':'La guía avanza cuando guardas. Puedes pausarla para explorar.'}</p>}<p className="demo-guide-rule">Tú trabajas. La guía sigue tus acciones.</p>
      <div className="demo-guide-progress" aria-label={'Paso '+(index+1)+' de '+steps.length}>{steps.map((item,n)=><i key={item.title} className={n<=index?'is-reached':''}/>)}</div>
    </>}
    <div className="demo-guide-actions">{tour==='updates'?<button type="button" onClick={()=>onTour?onTour('work'):setProgress({...progress,open:false})}>Volver al recorrido<ArrowRight size={16}/></button>:<><button type="button" disabled={index===0} aria-label="Paso anterior" onClick={()=>go(index-1)}><ArrowLeft size={16}/></button>{required?<button type="button" className="demo-guide-next" disabled={!roleSwitchAvailable} onClick={()=>void onRole(required).then(ok=>{if(ok!==false&&step.requiredRole)navigate(step.route);})}>Cambiar a {demoRoles.find(r=>r.id===required)?.title}<ArrowRight size={16}/></button>:!step.finale&&<button type="button" className="demo-guide-next" onClick={showTask}>Muéstrame dónde<MousePointer2 size={15}/></button>}<button type="button" onClick={()=>index===steps.length-1?setProgress({...progress,open:false}):go(index+1)}>{index===steps.length-1?'Terminar guía':'Omitir paso'}<ArrowRight size={15}/></button></>}</div>
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
        if(available){const prepared=await publicDemoService.prepareJourney(value.role);if(!active)return;await onRoleChanged(prepared,false);setSession(prepared);const chosen=tourFor(prepared.id);setTour(chosen);setProgress(progressFor(journeyProgressKey(prepared,chosen)));}
        else {setSession(value);const chosen=tourFor(value.id);setTour(chosen);setProgress(progressFor(journeyProgressKey(value,chosen)));}
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
    try{const next=await publicDemoService.prepareJourney(role);await onRoleChanged(next);setSession(next);setProgress(progressFor(journeyProgressKey(next,tour)));return true;}
    catch(reason){setRoleError(reason instanceof Error?reason.message:'No se ha podido cambiar el perfil.');return false;}
    finally{setSwitching(false);}
  };
  const changeTour=(next:DemoTour)=>{
    if(!session)return;setTour(next);setProgress({...progressFor(journeyProgressKey(session,next)),open:true});
    try{localStorage.setItem('dmp-demo-tour-choice:'+session.id,next);}catch{/* Selection remains usable in memory. */}
  };
  const saveProgress = (value: Progress) => {
    setProgress(value); if (!session) return;
    try { localStorage.setItem(`dmp-demo-tour:${journeyProgressKey(session,tour)}`, JSON.stringify(value)); } catch { /* Guide works for this session without persistence. */ }
  };
  if (!userId) return children;
  if (switching) return <main className="demo-state"><h1>Preparando el siguiente perfil…</h1><p>Conservando los datos de tu empresa de prueba.</p></main>;
  if (finishing) return <main className="demo-state"><h1>Finalizando tu prueba…</h1><p role="status">Cerrando el acceso y limpiando los datos de esta sesión.</p></main>;
  if (error) return <main className="demo-state"><h1>No se ha podido abrir la sesión de prueba</h1><p role="alert">{error}</p><button type="button" onClick={() => void finish()}>Finalizar y volver a la portada</button></main>;
  if (!session) return <main className="demo-state"><p role="status">Verificando tu espacio temporal…</p></main>;
  return <div className="public-demo-app" data-guide-open={progress.open ? 'true' : 'false'}><div className="demo-session-bar"><div><strong>DEMO · {demoRoles.find(role => role.id === session.role)?.title}</strong><span>Simulación · usa datos ficticios</span></div><small>{remaining} min de sesión</small>{journeys&&<button type="button" aria-expanded={roleMenu} onClick={()=>setRoleMenu(!roleMenu)}>Cambiar perfil</button>}<button type="button" onClick={() => saveProgress({ ...progress, open: !progress.open })}><BookOpen size={16} />Guía</button><button type="button" onClick={() => void finish()}><LogOut size={16} />Finalizar demo</button></div>{roleMenu&&<nav className="demo-role-menu" aria-label="Cambiar perfil de la prueba">{demoRoles.map(role=><button type="button" key={role.id} disabled={role.id===session.role} onClick={()=>void switchRole(role.id)}>{role.title}</button>)}<p>Misma empresa de prueba, permisos propios de cada perfil.</p></nav>}{roleError&&<p role="alert" className="demo-role-error">{roleError}</p>}{children}<DemoGuide session={session} progress={progress} setProgress={saveProgress} onRole={switchRole} roleSwitchAvailable={journeys} tour={tour} onTour={changeTour} /></div>;
}
