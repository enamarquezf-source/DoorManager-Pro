export const workCategories = [
  {id:'all',label:'Todos',description:'Toda la actividad',type:'Correctivo'},
  {id:'maintenance',label:'Mantenimiento',description:'Revisiones y trabajo preventivo',type:'Mantenimiento'},
  {id:'new_work',label:'Obra nueva',description:'Instalaciones y puesta en marcha',type:'Instalacion'},
  {id:'repair',label:'Reparaciones',description:'Averías, correctivos y garantías',type:'Correctivo'},
  {id:'improvement',label:'Mejoras',description:'Ampliaciones y actualización de equipos',type:'Mejora'},
  {id:'other',label:'Visitas y otros',description:'Visitas técnicas, comerciales e inspecciones',type:'Visita tecnica'},
] as const;
export function workCategory(type?:string|null){
  if(['Mantenimiento','Preventivo'].includes(type??''))return 'maintenance';
  if(type==='Instalacion')return 'new_work';
  if(['Correctivo','Averia urgente','Garantia'].includes(type??''))return 'repair';
  if(type==='Mejora')return 'improvement';
  return 'other';
}
export function monthDate(anchor:string,months:number){
  const [year,month,day]=anchor.split('-').map(Number);
  const end=new Date(Date.UTC(year,month-1+months+1,0));
  return new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),Math.min(day,end.getUTCDate()))).toISOString().slice(0,10);
}
export function maintenanceDates(start:string,end:string,first:string,months:number,custom:string[]=[]){
  if(!start||!end||start>end) return [];
  if(months===0)return [...new Set(custom)].filter(date=>date>=start&&date<=end).sort();
  if(![1,2,3,4,6,12].includes(months)||!first||first<start||first>end)return [];
  const dates:string[]=[];
  for(let index=0;index<121;index++){const date=monthDate(first,index*months);if(date>end)break;dates.push(date);}
  return dates;
}
