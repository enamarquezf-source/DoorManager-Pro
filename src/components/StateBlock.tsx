import type {ReactNode} from 'react';

type Props={loading?:boolean;error?:unknown;retry?:()=>void;empty?:boolean;children?:ReactNode;keepChildrenMounted?:boolean};
function Notice({title,children}:{title:string;children:ReactNode}) {
 return <section className="card"><header><h3>{title}</h3></header>{children}</section>;
}
export function StateBlock({loading,error,retry,empty,children,keepChildrenMounted=false}:Props) {
 let notice:ReactNode=null;
 let blocking=false;
 if(loading){blocking=true;notice=<Notice title="Cargando"><p className="large-note" role="status" aria-live="polite">Cargando datos…</p></Notice>;}
 else if(error&&empty){blocking=true;notice=<Notice title="No se han podido cargar los datos"><p className="form-error" role="alert">{String(error)}</p>{retry&&<button type="button" className="primary" onClick={retry}>Volver a intentar</button>}</Notice>;}
 else if(empty){blocking=true;notice=<Notice title="Sin resultados"><p className="large-note">No hay registros que coincidan con esta selección.</p>{retry&&<button type="button" onClick={retry}>Actualizar listado</button>}</Notice>;}
 else if(error){notice=<div className="state-warning" role="alert"><span>{String(error)}</span>{retry&&<button type="button" onClick={retry}>Volver a intentar</button>}</div>;}
 // Lists contain creation dialogs as well as rows. Their first record must be
 // creatable while empty, and refreshing the list must not discard a draft.
 if(blocking&&!keepChildrenMounted)return <>{notice}</>;
 return <>{notice}{children}</>;
}
