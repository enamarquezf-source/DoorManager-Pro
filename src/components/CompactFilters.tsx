import { useEffect, useRef, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export function CompactFilters({children,count=0,onReset}:{children:ReactNode;count?:number;onReset?:()=>void}) {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=(event:MouseEvent)=>{if(ref.current?.open&&!ref.current.contains(event.target as Node))ref.current.open=false;};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key);};
  },[]);
  return <details ref={ref} className="compact-filters"><summary><SlidersHorizontal size={16} aria-hidden="true"/>Filtros{count>0&&<span className="compact-filter-count" aria-label={`${count} filtros aplicados`}>{count}</span>}</summary><div className="compact-filter-panel"><header><strong>Filtrar listado</strong><button type="button" aria-label="Cerrar filtros" onClick={()=>{if(ref.current)ref.current.open=false;ref.current?.querySelector('summary')?.focus();}}><X size={16}/></button></header>{children}<footer>{onReset&&<button type="button" onClick={onReset}>Limpiar filtros</button>}<button type="button" className="primary" onClick={()=>{if(ref.current)ref.current.open=false;}}>Ver resultados</button></footer></div></details>;
}
