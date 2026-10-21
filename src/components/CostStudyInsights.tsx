import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Building2, Clock3, Search, UsersRound, Wallet, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { calculateCostStudy, type StudyInputs, type StudySources } from '../shared/costStudy';
import { studyHours } from '../shared/studyHours';
import { StudyHoursBreakdown } from './StudyHoursBreakdown';
import { StudyWorkCoverage } from './StudyWorkCoverage';

type Report = ReturnType<typeof calculateCostStudy>;
type Category = 'personal' | 'materiales' | 'recursos' | 'generales';
const money = (value: number | null) => value == null ? 'Sin dato' : value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const num = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const pct = (value: number | null) => value == null ? 'Sin dato' : `${num(value * 100)} %`;
export function CostStudyInsights({ report, sources, inputs, onConfigure }: { report: Report; sources: StudySources; inputs: StudyInputs; onConfigure: () => void }) {
  const [view, setView] = useState<'company' | 'team'>('company');
  const [category, setCategory] = useState<Category>('personal');
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [onlyPending, setOnlyPending] = useState(false);
  const rows = useMemo(() => report.employees.filter(row => row.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (!onlyPending || row.payrollCost == null || row.inconsistentHours || row.missingCosts > 0 || row.zeroCosts > 0)).sort((a, b) => sort === 'cost' ? b.labourCost - a.labourCost : sort === 'hours' ? b.hours - a.hours : a.name.localeCompare(b.name, 'es')), [report, search, sort, onlyPending]);
  const selected = rows.find(row => row.id === employeeId) ?? rows[0];
  const hours = report.employees.reduce((sum, row) => sum + row.hours, 0);
  const travel = report.employees.reduce((sum, row) => sum + row.travelHours, 0);
  const entriesWithPresence = report.employees.filter(row => row.presenceHours != null && row.presenceHours > 0);
  const presence = entriesWithPresence.reduce((sum, row) => sum + row.presenceHours!, 0);
  const coveredHours = entriesWithPresence.reduce((sum, row) => sum + row.hours, 0);
  const occupation = presence > 0 ? coveredHours / presence : null;
  const withStandard = report.employees.filter(row => row.efficiency != null);
  const standardCompleted = withStandard.reduce((sum, row) => sum + row.completedHours, 0);
  const efficiency = standardCompleted > 0 ? withStandard.reduce((sum, row) => sum + row.standardHours!, 0) / standardCompleted : null;
  const pending = report.employees.filter(row => row.payrollCost == null || row.inconsistentHours || row.missingCosts > 0 || row.zeroCosts > 0);
  const categories: { id: Category; label: string; value: number; color: string }[] = [
    { id: 'personal', label: 'Personal', value: report.labourCost, color: '#087f78' },
    { id: 'materiales', label: 'Materiales', value: report.materialsCost, color: '#559fbe' },
    { id: 'recursos', label: 'Recursos de partes', value: report.resourcesCost, color: '#dcaa54' },
    { id: 'generales', label: 'Gastos generales', value: report.overheadCost, color: '#9881b6' },
  ];
  const activeCategory = categories.find(row => row.id === category)!;
  const categoryWorks = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of category === 'materiales' ? sources.materials : category === 'recursos' ? sources.resources : []) totals.set(row.work_order_id, (totals.get(row.work_order_id) ?? 0) + Number(row.total_cost ?? 0));
    return [...totals].sort(([, a], [, b]) => b - a);
  }, [sources, category]);
  const dominant = [...categories].sort((a, b) => b.value - a.value)[0];
  const daily = useMemo(() => {
    const days = new Map<string, { direct: number; travel: number }>();
    for (const entry of sources.time_entries) {
      const day = days.get(entry.work_date) ?? { direct: 0, travel: 0 };
      day[entry.hour_type === 'desplazamiento' ? 'travel' : 'direct'] += Number(entry.duration_minutes) / 60;
      days.set(entry.work_date, day);
    }
    return [...days].sort(([a], [b]) => a.localeCompare(b));
  }, [sources]);
  const dailyMax = Math.max(1, ...daily.map(([, day]) => day.direct + day.travel));
  const partDetails = selected ? [...new Set(sources.time_entries.filter(row => row.profile_id === selected.id).map(row => row.work_order_id))].map(id => {
    const work = sources.works.find(work => work.id === id);
    const entries = sources.time_entries.filter(row => row.profile_id === selected.id && row.work_order_id === id);
    return { id, code: work?.code ?? 'Parte', type: work?.type ?? 'Sin tipo', hours: entries.reduce((sum, row) => sum + Number(row.duration_minutes) / 60, 0), cost: entries.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0) };
  }) : [];
  function configure() { onConfigure(); }
  return <div className="study-insights">
    <div className="study-view-switch" role="group" aria-label="Ámbito del análisis"><button type="button" aria-pressed={view === 'company'} onClick={() => setView('company')}><Building2 size={17} /> Empresa</button><button type="button" aria-pressed={view === 'team'} onClick={() => setView('team')}><UsersRound size={17} /> Equipo <span>{report.employees.length}</span></button></div>
    {view === 'company' ? <>
      <div className="study-section-heading"><div><span className="study-eyebrow">VISIÓN DE EMPRESA</span><h3>¿Dónde se va el coste?</h3><p>Todos los empleados y gastos incluidos en este estudio.</p></div><span className="study-chip">{pending.length > 0 || report.missingCosts > 0 || report.zeroCosts > 0 ? 'Datos por completar' : 'Revisar cobertura de gastos'}</span></div>
      <div className="study-kpis">
        <article className="study-kpi study-kpi-primary"><Wallet size={20} /><span>Coste total estudiado</span><strong>{money(report.totalCost)}</strong><small>Personal + materiales + recursos + generales</small></article>
        <article className="study-kpi"><Building2 size={20} /><span>Facturado sin IVA</span><strong>{money(report.invoiceAmount)}</strong><small>{sources.invoices.length} facturas emitidas del periodo</small></article>
        <article className={`study-kpi ${report.invoiceBalance < 0 ? 'study-negative' : ''}`}>{report.invoiceBalance < 0 ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}<span>Saldo frente a costes</span><strong>{money(report.invoiceBalance)}</strong><small>Facturado menos coste estudiado</small></article>
        <article className="study-kpi"><Clock3 size={20} /><span>Horas de personal en partes</span><strong>{studyHours(hours)}</strong><small>{studyHours(hours - travel)} de trabajo + {studyHours(travel)} de viaje</small></article>
      </div>
      <div className="study-company-grid">
        <section className="study-surface"><div className="study-section-heading"><h4>Distribución del coste</h4><small>Pulsa para explorar</small></div>
          <div className="study-cost-strip" aria-label="Distribución proporcional del coste">{categories.filter(row => row.value > 0).map(row => <button key={row.id} type="button" onClick={() => setCategory(row.id)} aria-label={`${row.label}: ${money(row.value)}`} title={`${row.label}: ${money(row.value)}`} style={{ flexGrow: row.value, background: row.color }} />)}</div>
          <div className="study-cost-list">{categories.map(row => <button type="button" key={row.id} className={category === row.id ? 'is-selected' : ''} aria-pressed={category === row.id} onClick={() => setCategory(row.id)}><span className="study-dot" style={{ background: row.color }} /><span>{row.label}<small>{report.totalCost > 0 ? pct(row.value / report.totalCost) : 'Sin coste registrado'}</small></span><strong>{money(row.value)}</strong><ChevronRight size={16} /></button>)}</div>
        </section>
        <section className="study-surface study-category-detail" aria-live="polite"><span className="study-eyebrow">DETALLE DEL CONCEPTO</span><h4>{activeCategory.label}</h4><strong className="study-big-value">{money(activeCategory.value)}</strong>
          {category === 'personal' && <><p>{report.employees.length} empleados incluidos. {report.missingPayroll > 0 ? `${report.missingPayroll} con coste pendiente o cobertura parcial: se conservan costes imputados de periodos sin nómina.` : 'Se utiliza el coste completo declarado de cada empleado.'}</p><button type="button" className="study-text-action" onClick={configure}>Revisar nóminas y gasto de personal <ChevronRight size={16} /></button><button type="button" className="study-text-action" onClick={() => setView('team')}>Explorar empleados <ChevronRight size={16} /></button></>}
          {category === 'materiales' && <p>{sources.materials.length} registros de consumo del periodo. Se contabiliza el material consumido, sin sumar de nuevo las compras de almacén.</p>}
          {category === 'recursos' && <p>{sources.resources.length} recursos registrados: medios auxiliares, servicios externos y otros costes asociados a los partes.</p>}
          {category === 'generales' && <><p>Gastos adicionales introducidos en el estudio, como alquileres o administración. Deben quedar fuera de los importes ya incluidos en otros conceptos.</p><button type="button" className="study-text-action" onClick={configure}>Revisar gastos generales <ChevronRight size={16} /></button></>}
          {(category === 'materiales' || category === 'recursos') && <div className="study-work-list"><small>Partes con mayor coste de este concepto</small>{categoryWorks.slice(0, 5).map(([id, value]) => <Link key={id} to={`/app/partes/${id}`}><strong>{sources.works.find(work => work.id === id)?.code ?? `Ver parte · ${id.slice(0, 8)}`}</strong><span>{money(value)}</span><ChevronRight size={16} /></Link>)}{!categoryWorks.length && <p>Sin registros en el periodo.</p>}</div>}
          {category === 'generales' && <div className="study-expenses">{inputs.overheads.map((row, index) => <div key={index}><span>{row.description || 'Concepto pendiente'}</span><strong>{money(row.amount)}</strong></div>)}{!inputs.overheads.length && <p>No se han añadido gastos generales.</p>}</div>}
          <div className="study-callout">{report.totalCost > 0 ? <><strong>{dominant.label}</strong> concentra el {pct(dominant.value / report.totalCost)} del coste registrado.</> : 'Todavía no hay costes registrados en este periodo.'}</div>
        </section>
      </div>
      <div className="study-company-grid">
        <section className="study-surface"><div className="study-section-heading"><div><h4>Actividad por día</h4><p>Horas registradas en partes</p></div><span className="study-chip">{daily.length} días con actividad</span></div>
          {daily.length ? <div className="study-daily-chart" role="img" aria-label={`Actividad diaria: ${daily.map(([date, row]) => `${date}: ${num(row.direct)} horas directas, ${num(row.travel)} de desplazamiento`).join('; ')}`}>{daily.map(([date, row]) => <div className="study-day" key={date} title={`${date} · ${num(row.direct)} h directas · ${num(row.travel)} h viaje`}><span>{num(row.direct + row.travel)}</span><div className="study-day-column"><i style={{ height: `${row.travel / dailyMax * 100}%` }} /><b style={{ height: `${row.direct / dailyMax * 100}%` }} /></div><small>{date.slice(8)}/{date.slice(5, 7)}</small></div>)}</div> : <p className="study-empty">No hay horas registradas en este intervalo.</p>}
          <div className="study-chart-legend"><span><i /> Trabajo directo</span><span><i /> Desplazamiento</span></div>
        </section>
        <section className="study-surface"><h4>Qué conviene revisar</h4><div className="study-findings">
          <button type="button" onClick={() => { setView('team'); setOnlyPending(true); }}><span className="study-finding-count">{pending.length}</span><span><strong>Empleados con datos pendientes</strong><small>Coste completo, imputaciones o coherencia de horas.</small></span><ChevronRight size={17} /></button>
          <button type="button" onClick={configure}><SlidersHorizontal size={22} /><span><strong>{report.budgetDeviation == null ? 'Define un presupuesto de costes' : report.budgetDeviation > 0 ? `${money(report.budgetDeviation)} por encima del presupuesto` : `${money(Math.abs(report.budgetDeviation))} por debajo del presupuesto`}</strong><small>{report.budgetDeviation == null ? 'Permite conocer la desviación del periodo.' : 'Comparación con el presupuesto introducido.'}</small></span><ChevronRight size={17} /></button>
          <div><Clock3 size={22} /><span><strong>{pct(occupation)} de ocupación registrada</strong><small>{entriesWithPresence.length ? `Calculada para ${entriesWithPresence.length} de ${report.employees.length} empleados con presencia informada. Incluye viajes.` : 'Introduce presencia para comparar horas disponibles e imputadas.'}</small></span></div>
          <div><UsersRound size={22} /><span><strong>{pct(efficiency)} de eficiencia frente al estándar</strong><small>{withStandard.length ? `Horas estándar / horas directas de trabajo terminado para ${withStandard.length} de ${report.employees.length} empleados con estándar informado.` : 'Completa los estándares del equipo para comparar el tiempo real con el previsto.'}</small></span></div>
          {(report.missingCosts > 0 || report.zeroCosts > 0) && <p className="study-data-note">{report.missingCosts} consumos o recursos sin importe y {report.zeroCosts} con coste cero. Revisa sus registros antes de sacar conclusiones.</p>}
        </div></section>
      </div>
      <StudyHoursBreakdown sources={sources} />
      <StudyWorkCoverage sources={sources} />
      <p className="study-footnote">El saldo compara facturación y costes del periodo. No equivale al beneficio contable ni al dinero cobrado. Comprueba que has incluido toda la plantilla y todos los gastos.</p>
    </> : <>
      <div className="study-section-heading"><div><span className="study-eyebrow">VISIÓN POR EMPLEADO</span><h3>Entiende la actividad de tu equipo</h3><p>Selecciona una persona para explorar sus horas, costes y partes.</p></div></div>
      <div className="study-team-filters"><label className="study-search"><Search size={17} /><input aria-label="Buscar empleado" placeholder="Buscar empleado…" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Ordenar<select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nombre</option><option value="cost">Mayor coste</option><option value="hours">Más horas imputadas</option></select></label><button type="button" className="study-filter-button" aria-pressed={onlyPending} onClick={() => setOnlyPending(!onlyPending)}>Solo pendientes <span>{pending.length}</span></button></div>
      <div className="study-team-grid"><div className="study-employee-list">{rows.map(row => <button type="button" key={row.id} className={selected?.id === row.id ? 'is-selected' : ''} aria-pressed={selected?.id === row.id} onClick={() => setEmployeeId(row.id)}><span className="study-avatar">{row.name.split(' ').slice(0, 2).map(part => part[0]).join('')}</span><span><strong>{row.name}</strong><small>{row.workCount} partes con horas · {studyHours(row.hours)} imputados</small></span><strong>{money(row.labourCost)}</strong></button>)}{!rows.length && <p className="study-empty">No hay empleados que coincidan con estos filtros.</p>}</div>
      {selected && <section className="study-surface study-employee-detail" aria-live="polite"><div className="study-section-heading"><div><h4>{selected.name}</h4><p>{selected.payrollCost == null ? 'Coste de horas imputadas · falta coste laboral completo' : selected.payrollPartial ? 'Nóminas registradas + horas de periodos sin nómina · cobertura parcial' : 'Coste laboral completo del periodo'}</p></div><strong>{money(selected.labourCost)}</strong></div>
        <div className="study-mini-kpis"><div><span>Trabajo directo</span><strong>{studyHours(selected.directHours)}</strong></div><div><span>Desplazamiento</span><strong>{studyHours(selected.travelHours)}</strong></div><div><span>Coste / hora directa</span><strong>{money(selected.costPerDirectHour)}</strong></div></div>
        <div className="study-ratios">{[{ label: 'Ocupación', value: selected.occupation, detail: `${num(selected.hours)} h imputadas / ${selected.presenceHours == null ? 'presencia pendiente' : `${num(selected.presenceHours)} h de presencia`}` }, { label: 'Eficiencia frente al estándar', value: selected.efficiency, detail: selected.standardHours == null ? 'Falta un estándar de trabajo documentado' : `${num(selected.standardHours)} h estándar / ${num(selected.completedHours)} h directas de partes terminados` }].map(ratio => <div key={ratio.label}><div><strong>{ratio.label}</strong><span>{pct(ratio.value)}</span></div><div className="study-ratio-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, (ratio.value ?? 0) * 100))}%` }} /></div><small>{ratio.detail}</small></div>)}</div>
        {selected.inconsistentHours && <p className="study-data-note">Las horas imputadas superan la presencia o esta supera las horas retribuidas. Revisa los datos.</p>}
        {(selected.missingCosts > 0 || selected.zeroCosts > 0) && <p className="study-data-note">{selected.missingCosts} registros sin coste y {selected.zeroCosts} a cero. Comprueba las tarifas de sus horas.</p>}
        <button type="button" className="study-text-action" onClick={configure}>Completar costes y objetivos <ChevronRight size={16} /></button>
        <h5>Partes con horas en el periodo</h5><div className="study-work-list">{partDetails.map(work => <Link key={work.id} to={`/app/partes/${work.id}`}><span><strong>{work.code}</strong><small>{work.type}</small></span><span>{studyHours(work.hours)}<small>{money(work.cost)} imputados</small></span><ChevronRight size={16} /></Link>)}</div>
        <p className="study-footnote">{studyHours(selected.warrantyHours)} en trabajos de garantía. No atribuyen al empleado la causa de la avería. La eficiencia depende del estándar declarado y no mide por sí sola la calidad.</p>
      </section>}</div>
    </>}
  </div>;
}
