import { localDateKey } from './localDate';
export function planningDays(anchor: string, view: 'month' | 'week') {
 const date = new Date(`${anchor}T12:00:00`);
 if(view === 'month') date.setDate(1);
 date.setDate(date.getDate() - (date.getDay() + 6) % 7);
 return Array.from({length:view === 'month'?42:7},(_,index)=>{const day=new Date(date);day.setDate(day.getDate()+index);return localDateKey(day);});
}
export function movePlanningDate(anchor:string, view:'month'|'week', direction:number) {
 const date=new Date(`${anchor}T12:00:00`);
 if(view==='month'){date.setDate(1);date.setMonth(date.getMonth()+direction);}else date.setDate(date.getDate()+direction*7);
 return localDateKey(date);
}
export function planningEntries(works:any[]) {
 return works.flatMap(work=>{
  const assignments=(work.assignments??[]).filter((row:any)=>row.assignment_date&&!row.deleted_at&&row.status!=='Cancelado');
  const rows=assignments.map((assignment:any)=>({work,date:assignment.assignment_date,technicianId:assignment.technician_id??'',name:[assignment.profiles?.first_name,assignment.profiles?.last_name].filter(Boolean).join(' ')||'Técnico',start:assignment.planned_start_time??work.scheduled_time??'',end:assignment.planned_end_time??'',assignmentId:assignment.id,role:'technical'}));
  const responsible=work.responsible;
  const commercial=responsible?.primary_area==='Comercial'||responsible?.profile_roles?.some((row:any)=>row.roles?.name==='Comercial');
  if(commercial&&work.current_responsible_id&&work.scheduled_date&&!rows.some((row:any)=>row.technicianId===work.current_responsible_id))rows.push({work,date:work.scheduled_date,technicianId:work.current_responsible_id,name:[responsible.first_name,responsible.last_name].filter(Boolean).join(' ')||'Comercial',start:work.scheduled_time??'',end:'',assignmentId:'commercial',role:'commercial'});
  return rows.length?rows:work.scheduled_date?[{work,date:work.scheduled_date,technicianId:'',name:'Sin asignar',start:work.scheduled_time??'',end:'',assignmentId:'',role:'unassigned'}]:[];
 }).sort((a,b)=>`${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}
