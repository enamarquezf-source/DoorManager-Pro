import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { type StudySources } from '../shared/costStudy';
import { studyHours } from '../shared/studyHours';

export function StudyHoursBreakdown({ sources }: { sources: StudySources }) {
  const [open, setOpen] = useState(false);
  const [employee, setEmployee] = useState('');
  const [page, setPage] = useState(0);
  const profiles = useMemo(() => new Map(sources.profiles.map(profile => [profile.id, `${profile.first_name} ${profile.last_name}`.trim()])), [sources]);
  const works = useMemo(() => new Map(sources.works.map(work => [work.id, work.code])), [sources]);
  const employees = [...new Set(sources.time_entries.map(row => row.profile_id))];
  const rows = useMemo(() => sources.time_entries.filter(row => !employee || row.profile_id === employee).sort((a, b) => a.work_date.localeCompare(b.work_date) || a.id.localeCompare(b.id)), [sources, employee]);
  const lastPage = Math.max(0, Math.ceil(rows.length / 25) - 1);
  const currentPage = Math.min(page, lastPage);
  const totalMinutes = rows.reduce((sum, row) => sum + Number(row.duration_minutes), 0);
  return <details className="study-hours-breakdown" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary><Clock3 size={16} /> Cómo se suman las horas · ver registros</summary>
    <p>Se suma el tiempo registrado por cada empleado en las fechas del estudio. <strong>Dos técnicos × 2 horas en el mismo parte = 4 horas de personal.</strong> No es la duración del parte ni la jornada de presencia.</p>
    <p><strong>Trabajo directo + desplazamientos = total imputado.</strong> Las horas de garantía ya están dentro de ese total: no se vuelven a sumar. «1 h 30 min» equivale a 1,5 horas, no a 1,30.</p>
    {open && <><label>Filtrar empleado<select value={employee} onChange={event => { setEmployee(event.target.value); setPage(0); }}><option value="">Toda la empresa</option>{employees.map(id => <option key={id} value={id}>{profiles.get(id) ?? 'Empleado sin nombre'}</option>)}</select></label>
      <div className="study-section-heading"><strong>{studyHours(totalMinutes / 60)} en {rows.length} registros</strong><small>Total de todos los registros del filtro</small></div>
      <div className="table-card"><table><thead><tr><th>Fecha</th><th>Empleado</th><th>Parte</th><th>Tipo de hora</th><th>Tiempo registrado</th></tr></thead><tbody>{rows.slice(currentPage * 25, currentPage * 25 + 25).map(row => <tr key={row.id}><td>{row.work_date.split('-').reverse().join('/')}</td><td>{profiles.get(row.profile_id) ?? 'Empleado sin nombre'}</td><td><Link to={`/app/partes/${row.work_order_id}`}>{works.get(row.work_order_id) ?? 'Abrir parte'}</Link></td><td>{({ normal: 'Normal', desplazamiento: 'Desplazamiento', nocturna: 'Nocturna', festiva: 'Festiva', otra: 'Otra' } as Record<string, string>)[row.hour_type] ?? row.hour_type}</td><td>{studyHours(Number(row.duration_minutes) / 60)}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>No hay horas registradas con este filtro.</p>}
      {lastPage > 0 && <div className="study-hours-pagination"><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>Anterior</button><small>Página {currentPage + 1} de {lastPage + 1} · 25 registros por página</small><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === lastPage}>Siguiente</button></div>}
    </>}
  </details>;
}
