import type { DemoSession, DemoTour } from './model';
export const sharedJourney = (tour:DemoTour) => tour==='connected'||tour==='discover';
export function journeyProgressKey(session: DemoSession, tour: DemoTour) {
 const key = session.id + ':' + (sharedJourney(tour) ? 'journey' : session.role) + ':' + tour;
 if(tour==='discover')return key+':v3';
 return tour === 'connected' || (tour === 'work' && session.role === 'Tecnico') ? key + ':v2' : key;
}
export type MissionEvidence = { baseline:number; saved:boolean; scope?:string };
/** Counts are observations, not proof that a particular invoice belongs to a particular work. */
export function observeMission(previous:MissionEvidence|undefined,count:number):MissionEvidence {
 return previous?{...previous,saved:previous.saved||count>previous.baseline}:{baseline:count,saved:false};
}
export function readEvidence(key:string):Record<string,MissionEvidence> {
 try {const value=JSON.parse(localStorage.getItem(key)??'{}');return Object.fromEntries(Object.entries(value).filter(([,v]:[string,any])=>v&&Number.isFinite(v.baseline)&&typeof v.saved==='boolean')) as Record<string,MissionEvidence>;}catch{return {};}
}
