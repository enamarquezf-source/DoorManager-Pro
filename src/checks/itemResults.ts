export type CheckItem = {id:string;title:string;component?:string};
export const itemProblemStatuses = ['Problema leve','No favorable','Favorable tras intervención','Favorable tras intervencion'];
export function selectedCheckItemIds(items:CheckItem[],references:string[]) {
 return [...new Set(references.flatMap(reference=>{
  if(items.some(item=>item.id===reference))return [reference];
  const matches=items.filter(item=>(item.component||item.title)===reference);
  return matches.length===1?[matches[0].id]:[];
 }))];
}
export function checkItemResults(items:CheckItem[],status:string,selected:string[],notes:Record<string,string>,observations:string,remainingFavorable:boolean,favorableItemIds:string[]=[]) {
 const ids=selectedCheckItemIds(items,selected);
 const problem=itemProblemStatuses.includes(status);
 const persisted=status.replace('Favorable tras intervención','Favorable tras intervencion');
 return items.map(item=>({id:item.id,result:problem?(ids.includes(item.id)?persisted:remainingFavorable||favorableItemIds.includes(item.id)?'Todo favorable':'Sin revisar'):persisted,observations:problem&&ids.includes(item.id)?(notes[item.id]?.trim()||observations.trim()||null):null}));
}
export function validateCheckItemSelection(items:CheckItem[],status:string,selected:string[],notes:Record<string,string>,observations:string) {
 if(!itemProblemStatuses.includes(status))return '';
 if(!items.length)return observations.trim()?'':'Describe la incidencia de esta zona.';
 const ids=selectedCheckItemIds(items,selected);
 if(!ids.length)return 'Selecciona al menos un elemento con incidencia.';
 if(items.some(item=>ids.includes(item.id)&&!notes[item.id]?.trim()&&!observations.trim()))return 'Describe qué le ocurre a cada elemento seleccionado.';
 return '';
}
