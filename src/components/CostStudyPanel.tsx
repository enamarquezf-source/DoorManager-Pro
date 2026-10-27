import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { costStudiesService, type SavedCostStudy } from '../services/costStudiesService';
import { calculateCostStudy, emptyStudyInputs, emptyStudySources, validateStudyInputs, type StudyEmployeeInput, type StudyInputs, type StudySources } from '../shared/costStudy';
import { localDateKey } from '../shared/localDate';
import { CostStudyInsights } from './CostStudyInsights';
import { BarChart3, Download, FolderOpen, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { automaticStudyPayroll } from '../shared/employeeHr';

const money = (value: number | null) => value == null ? 'Sin dato' : value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const number = (value: number | null) => value == null ? 'Sin dato' : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const percent = (value: number | null) => value == null ? 'Sin dato' : `${number(value * 100)} %`;
const optionalNumber = (value: string) => value === '' ? null : Number(value);
const freshEmployee = (id: string): StudyEmployeeInput => ({ profile_id: id, payroll_cost: null, paid_hours: null, presence_hours: null, standard_completed_hours: null, standard_basis: '' });
type StudyHeader = Pick<SavedCostStudy, 'id' | 'title' | 'period_from' | 'period_to' | 'created_at'>;

export function CostStudyPanel() {
  const today = localDateKey();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(localDateKey(new Date(new Date().getFullYear(),new Date().getMonth()+1,0)));
  const [title, setTitle] = useState('Estudio de costes');
  const [inputs, setInputs] = useState<StudyInputs>(emptyStudyInputs);
  const [sources, setSources] = useState<StudySources>(emptyStudySources);
  const [loadedRange, setLoadedRange] = useState('');
  const [saved, setSaved] = useState<SavedCostStudy | null>(null);
  const [history, setHistory] = useState<StudyHeader[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [payrollMode, setPayrollMode] = useState<'auto'|'actual'|'simulation'>('auto');
  const [payrollMessage,setPayrollMessage] = useState('');
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const report = useMemo(() => calculateCostStudy(sources, inputs), [sources, inputs]);
  const ready = loadedRange === `${from}/${to}`;
  const locked = busy || !!saved;
  useEffect(() => { let active = true; costStudiesService.list().then(rows => { if (active) setHistory(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const employeeIds = [...new Set([...sources.time_entries.map(entry => entry.profile_id), ...inputs.employees.map(employee => employee.profile_id)])];
  function changePeriod(field: 'from' | 'to', value: string) {
    setPayrollMessage('');
    if (field === 'from') setFrom(value); else setTo(value);
    setInputs(emptyStudyInputs()); setLoadedRange(''); operation.current = null;
  }
  function presetPeriod(preset: 'month' | 'previous' | 'quarter' | 'year') {
    setPayrollMessage('');
    const now = new Date();
    const start = new Date(now.getFullYear(), preset === 'year' ? 0 : now.getMonth() - (preset === 'previous' ? 1 : preset === 'quarter' ? 2 : 0), 1);
    const end = new Date(now.getFullYear(),now.getMonth()+(preset==='previous'?0:1),0);
    setFrom(localDateKey(start)); setTo(localDateKey(end)); setInputs(emptyStudyInputs()); setLoadedRange(''); operation.current = null;
  }
  function showSettings() {
    setSettingsOpen(true);
    requestAnimationFrame(() => settingsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  }
  function usePayrollCosts(result: StudySources=sources,mode:typeof payrollMode=payrollMode) {
    const imported=automaticStudyPayroll(result.hr_payroll_records??[],from,to,mode,result.time_entries);
    const employees=imported.employees;
    setInputs(previous=>{
      const rows=previous.employees.map(row=>row.payroll_source==='auto'?{...row,payroll_cost:null,paid_hours:row.paid_hours_manual?row.paid_hours:null,presence_hours:row.presence_hours_manual?row.presence_hours:null,payroll_partial:false}:row);
      for(const employee of employees){const index=rows.findIndex(row=>row.profile_id===employee.profile_id);const existing=index<0?freshEmployee(employee.profile_id):rows[index];const automatic=existing.payroll_source==='auto'||existing.payroll_cost==null;const updated={...existing,...(automatic?{payroll_cost:employee.payroll_cost,payroll_partial:employee.payroll_partial,payroll_source:'auto' as const}:{}),paid_hours:existing.paid_hours??employee.paid_hours,presence_hours:existing.presence_hours??employee.presence_hours};if(index<0)rows.push(updated);else rows[index]=updated;}
      const notes=previous.notes.split('\n').filter(line=>!line.startsWith('[Nóminas]'));
      notes.push(`[Nóminas] ${imported.actualCount} reales y ${imported.simulationCount} simulaciones. Prioridad real por empleado y mes. Los meses sin nómina conservan costes de horas imputadas.`);
      return {...previous,employees:rows,notes:notes.join('\n')};
    });
    setPayrollMessage(imported.recordCount?`${imported.recordCount} nóminas de ${employees.length} empleados: ${money(imported.payrollTotal)} de coste empresarial. ${imported.actualCount} reales y ${imported.simulationCount} simuladas. Se respetan los costes manuales. ${employees.some(row=>row.payroll_partial)?'Cobertura parcial: los periodos sin nómina usan sus costes de horas registrados.':''}`:'No hay nóminas de meses completos dentro de estas fechas. El resumen usa costes de horas imputadas. Selecciona del primer al último día del mes de las nóminas y actualiza los datos.');
  }
  function updateEmployee(id: string, field: keyof StudyEmployeeInput, value: string) {
    setInputs(previous => {
      const current = previous.employees.find(employee => employee.profile_id === id) ?? freshEmployee(id);
      const updated = { ...current, [field]: field === 'standard_basis' ? value : optionalNumber(value),...(field==='payroll_cost'?{payroll_source:'manual' as const,payroll_partial:false}:{}),...(field==='paid_hours'?{paid_hours_manual:true}:{}),...(field==='presence_hours'?{presence_hours_manual:true}:{}) };
      return { ...previous, employees: [...previous.employees.filter(employee => employee.profile_id !== id), updated] };
    });
  }
  async function load() {
    setBusy(true); setError('');
    try {
      validateStudyInputs(inputs, from, to);
      const result = await costStudiesService.preview(from, to);
      usePayrollCosts(result);
      setSources(result); setLoadedRange(`${from}/${to}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido cargar el estudio.'); }
    finally { setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setError('');
    try {
      const study = await costStudiesService.get(id);
      if (study.calculation_version !== 1) throw new Error('Esta versión del estudio no está disponible.');
      setPayrollMessage('Captura guardada: conserva sus importes originales. Crea un estudio nuevo para incorporar nóminas posteriores.'); setSaved(study); setFrom(study.period_from); setTo(study.period_to); setTitle(study.title);
      setInputs(study.inputs); setSources(study.sources); setLoadedRange(`${study.period_from}/${study.period_to}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido abrir el estudio.'); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy || saved) return;
    setBusy(true); setError('');
    try {
      validateStudyInputs(inputs, from, to);
      const fingerprint = JSON.stringify({ title, from, to, inputs });
      if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
      const id = await costStudiesService.save(operation.current.id, title, from, to, inputs);
      const study = await costStudiesService.get(id);
      setSaved(study); setSources(study.sources);
      setHistory(previous => [study, ...previous.filter(row => row.id !== id)].slice(0, 100));
      window.dispatchEvent(new CustomEvent('dmp-cost-study-saved',{detail:{id}}));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido guardar. Puedes reintentar la operación.'); }
    finally { setBusy(false); }
  }
  function reset() { setSaved(null); setInputs(emptyStudyInputs()); setSources(emptyStudySources()); setLoadedRange(''); operation.current = null; setError(''); }
  function exportCsv() {
    const cell = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; };
    const rows: unknown[][] = [
      ['Estudio', title, from, to, saved ? 'Guardado' : 'Vista previa'],
      ['Captura', sources.captured_at],
      ['Concepto', 'EUR'], ['Personal', report.labourCost], ['Materiales consumidos', report.materialsCost], ['Recursos', report.resourcesCost], ['Gastos generales adicionales', report.overheadCost], ['Coste total estudiado', report.totalCost], ['Facturado sin IVA', report.invoiceAmount], ['Saldo facturado menos costes (no beneficio contable)', report.invoiceBalance],
      ['Empleado', 'Horas imputadas', 'Horas directas', 'Desplazamiento', 'Presencia', 'Horas retribuidas', 'Coste personal usado', 'Origen coste', 'Coste/h retribuida', 'Coste/h directa', 'Ocupacion %', 'Eficiencia %', 'Horas garantia', 'Base estandar'],
      ...report.employees.map(employee => [employee.name, employee.hours, employee.directHours, employee.travelHours, employee.presenceHours, employee.paidHours, employee.labourCost, employee.payrollCost == null ? 'Imputaciones; falta coste completo' : 'Coste completo introducido', employee.costPerPaidHour, employee.costPerDirectHour, employee.occupation == null ? null : employee.occupation * 100, employee.efficiency == null ? null : employee.efficiency * 100, employee.warrantyHours, inputs.employees.find(row => row.profile_id === employee.id)?.standard_basis]),
      ['Notas', inputs.notes],
      ['Gastos generales: concepto', 'Importe'], ...inputs.overheads.map(row => [row.description, row.amount]),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `DMP-estudio-${from}-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="cost-study-panel" aria-label="Estudios de costes y productividad">
    <header className="study-header"><div><span className="study-eyebrow"><BarChart3 size={16} /> CONTROL DE GESTIÓN</span><h2>Costes y productividad</h2><p>Una visión de tu empresa. El detalle de cada persona.</p></div><button type="button" onClick={reset} disabled={busy}>Nuevo estudio</button></header>
    <details className="study-history"><summary><FolderOpen size={16} /> Estudios guardados <span>{history.length}</span></summary><label>Estudios recientes (hasta 100)<select value={saved?.id ?? ''} disabled={busy} onChange={event => { if (event.target.value) void open(event.target.value); }}><option value="">Selecciona un estudio guardado</option>{history.map(study => <option key={study.id} value={study.id}>{study.title} · {study.period_from} / {study.period_to}</option>)}</select></label></details>
    {error && <p role="alert" className="form-error">{error}</p>}
    {saved && <p className="success-note">Estudio guardado el {new Date(saved.created_at).toLocaleString('es-ES')}. Consulta de la captura original; crea un nuevo estudio para actualizarlo.</p>}
    <form onSubmit={save}>
      <fieldset disabled={locked} className="study-period"><legend>Periodo de análisis</legend><div className="study-presets"><button type="button" onClick={() => presetPeriod('month')}>Este mes</button><button type="button" onClick={() => presetPeriod('previous')}>Mes anterior</button><button type="button" onClick={() => presetPeriod('quarter')}>Últimos 3 meses</button><button type="button" onClick={() => presetPeriod('year')}>Año actual</button></div><div className="filters"><label>Nombre del estudio<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Desde<input required type="date" value={from} onChange={event => changePeriod('from', event.target.value)} /></label><label>Hasta<input required type="date" value={to} onChange={event => changePeriod('to', event.target.value)} /></label><button type="button" className="primary" onClick={() => void load()}><RefreshCw size={16} /> {busy ? 'Cargando…' : ready ? 'Actualizar datos' : 'Analizar periodo'}</button></div><small>Al cambiar el periodo se reinician los costes y horas introducidos manualmente.</small></fieldset>
      {!ready && <div className="study-welcome"><BarChart3 size={34} /><h3>Empieza por una visión de conjunto</h3><p>Elige un periodo y pulsa «Analizar periodo». Verás el coste de empresa, su distribución y la actividad de cada empleado con los datos de DMP.</p><div><span>01 · Empresa y costes</span><span>02 · Actividad del equipo</span><span>03 · Decisiones con contexto</span></div></div>}
      {ready && <>
        <div className="study-payroll-entry"><div><strong>Gasto de personal</strong><small>{report.missingPayroll > 0 ? `${report.missingPayroll} empleados sin coste completo. Introduce el coste del periodo para completar el estudio.` : 'Consulta el coste laboral completo y las horas de cada empleado.'}</small></div><button type="button" onClick={showSettings}><SlidersHorizontal size={16} /> {saved ? 'Consultar gasto de personal' : 'Introducir gasto de personal'}</button></div>
        {payrollMessage && <p className="study-data-note" role="status">{payrollMessage}</p>}<CostStudyInsights report={report} sources={sources} inputs={inputs} onConfigure={showSettings} />
        <details ref={settingsRef} open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)} className="study-settings"><summary><SlidersHorizontal size={18} /><span>Gasto de personal, jornada y objetivos<small>Salarios y cotizaciones por empleado, presencia y gastos generales</small></span></summary>
        <fieldset disabled={locked}><legend>Gasto de personal por empleado</legend>
          <div className="study-payroll-import"><label>Costes desde las fichas de empleados<select value={payrollMode} onChange={event=>{const mode=event.target.value as 'auto'|'actual'|'simulation';setPayrollMode(mode);usePayrollCosts(sources,mode);}}><option value="auto">Automático: reales y simulaciones BETA (prioridad real)</option><option value="actual">Solo nóminas reales registradas</option><option value="simulation">Simulaciones BETA</option></select></label><button type="button" onClick={()=>usePayrollCosts()}>Incorporar costes de nóminas</button><small>Se incorporan al analizar o actualizar. No se duplican nóminas reales y simuladas del mismo mes. Los periodos sin nómina conservan el coste de horas registrado; se señalan como parciales.</small>{payrollMessage&&<p role="status">{payrollMessage}</p>}</div>
          <p>Coste completo: salario, cotizaciones de empresa y otros costes laborales del periodo. Se utiliza en lugar del coste de horas imputadas, sin sumarlos dos veces. Incluye también al personal sin partes y al de oficina para estudiar el coste de toda la plantilla.</p>
          <label>Añadir empleado<select value="" onChange={event => { const id = event.target.value; if (id) setInputs(previous => ({ ...previous, employees: [...previous.employees, freshEmployee(id)] })); }}><option value="">Selecciona un empleado</option>{sources.profiles.filter(profile => !employeeIds.includes(profile.id)).map(profile => <option key={profile.id} value={profile.id}>{profile.first_name} {profile.last_name}</option>)}</select></label>
          {employeeIds.map(id => {
            const employee = inputs.employees.find(employee => employee.profile_id === id) ?? freshEmployee(id);
            const profile = sources.profiles.find(profile => profile.id === id);
            return <div className="card" key={id}><h4>{profile ? `${profile.first_name} ${profile.last_name}` : 'Empleado'}</h4><div className="filters">{([
              ['payroll_cost', 'Gasto de personal: salario + cotizaciones + otros (€)'], ['paid_hours', 'Horas retribuidas (decimales)'], ['presence_hours', 'Horas de presencia efectiva (decimales)'], ['standard_completed_hours', 'Horas estándar del trabajo terminado (decimales)'],
            ] as const).map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="0.01" value={employee[field] ?? ''} placeholder="Sin dato" onChange={event => updateEmployee(id, field, event.target.value)} /></label>)}</div><label>Base del estándar (tareas, unidades y tiempos de referencia)<textarea value={employee.standard_basis} onChange={event => updateEmployee(id, 'standard_basis', event.target.value)} /></label></div>;
          })}
          <p>El estándar debe referirse exclusivamente al trabajo directo de partes terminados registrado en este periodo. Para partes que abarcan varios periodos, introduce solo el estándar equivalente a las tareas realizadas en este intervalo. La duración prevista de un parte no se reparte automáticamente entre empleados.</p>
        </fieldset>
        <fieldset disabled={locked}><legend>Gastos generales y presupuesto</legend><p>Introduce únicamente gastos adicionales del periodo que no estén ya incluidos en personal, materiales o recursos de partes. No añadas compras de almacén si ya se contabiliza su consumo.</p>
          {inputs.overheads.map((row, index) => <div className="filters" key={index}><label>Concepto<input required value={row.description} onChange={event => setInputs(previous => ({ ...previous, overheads: previous.overheads.map((item, position) => position === index ? { ...item, description: event.target.value } : item) }))} /></label><label>Importe sin IVA (€)<input required type="number" min="0" step="0.01" value={row.amount} onChange={event => setInputs(previous => ({ ...previous, overheads: previous.overheads.map((item, position) => position === index ? { ...item, amount: Number(event.target.value) } : item) }))} /></label><button type="button" onClick={() => setInputs(previous => ({ ...previous, overheads: previous.overheads.filter((_, position) => position !== index) }))}>Quitar gasto</button></div>)}
          <button type="button" onClick={() => setInputs(previous => ({ ...previous, overheads: [...previous.overheads, { description: '', amount: 0 }] }))}>Añadir gasto general</button>
          <label>Presupuesto total de coste del periodo (€)<input type="number" min="0" step="0.01" value={inputs.cost_budget ?? ''} onChange={event => setInputs(previous => ({ ...previous, cost_budget: optionalNumber(event.target.value) }))} /></label><label>Notas, hipótesis y datos pendientes<textarea value={inputs.notes} onChange={event => setInputs(previous => ({ ...previous, notes: event.target.value }))} /></label>
        </fieldset>
        </details>
        <footer className="study-footer"><small>Captura: {sources.captured_at ? new Date(sources.captured_at).toLocaleString('es-ES') : 'Sin datos'}. Al guardar se actualiza la captura.</small><div className="actions"><button type="submit" disabled={locked} className="primary"><Save size={16} /> {busy ? 'Procesando…' : 'Guardar estudio'}</button><button type="button" onClick={exportCsv} disabled={busy}><Download size={16} /> Exportar CSV</button></div></footer>
      </>}
    </form>
  </section>;
}
