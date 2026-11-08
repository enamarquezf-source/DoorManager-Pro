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
  if(assignments.length)return assignments.map((assignment:any)=>({work,date:assignment.assignment_date,technicianId:assignment.technician_id??'',name:[assignment.profiles?.first_name,assignment.profiles?.last_name].filter(Boolean).join(' ')||'Técnico',start:assignment.planned_start_time??work.scheduled_time??'',end:assignment.planned_end_time??'',assignmentId:assignment.id}));
  return work.scheduled_date?[{work,date:work.scheduled_date,technicianId:'',name:work.main_technician_name||'Sin técnico asignado',start:work.scheduled_time??'',end:'',assignmentId:''}]:[];
 }).sort((a,b)=>`${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}
