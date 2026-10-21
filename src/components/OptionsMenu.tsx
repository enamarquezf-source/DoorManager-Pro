import { useEffect,useRef,type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
export function OptionsMenu({children,label='Opciones'}:{children:ReactNode;label?:string}) {
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const close=(event:MouseEvent)=>{if(ref.current?.open&&!ref.current.contains(event.target as Node))ref.current.open=false;};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
  document.addEventListener('mousedown',close);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key);};
 },[]);
 return <details className="options-menu" ref={ref}><summary><MoreHorizontal size={17} aria-hidden="true"/>{label}</summary><div className="options-menu-panel">{children}</div></details>;
}
