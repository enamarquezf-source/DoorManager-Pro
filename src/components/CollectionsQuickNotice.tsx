import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarDays } from 'lucide-react';
import type { Profile } from '../shared/types';
import { hasPermission } from '../auth/permissions';
import { billingService } from '../services/billingService';
import { queryKeys } from '../query/queryKeys';
import { collectionItems, collectionTotals } from '../shared/collectionsOverview';
import { localDateKey } from '../shared/localDate';
import { collectionMoney } from './CollectionsBoard';

export function CollectionsQuickNotice({profile}: {profile: Profile}) {
  const [today,setToday] = useState(localDateKey);
  const allowed = hasPermission(profile,'billing.read');
  const query = useQuery({queryKey:queryKeys.collections(profile.company_id,profile.id),queryFn:()=>billingService.invoices(),enabled:allowed,staleTime:60000,refetchInterval:60000,refetchOnWindowFocus:true});
  useEffect(()=>{const interval=window.setInterval(()=>setToday(localDateKey()),30000);return()=>window.clearInterval(interval);},[]);
  if(!allowed) return null;
  if(query.isError) return <Link to="/app/modulos/cobros" className="collections-quick is-unavailable"><AlertCircle size={18}/><span>No se han podido actualizar los cobros<small>Abre Cobros para revisar la información</small></span></Link>;
  if(!query.data) return null;
  const items = collectionItems(query.data,today);
  const overdue = collectionTotals(items.filter(item=>item.bucket==='overdue'));
  const dueToday = collectionTotals(items.filter(item=>item.bucket==='today'));
  if(!overdue.count&&!dueToday.count) return null;
  return <Link to={`/app/modulos/cobros?urgencia=${overdue.count?'overdue':'today'}`} className={`collections-quick${overdue.count?' is-overdue':''}`} aria-label={overdue.count?`${overdue.count} facturas vencidas, ${collectionMoney(overdue.amount)} pendientes. Abrir cobros.`:`${dueToday.count} facturas vencen hoy. Abrir cobros.`}><span className="collections-quick-icon"><CalendarDays size={19}/><b>{overdue.count||dueToday.count}</b>{overdue.count>0&&<i className="collections-pulse" aria-hidden="true"/>}</span><span><strong>{overdue.count?`${overdue.count} ${overdue.count===1?'cobro vencido':'cobros vencidos'}`:`${dueToday.count} ${dueToday.count===1?'cobro vence':'cobros vencen'} hoy`}</strong><small>{collectionMoney(overdue.count?overdue.amount:dueToday.amount)} pendientes</small></span></Link>;
}
