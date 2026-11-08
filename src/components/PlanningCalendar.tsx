import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { localDateKey } from '../shared/localDate';
import { movePlanningDate, planningDays, planningEntries } from '../shared/planningCalendar';
import { canAssignTechnicalWorkOrder } from '../shared/assignmentEligibility';
import './PlanningCalendar.css';

export function PlanningCalendar({works,technicians,canCreate,canAssign,onCreate,onAssign}:{works:any[];technicians:any[];canCreate:boolean;canAssign:boolean;onCreate:(date:string)=>void;onAssign:(work:any,date:string)=>void}) {
 const today=localDateKey();
 const [selected,setSelected]=useState(today);
 const [anchor,setAnchor]=useState(today);
 const [view,setView]=useState<'month'|'week'>('month');
 const [technician,setTechnician]=useState('all');
 const entries=useMemo(()=>planningEntries(works),[works]);
 const filtered=entries.filter(row=>technician==='all'||(technician==='none'?!row.technicianId:row.technicianId===technician));
 const days=planningDays(anchor,view);
 const agenda=filtered.filter(row=>row.date===selected);
 const unplanned=works.filter(work=>!entries.some(row=>row.work.id===work.id)&&canAssignTechnicalWorkOrder(work));
 const people=[...technicians.map(person=>({id:person.id,name:[person.first_name,person.last_name].filter(Boolean).join(' ')})),...entries.filter(row=>row.technicianId&&!technicians.some(person=>person.id===row.technicianId)).map(row=>({id:row.technicianId,name:row.name}))].filter((person,index,array)=>array.findIndex(p=>p.id===person.id)===index);
 const dateTitle=new Date(`${selected}T12:00:00`).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
 return <div className="planning-calendar">
  <div className="planning-toolbar">
   <div className="planning-navigation"><button aria-label="Periodo anterior" onClick={()=>setAnchor(movePlanningDate(anchor,view,-1))}><ChevronLeft size={18}/></button><h2>{new Date(`${anchor}T12:00:00`).toLocaleDateString('es-ES',{month:'long',year:'numeric'})}</h2><button aria-label="Periodo siguiente" onClick={()=>setAnchor(movePlanningDate(anchor,view,1))}><ChevronRight size={18}/></button><button onClick={()=>{setAnchor(today);setSelected(today);}}>Hoy</button></div>
   <div className="planning-controls"><div className="tabs"><button aria-pressed={view==='month'} className={view==='month'?'active':''} onClick={()=>setView('month')}>Mes</button><button aria-pressed={view==='week'} className={view==='week'?'active':''} onClick={()=>{setAnchor(selected);setView('week');}}>Semana</button></div><label>Técnico<select value={technician} onChange={event=>setTechnician(event.target.value)}><option value="all">Todos los técnicos</option><option value="none">Sin asignar</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>
  </div>
  <div className="planning-grid" role="group" aria-label="Calendario de trabajos">
   {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><div className="planning-weekday" key={day}>{day}</div>)}
   {days.map(day=>{const rows=filtered.filter(row=>row.date===day);const count=new Set(rows.map(row=>row.work.id)).size;return <button key={day} type="button" aria-pressed={selected===day} aria-label={`${new Date(`${day}T12:00:00`).toLocaleDateString('es-ES')} · ${count} trabajos`} className={`planning-day ${day===selected?'selected':''} ${day===today?'today':''} ${day.slice(0,7)!==anchor.slice(0,7)?'outside':''}`} onClick={()=>setSelected(day)}><span className="planning-day-number">{Number(day.slice(-2))}</span>{rows.slice(0,2).map((row,index)=><span className="planning-preview" key={`${row.work.id}-${index}`}><b>{row.start.slice(0,5)||'Sin hora'}</b> {row.work.client_name||row.work.title}</span>)}{count>0&&<small>{count} {count===1?'trabajo':'trabajos'}</small>}</button>;})}
  </div>
  <section className="planning-agenda" aria-label="Agenda del día">
   <header><div><small>AGENDA DEL DÍA</small><h2>{dateTitle}</h2></div>{canCreate&&<button className="primary" onClick={()=>onCreate(selected)}><Plus size={17}/> Programar trabajo</button>}</header>
   {!agenda.length&&<p className="large-note">Sin trabajos programados para este día y filtro.</p>}
   {[...people,{id:'',name:'Sin técnico asignado'}].filter(person=>technician==='all'||(technician==='none'?!person.id:person.id===technician)).map(person=>{const rows=agenda.filter(row=>row.technicianId===person.id);return <div className="planning-person" key={person.id||'none'}><h3>{person.name}<span>{rows.length?`${rows.length} asignaciones`:'Sin trabajos programados'}</span></h3>{rows.map((row,index)=><article className="planning-work" key={`${row.work.id}-${index}`}><Link to={`/app/partes/${row.work.id}`}><strong>{row.start.slice(0,5)||'Sin hora'}{row.end&&`–${row.end.slice(0,5)}`} · {row.work.client_name||row.work.code}</strong><span>{row.work.title} · {row.work.site_name||'Sin centro'}</span><small>{row.work.code} · {row.work.type} · {row.work.status}</small></Link>{canAssign&&canAssignTechnicalWorkOrder(row.work)&&<button onClick={()=>onAssign(row.work,selected)}>Reprogramar / asignar</button>}</article>)}</div>;})}
  </section>
  {unplanned.length>0&&<details className="card planning-unplanned"><summary><CalendarDays size={18}/> Sin fecha · {unplanned.length} trabajos</summary>{unplanned.map(work=><div className="planning-work" key={work.id}><Link to={`/app/partes/${work.id}`}><strong>{work.client_name||work.code}</strong><span>{work.title}</span></Link>{canAssign&&<button onClick={()=>onAssign(work,selected)}>Programar este día</button>}</div>)}</details>}
 </div>;
}
