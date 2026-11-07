import {demoPurchaseInvoiceRoute} from './purchaseFocus';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, LogOut, X } from 'lucide-react';
import { publicDemoService } from './service';
import { demoRoles, demoTourSteps, demoStepDone, type DemoRole, type DemoSession, type DemoTour } from './model';
import { DemoSpotlight, findDemoTarget, isDemoTaskSurface, checkTaskHint } from './DemoSpotlight';
import { DemoUpdateLesson } from './DemoUpdateLesson';
import { guideCopy } from './guideCopy';
import {journeyProgressKey,sharedJourney,observeMission,readEvidence,type MissionEvidence} from './journey';
import {DemoJourneyFinish} from './DemoJourneyFinish';
import {readDemoWork,rememberDemoWork} from './workFocus';
import {navigationCompletes,interactionCompletes} from './autoGuide';
import { Sparkles, CheckCircle2, MousePointer2 } from 'lucide-react';

type Progress = { step: number; open: boolean };
type RoleContinuation = {step:number;route:string};
function tourFor(id:string):DemoTour {try{const value=localStorage.getItem('dmp-demo-tour-choice:'+id);return value==='purchases'||value==='updates'||value==='connected'||value==='discover'?value:'work';}catch{return 'work';}}
function progressFor(id: string): Progress {
  try {
    const stored = localStorage.getItem(`dmp-demo-tour:${id}`);
    const legacyKey = id.endsWith(':v2') && stored === null ? id.slice(0, -3) : null;
    const value = JSON.parse(stored ?? (legacyKey ? localStorage.getItem(`dmp-demo-tour:${legacyKey}`) : null) ?? 'null');
    if (Number.isInteger(value?.step) && value.step >= 0 && typeof value.open === 'boolean') {
      const removedStep = legacyKey?.endsWith(':connected') ? 7 : 3;
      return { step: legacyKey && value.step > removedStep ? value.step - 1 : value.step, open: value.open };
    }
  } catch { /* Start with the guide if storage is unavailable. */ }
  return { step: 0, open: true };
}
export function DemoGuide({ session, progress, setProgress, onRole, roleSwitchAvailable=true, tour='work', onTour }: { session: DemoSession; progress: Progress; setProgress: (value: Progress) => void; onRole: (role:DemoRole,continuation?:RoleContinuation)=>Promise<void|boolean>; roleSwitchAvailable?:boolean; tour?:DemoTour; onTour?:(tour:DemoTour)=>void }) {
  const navigate = useNavigate();
  const location=useLocation();
  const [expanded,setExpanded]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [paused,setPaused]=useState(false);
  const [formOpen,setFormOpen]=useState(false);
  const [smallScreen,setSmallScreen]=useState(()=>window.innerWidth<=540);
  const [compactReview,setCompactReview]=useState(false);
  const [reviewHint,setReviewHint]=useState('Elige el resultado de este bloque');
  const lastLocation=useRef(location.pathname+location.search);
  const lastAdvanced=useRef('');
  const [launchTask,setLaunchTask]=useState(false);
  const [launchFailure,setLaunchFailure]=useState('');
  const launchMission=useRef('');
  const [focusedWork,setFocusedWork]=useState(()=>readDemoWork(session.company_id));
  useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.companyId===session.company_id)setFocusedWork(readDemoWork(session.company_id));};window.addEventListener('dmp-demo-work-created',changed);return()=>window.removeEventListener('dmp-demo-work-created',changed);},[session.company_id]);
  const pathWork=session.role==='Tecnico'?location.pathname.match(/^\/app\/tecnico\/trabajo\/([^/]+)/)?.[1]:undefined;
  const [technicalWork,setTechnicalWork]=useState(pathWork??session.work_order_id);
  useEffect(()=>{if(pathWork)setTechnicalWork(pathWork);},[pathWork]);
  const guidedWork=session.role==='Tecnico'?(pathWork??technicalWork??session.work_order_id):(focusedWork??session.work_order_id);
  const evidenceKey='dmp-demo-evidence:'+journeyProgressKey(session,tour)+(session.role==='Tecnico'&&guidedWork?':'+guidedWork:'');
  const [evidence,setEvidence]=useState<Record<string,MissionEvidence>>(()=>readEvidence(evidenceKey));
  useEffect(()=>setEvidence(readEvidence(evidenceKey)),[evidenceKey]);
  const [snapshot,setCompletion]=useState<{scope:string;value:Record<string,number>}>();
  const completion=snapshot?.scope===evidenceKey?snapshot.value:{};
  const steps = demoTourSteps(guidedWork?{...session,work_order_id:guidedWork}:session,tour).map(mission=>mission.title==='Registra la factura del proveedor'?{...mission,route:demoPurchaseInvoiceRoute(session.company_id)}:mission); const index = Math.min(progress.step, steps.length - 1); const step = steps[index];
  useEffect(()=>{
    if(!progress.open || !roleSwitchAvailable) return;
    let active=true; let pending=false;
    const update=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;try{const value=await publicDemoService.progress(session,step.goal,guidedWork??undefined);if(active){setCompletion({scope:evidenceKey,value});setEvidence(previous=>{const next={...previous};steps.forEach((mission,n)=>{if(mission.goal&&(!mission.requiredRole||mission.requiredRole===session.role)&&Number.isFinite(value[mission.goal])){const scoped=mission.goal==='sat_approved'&&guidedWork;next[n]={...observeMission(scoped&&previous[n]?.scope!==guidedWork?undefined:previous[n],value[mission.goal]),...(scoped?{scope:guidedWork}:{})};}});try{localStorage.setItem(evidenceKey,JSON.stringify(next));}catch{}return next;});}}catch{/* Older demo SQL keeps the guide manual. */}finally{pending=false;}};
    void update();const timer=setInterval(()=>void update(),2000);window.addEventListener('focus',update);window.addEventListener('dmp-offline-queue-changed',update);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('dmp-offline-queue-changed',update);};
  },[session.role,session.id,progress.open,roleSwitchAvailable,index,tour,evidenceKey,guidedWork]);
  const required=step.requiredRole&&step.requiredRole!==session.role?step.requiredRole:step.role;
  const allChecks=step.goal==='checks'&&tour!=='discover';
  const checkTotal=step.goal==='checks'?completion.work_checks:undefined;
  const checkCount=Math.min(checkTotal??0,completion.checks??0);
  const detected=allChecks?(checkTotal??0)>0&&checkCount===checkTotal:Boolean(evidence[index]?.saved);
  const taskSurface=isDemoTaskSurface(step,location.pathname+location.search);
  const automatic=progress.open&&!paused&&!required&&!step.finale&&tour!=='updates';
  const advance=()=>{const key=tour+':'+index;if(lastAdvanced.current===key||index>=steps.length-1)return;lastAdvanced.current=key;setProgress({step:index+1,open:true});setExpanded(false);};
  useEffect(()=>{if(!progress.open)return;const scan=()=>{setSmallScreen(window.innerWidth<=540);setFormOpen(Boolean(document.querySelector('[role="dialog"],.mini-modal')));setCompactReview(window.innerWidth<=540&&Boolean(document.querySelector('main [data-demo-check-results]')));if(step.goal==='checks')setReviewHint(checkTaskHint(findDemoTarget(step)));};scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',scan);document.addEventListener('input',scan,true);document.addEventListener('change',scan,true);return()=>{observer.disconnect();window.removeEventListener('resize',scan);document.removeEventListener('input',scan,true);document.removeEventListener('change',scan,true);};},[progress.open,index,tour,step.goal]);
  useEffect(()=>{if(automatic&&!formOpen&&detected)advance();},[automatic,detected,formOpen,index,tour]);
  useEffect(()=>setLaunchFailure(''),[index,tour]);
  useEffect(()=>{const event=step.title==='Haz un estudio de costes'?'dmp-cost-study-saved':step.title==='Registra la factura del proveedor'?'dmp-supplier-payment-recorded':step.title==='Prepara un presupuesto'?'dmp-quote-line-saved':step.title==='Explora el contrato de mantenimiento'?'dmp-maintenance-saved':null;if(!automatic||!event)return;const saved=(received:Event)=>{if(event==='dmp-supplier-payment-recorded'&&(received as CustomEvent).detail?.id!==new URLSearchParams(location.search).get('id'))return;advance();};window.addEventListener(event,saved);return()=>window.removeEventListener(event,saved);},[automatic,index,tour,location.search]);
  useEffect(()=>{const expected=step.title==='Registra el envío del presupuesto'?'Enviado':step.title==='Simula la aceptación del cliente'?'Aceptado':null;if(!automatic||!expected)return;const saved=(event:Event)=>{if((event as CustomEvent).detail?.status===expected)advance();};window.addEventListener('dmp-quote-status-saved',saved);return()=>window.removeEventListener('dmp-quote-status-saved',saved);},[automatic,index,tour]);
  useEffect(()=>{if(!automatic||formOpen||step.title!=='Comprueba los conceptos')return;const scan=()=>{if(document.querySelector('main [data-economic-review="approved"]'))advance();};scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-economic-review']});return()=>observer.disconnect();},[automatic,formOpen,index,tour,location.pathname]);
  useEffect(()=>{const path=location.pathname+location.search;const before=lastLocation.current;lastLocation.current=path;if(automatic&&navigationCompletes(step,before,path))advance();},[location.pathname,location.search,automatic,index,tour]);
  useEffect(()=>{if(!automatic)return;const click=(event:Event)=>{const element=event.target instanceof Element?event.target.closest('button,a,summary'):null;if(!element||element.closest('.demo-guide,[role="dialog"],.mini-modal'))return;if(interactionCompletes(step,(element.textContent??'').trim()))advance();};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);},[automatic,index,tour]);
  const launchTarget=()=>{
    if(!isDemoTaskSurface(step,location.pathname+location.search))return false;
    const reveal:Record<string,RegExp>={times:/^Horas/,signatures:/^Firma/,work_materials:/^Material utilizado/};
    if(reveal[step.goal??''])for(const summary of document.querySelectorAll<HTMLElement>('main details>summary'))if(reveal[step.goal!].test((summary.textContent??'').trim()))summary.closest('details')!.open=true;
    const target=findDemoTarget(step);if(!target||target.closest('[role="dialog"],.mini-modal'))return false;
    // A page heading can appear before its action has loaded. Keep waiting for creation controls.
    if((['clients','sites','works','catalog_materials','suppliers','purchase_orders'].includes(step.goal??'')||['Un aviso, tres equipos','Tu jornada preparada','De campo a Oficina','Recibe un trabajo revisado','Cobros a la vista','Comprueba los pendientes','Entiende el margen','Compara margen y costes','Comprueba las existencias'].includes(step.title))&&!target.matches('button,a,summary'))return false;
    setLaunchTask(false);
    const safeClick=!['invoices','payments','completed_work','sat_approved','ordered_purchases','purchase_receipts','signatures'].includes(step.goal??'')&&step.title!=='Registra la factura del proveedor'&&step.title!=='Haz un estudio de costes';
    const confirmsResult=/^(Confirmar selección|Finalizar check|Reintentar finalizar y enviar)$/i.test((target.textContent??'').trim());
    if(safeClick&&!confirmsResult&&target.matches('button,a,summary')){target.click();return true;}
    target.scrollIntoView({behavior:'smooth',block:'center'});if(target.matches('input,textarea,select'))target.focus();return true;
  };
  useEffect(()=>{if(!launchTask||!progress.open)return;if(launchMission.current!==tour+':'+index){setLaunchTask(false);return;}let observer:MutationObserver|undefined;const open=()=>{if(!launchTarget())return false;setLaunchTask(false);return true;};if(open())return;observer=new MutationObserver(()=>{if(open())observer?.disconnect();});observer.observe(document.body,{childList:true,subtree:true});const stop=setTimeout(()=>{setLaunchTask(false);setLaunchFailure('Todavía no aparece la acción de este paso. Revisa que estés en el registro indicado y vuelve a probar.');},8000);return()=>{observer?.disconnect();clearTimeout(stop);};},[launchTask,location.pathname,location.search,index,tour,progress.open]);
  useEffect(()=>{if(!progress.open)return;const editing=(event:Event)=>{const target=event.target;if(target instanceof Element&&target.matches('input,select,textarea,canvas')&&target.closest('main')&&!target.closest('.demo-guide')){setExpanded(false);if(window.innerWidth<=540)setMinimized(true);}};document.addEventListener('focusin',editing);return()=>document.removeEventListener('focusin',editing);},[progress.open]);
  if (!progress.open) return null;
  const go = (next: number) => { lastAdvanced.current='';setExpanded(false);setMinimized(false);setProgress({ step: next, open: true }); if(!steps[next].requiredRole||steps[next].requiredRole===session.role)navigate(steps[next].route); };
  const showTask = () => {
    setLaunchFailure('');
    if(smallScreen)setExpanded(false);
    const here=isDemoTaskSurface(step,location.pathname+location.search);
    if(here&&launchTarget())return;
    launchMission.current=tour+':'+index;setLaunchTask(true);
    if(!here||location.search!==(step.route.includes('?')?'?'+step.route.split('?')[1]:''))navigate(step.route);
  };
  const copy = guideCopy(step);
  const readOnly=!step.goal&&!required&&!['Comprueba los conceptos','Haz un estudio de costes','Registra la factura del proveedor','Prepara un presupuesto','Registra el envío del presupuesto','Simula la aceptación del cliente','Valida el consumo del parte'].includes(step.title);
  const checkCue=checkTotal===0?'Este parte se creó sin equipo identificado. Puedes continuar con el registro del trabajo.':allChecks&&(checkTotal??0)>0?`${checkCount} de ${checkTotal} checks finalizados. Vuelve a la pestaña Checks para abrir el siguiente equipo.`:undefined;
  if(minimized||formOpen||(smallScreen&&!expanded))return <>{!required&&!step.finale&&taskSurface&&<DemoSpotlight step={step} number={index+1}/>}<aside className="demo-guide demo-guide-mini" aria-label="Guía reducida"><button type="button" disabled={formOpen} onClick={()=>{setMinimized(false);setExpanded(true);}}><Sparkles size={16}/><div>{index+1}/{steps.length} · {compactReview&&step.goal==='checks'?reviewHint:step.title}</div><span>{formOpen?'Te acompaño en el formulario':compactReview&&step.goal==='checks'?'Ver ayuda':smallScreen?'Ver paso':'Continuar guía'}</span></button></aside></>;
  return <>{!required&&!step.finale&&taskSurface&&<DemoSpotlight step={step} number={index + 1} />}<aside className="demo-guide demo-guide-v2" data-expanded={expanded} data-compact={expanded?'false':'true'} data-finale={step.finale||index===steps.length-1?'true':'false'} aria-label="Guía de primeros pasos">
    <header><span className="demo-guide-brand"><Sparkles size={14}/> TU GUÍA DMP</span>{(smallScreen||(tour!=='updates'&&!step.finale))&&<button type="button" className="demo-guide-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{smallScreen?'Reducir guía':expanded?'Cerrar ayuda':'Ayuda y recorrido'}</button>}<button type="button" className="demo-auto-toggle" aria-pressed={!paused} onClick={()=>setPaused(!paused)}>{paused?'Reanudar guía':'Pausar'}</button>{!smallScreen&&<button type="button" className="demo-minimize" onClick={()=>setMinimized(true)}>Reducir</button>}<button type="button" aria-label="Ocultar guía" onClick={()=>setProgress({...progress,open:false})}><X size={18}/></button></header>
    {onTour&&<details className="demo-tour-picker"><summary>Cambiar recorrido</summary><div className="demo-path-options"><button type="button" aria-pressed={tour==='discover'} onClick={()=>onTour('discover')}>Visita rápida · 3 min</button><button type="button" aria-pressed={tour==='connected'} onClick={()=>onTour('connected')}>Mi recorrido completo</button></div></details>}
    {onTour&&<div className="demo-guide-tours" role="group" aria-label="Recorrido de la guía"><button type="button" aria-pressed={tour==='work'} onClick={()=>onTour('work')}>Trabajo y facturación</button><button type="button" aria-pressed={tour==='purchases'} onClick={()=>onTour('purchases')}>Materiales y compras</button><button type="button" aria-pressed={tour==='updates'} onClick={()=>onTour('updates')}>App al día</button></div>}
    <div className="demo-mission-heading"><span className="demo-mission-number">{String(index+1).padStart(2,'0')}</span><div><span className="demo-mission-kicker">{tour==='updates'?'BUENOS HÁBITOS':tour==='connected'?'MI RECORRIDO COMPLETO':tour==='discover'?'DESCUBRE DMP':'TU SIGUIENTE MISIÓN'} · {index+1}/{steps.length}</span><h2>{step.title}</h2></div></div>
    {step.finale?<DemoJourneyFinish steps={steps} evidence={evidence} onTour={next=>{if(next===tour)go(0);else onTour?.(next);}}/>:tour==='updates'?<DemoUpdateLesson role={session.role}/>:<>
      <div className="demo-action-cue" aria-live="polite"><MousePointer2 size={18}/><p>{required?(tour==='discover'&&step.title==='De campo a Oficina'?'Tu check queda guardado. Cambia a Oficina para ver otro parte preparado, listo para facturar.':'La siguiente acción se realiza en '+demoRoles.find(r=>r.id===required)?.title+'. Entra con ese perfil para continuar con los mismos datos.'):(checkTotal===0?checkCue:copy.action)}</p></div>
      {checkCue&&checkTotal!==0&&<p className="demo-task-hint">{checkCue}</p>}{launchFailure&&<p className="demo-task-hint" role="status">{launchFailure}</p>}<div className="demo-guide-detail"><p>{step.text}</p><div className="demo-mission-benefit"><Sparkles size={15}/><p><strong>Lo que ganas con DMP</strong>{copy.benefit}</p></div>{step.goal&&<p className="demo-task-hint">{detected?'Acción guardada. La guía continúa al cerrar el formulario.':'Guarda la acción: la guía reconocerá el resultado y continuará.'}</p>}
      <details className="demo-mission-map"><summary>Ver las {steps.length} misiones</summary><ol>{steps.map((item,n)=><li key={item.title}><button type="button" aria-current={n===index?'step':undefined} onClick={()=>go(n)}><span>{n+1}</span>{item.title}{(sharedJourney(tour)?evidence[n]?.saved:demoStepDone(item,completion))&&<CheckCircle2 size={14} aria-label="Hay datos guardados"/>}</button></li>)}</ol></details></div>
      {step.goal&&sharedJourney(tour)&&<p className={'demo-save-status'+(detected?' is-saved':'')} role="status">{detected?'Acción detectada. Preparando la siguiente misión…':'La guía avanza cuando guardas. Puedes pausarla para explorar.'}</p>}<p className="demo-guide-rule">Tú trabajas. La guía sigue tus acciones.</p>
      <div className="demo-guide-progress" aria-label={'Paso '+(index+1)+' de '+steps.length}>{steps.map((item,n)=><i key={item.title} className={n<=index?'is-reached':''}/>)}</div>
    </>}
    <div className="demo-guide-actions">{tour==='updates'?<button type="button" onClick={()=>onTour?onTour('work'):setProgress({...progress,open:false})}>Volver al recorrido<ArrowRight size={16}/></button>:<><button type="button" disabled={index===0} aria-label="Paso anterior" onClick={()=>go(index-1)}><ArrowLeft size={16}/></button>{required?<button type="button" className="demo-guide-next" disabled={!roleSwitchAvailable} onClick={()=>{const continuation=tour==='work'&&step.title==='Coordina la ejecución con SAT'?{step:3,route:step.route}:tour==='work'&&step.title==='Comprueba la recepción en SAT'?{step:5,route:step.route}:tour==='work'&&step.title==='Continúa en Oficina'?{step:1,route:step.route}:undefined;void (continuation?onRole(required,continuation):onRole(required)).then(ok=>{if(ok!==false&&step.requiredRole)navigate(step.route);});}}>Entrar como {demoRoles.find(r=>r.id===required)?.title}<ArrowRight size={16}/></button>:!step.finale&&checkTotal!==0&&<button type="button" className="demo-guide-next" disabled={launchTask} onClick={showTask}>{launchTask?'Preparando la pantalla…':copy.cta}<MousePointer2 size={15}/></button>}<button type="button" className="demo-skip" onClick={()=>index===steps.length-1?setProgress({...progress,open:false}):go(index+1)}>{index===steps.length-1?'Terminar guía':checkTotal===0?'Continuar sin checks':readOnly?'Siguiente':'Omitir paso'}<ArrowRight size={15}/></button></>}</div>
  </aside></>;
}

export function PublicDemoBoundary({ userId, onFinish, onRoleChanged, children }: { userId: string | null; onFinish: () => Promise<void>; onRoleChanged: (session:DemoSession, navigateToHome?:boolean)=>Promise<void>; children: ReactNode }) {
  const navigate=useNavigate();
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
  const switchRole=async(role:DemoRole,continuation?:RoleContinuation)=>{
    if(switching||!session||role===session.role)return;
    setSwitching(true);setRoleError('');setRoleMenu(false);
    try{const next=await publicDemoService.prepareJourney(role);if(continuation){const workId=continuation.route.match(/^\/app\/partes\/([^/?]+)/)?.[1];if(workId)rememberDemoWork(next.company_id,workId);}const destination=continuation?{step:continuation.step,open:true}:progressFor(journeyProgressKey(next,tour));if(continuation){try{localStorage.setItem(`dmp-demo-tour:${journeyProgressKey(next,tour)}`,JSON.stringify(destination));}catch{}}await onRoleChanged(next,!continuation);setSession(next);setProgress(destination);if(continuation)navigate(continuation.route);return true;}
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
  return <div className="public-demo-app" data-guide-open={progress.open ? 'true' : 'false'}><div className="demo-session-bar"><div><strong>DEMO · {demoRoles.find(role => role.id === session.role)?.title}</strong><span>Simulación · usa datos ficticios</span></div><small>{remaining} min de sesión</small>{journeys&&<button type="button" aria-expanded={roleMenu} onClick={()=>setRoleMenu(!roleMenu)}>Cambiar perfil</button>}<button type="button" onClick={() => saveProgress({ ...progress, open: !progress.open })}><BookOpen size={16} />Guía</button><button type="button" onClick={() => void finish()}><LogOut size={16} />Finalizar demo</button></div>{roleMenu&&<nav className="demo-role-menu" aria-label="Cambiar perfil de la prueba">{demoRoles.map(role=><button type="button" key={role.id} disabled={role.id===session.role} onClick={()=>void switchRole(role.id)}>{role.title}</button>)}<p>Misma empresa de prueba, permisos propios de cada perfil.</p></nav>}{roleError&&<p role="alert" className="demo-role-error">{roleError}</p>}{children}<DemoGuide key={journeyProgressKey(session,tour)} session={session} progress={progress} setProgress={saveProgress} onRole={switchRole} roleSwitchAvailable={journeys} tour={tour} onTour={changeTour} /></div>;
}
