import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type StudySources } from '../shared/costStudy';

export function StudyWorkCoverage({ sources }: { sources: StudySources }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const complete = sources.work_scope_version === 2;
  const hourIds = useMemo(() => new Set(sources.time_entries.map(row => row.work_order_id)), [sources]);
  const groups = [
    { id: 'all', label: complete ? 'Todos los incluidos' : 'Partes con horas', count: sources.works.length },
    { id: 'hours', label: 'Con horas', count: sources.works.filter(work => hourIds.has(work.id)).length },
    { id: 'invoiced', label: 'Facturados en el periodo', count: complete ? sources.works.filter(work => work.invoiced_in_period).length : null },
    { id: 'completed', label: 'Terminados en el periodo', count: complete ? sources.works.filter(work => work.completed_in_period).length : null },
  ];
  const rows = sources.works.filter(work => (filter === 'all' || (filter === 'hours' && hourIds.has(work.id)) || (filter === 'invoiced' && work.invoiced_in_period) || (filter === 'completed' && work.completed_in_period)) && `${work.code} ${work.type}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).sort((a,b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  const lastPage = Math.max(0, Math.ceil(rows.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  return <section className="study-surface study-work-coverage"><div className="study-section-heading"><div><h4>Partes de la empresa en el periodo</h4><p>{sources.period_from && sources.period_to ? `${sources.period_from.split('-').reverse().join('/')} — ${sources.period_to.split('-').reverse().join('/')}` : 'Según las fechas seleccionadas en el estudio'}</p></div></div>
    <p className="study-footnote">Con horas: fecha de las imputaciones. Facturados: fecha de emisión de su factura, excluyendo borradores y canceladas. Terminados: fecha de finalización registrada y estado terminado al tomar la captura. Los partes antiguos sin fecha de finalización no se pueden asignar a un periodo como terminados. Un parte puede aparecer en varios grupos; sus contadores no se suman.</p>
    {!complete && <p className="study-data-note">Esta captura solo contiene partes con horas. No permite contar todos los facturados o terminados. Los estudios nuevos con el desglose ampliado incluyen también partes sin horas.</p>}
    <div className="study-coverage-filters" role="group" aria-label="Filtrar partes de empresa">{groups.map(group => <button type="button" key={group.id} disabled={group.count == null} aria-pressed={filter === group.id} onClick={() => { setFilter(group.id); setPage(0); }}><span>{group.label}</span><strong>{group.count ?? 'Sin desglose'}</strong></button>)}</div>
    <label>Buscar por código o tipo<input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar parte…" /></label>
    <div className="table-card"><table><thead><tr><th>Parte</th><th>Tipo</th><th>Estado actual</th><th>Horas en el periodo</th><th>Facturado en el periodo</th></tr></thead><tbody>{rows.slice(currentPage*20,currentPage*20+20).map(work => <tr key={work.id}><td><Link to={`/app/partes/${work.id}`}>{work.code}</Link></td><td>{work.type}</td><td>{work.status}</td><td>{hourIds.has(work.id) ? 'Con horas registradas' : 'Sin horas registradas'}</td><td>{complete ? work.invoiced_in_period ? 'Sí' : 'No' : 'Sin desglose'}</td></tr>)}</tbody></table></div>
    {!rows.length && <p className="study-empty">No hay partes que coincidan con este filtro y periodo.</p>}
    <div className="study-hours-pagination"><small>{rows.length} partes · página {currentPage+1} de {lastPage+1}</small>{lastPage > 0 && <><button type="button" disabled={currentPage===0} onClick={() => setPage(currentPage-1)}>Anterior</button><button type="button" disabled={currentPage===lastPage} onClick={() => setPage(currentPage+1)}>Siguiente</button></>}</div>
  </section>;
}
