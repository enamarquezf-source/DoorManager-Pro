import type { ReactNode } from 'react';
import { LayoutDashboard } from 'lucide-react';

export function SectionHeader({title,description,eyebrow,action,icon}:{title:string;description:string;eyebrow?:string;action?:ReactNode;icon?:ReactNode}) {
 return <header className="flow-hero section-header"><div><span className="section-header-eyebrow">{icon??<LayoutDashboard size={15} aria-hidden="true"/>}{eyebrow??'GESTIÓN Y SEGUIMIENTO'}</span><h2>{title}</h2><p>{description}</p></div>{action&&<div className="section-header-action">{action}</div>}</header>;
}
