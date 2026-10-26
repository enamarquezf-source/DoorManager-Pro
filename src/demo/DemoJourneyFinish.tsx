import {useState} from 'react';
import type { DemoStep, DemoTour } from './model';
import type { MissionEvidence } from './journey';
export function DemoJourneyFinish({steps,evidence,onTour}:{steps:DemoStep[];evidence:Record<string,MissionEvidence>;onTour?:(tour:DemoTour)=>void}) {
 const [contactOpen,setContactOpen]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const saved=steps.filter((step,index)=>step.goal&&evidence[index]?.saved);
 const handsOn=steps.some(step=>step.goal);
 const configured=import.meta.env.VITE_DEMO_CONTACT_URL??'mailto:enamarquezf@gmail.com?subject=Quiero%20probar%20DMP%20en%20mi%20empresa';
 let contact:string|undefined;try{const url=new URL(configured);if(url.protocol==='https:'||url.protocol==='mailto:')contact=url.href;}catch{/* Contact is optional until the owner supplies a destination. */}
 const email=contact?.startsWith('mailto:')?decodeURIComponent(new URL(contact).pathname):undefined;
 const copy=async()=>{try{await navigator.clipboard.writeText(email!);setCopyStatus('Correo copiado. Pégalo en tu servicio de correo cuando quieras.');}catch{setCopyStatus('Selecciona la dirección y cópiala manualmente. No se ha enviado ningún mensaje.');}};
 return <section className="demo-journey-finish"><p className="demo-finish-lead">Un equipo. Un circuito. Información que llega hasta Gerencia.</p><p>{handsOn?'Has explorado el recorrido. Llegar aquí no significa que hayas guardado o cerrado todas las operaciones.':'Has descubierto los casos preparados de campo, Oficina y Gerencia. Ahora puedes crear tus propios datos ficticios y seguir su recorrido.'}</p>
 {handsOn&&<details><summary>{saved.length} acciones con cambios detectados</summary>{saved.length?<ul>{saved.map(step=><li key={step.title}>{step.title}</li>)}</ul>:<p>Aún no hemos detectado nuevas acciones guardadas durante estas misiones.</p>}<small>Detectamos aumentos de registros durante cada misión. Revisa en la app el estado y los vínculos del parte, factura y cobro.</small></details>}
 <p><strong>Para probar DMP en tu empresa</strong><br/>Prepara un caso habitual: cómo llega el aviso, quién lo asigna y qué necesitas conocer al terminar. Este entorno es temporal; continúa usando datos ficticios.</p>
 {contact&&<><button type="button" className="demo-trial-contact" aria-expanded={contactOpen} onClick={()=>setContactOpen(!contactOpen)}>Quiero probar DMP en mi empresa</button>{contactOpen&&<section className="demo-contact-panel" aria-label="Contacto para probar DMP"><strong>Hablemos de tu empresa</strong><p>Escríbenos indicando tu actividad y qué te gustaría probar. Este botón no envía correos ni abre otra aplicación.</p>{email?<><label>Correo de contacto<input aria-label="Correo de contacto" readOnly value={email} onFocus={event=>event.target.select()}/></label><button type="button" onClick={()=>void copy()}>Copiar correo</button><p role="status">{copyStatus||'Puedes usar Gmail, Outlook o el servicio de correo que prefieras.'}</p></>:<a href={contact} target="_blank" rel="noopener noreferrer">Abrir página de contacto</a>}</section>}</>}<button type="button" onClick={()=>onTour?.('connected')}>Crear mi propio recorrido</button><button type="button" onClick={()=>onTour?.('purchases')}>Explorar materiales y compras</button><button type="button" onClick={()=>onTour?.('updates')}>Mantener DMP al día</button></section>;
}
