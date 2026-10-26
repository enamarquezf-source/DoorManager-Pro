import type { DemoStep, DemoTour } from './model';
import type { MissionEvidence } from './journey';
export function DemoJourneyFinish({steps,evidence,onTour}:{steps:DemoStep[];evidence:Record<string,MissionEvidence>;onTour?:(tour:DemoTour)=>void}) {
 const saved=steps.filter((step,index)=>step.goal&&evidence[index]?.saved);
 const configured=import.meta.env.VITE_DEMO_CONTACT_URL??'mailto:enamarquezf@gmail.com?subject=Quiero%20probar%20DMP%20en%20mi%20empresa';
 let contact:string|undefined;try{const url=new URL(configured);if(url.protocol==='https:'||url.protocol==='mailto:')contact=url.href;}catch{/* Contact is optional until the owner supplies a destination. */}
 return <section className="demo-journey-finish"><p className="demo-finish-lead">Un equipo. Un circuito. Información que llega hasta Gerencia.</p><p>Has explorado el recorrido. Llegar aquí no significa que hayas guardado o cerrado todas las operaciones.</p>
 <details><summary>{saved.length} acciones con cambios detectados</summary>{saved.length?<ul>{saved.map(step=><li key={step.title}>{step.title}</li>)}</ul>:<p>Aún no hemos detectado nuevas acciones guardadas durante estas misiones.</p>}<small>Detectamos aumentos de registros durante cada misión. Revisa en la app el estado y los vínculos del parte, factura y cobro.</small></details>
 <p><strong>Para probar DMP en tu empresa</strong><br/>Prepara un caso habitual: cómo llega el aviso, quién lo asigna y qué necesitas conocer al terminar. Este entorno es temporal; continúa usando datos ficticios.</p>
 {contact&&<a className="demo-trial-contact" href={contact} target="_blank" rel="noopener noreferrer">Quiero probar DMP en mi empresa</a>}<button type="button" onClick={()=>onTour?.('connected')}>Volver a mi recorrido completo</button><button type="button" onClick={()=>onTour?.('purchases')}>Explorar materiales y compras</button><button type="button" onClick={()=>onTour?.('updates')}>Mantener DMP al día</button></section>;
}
