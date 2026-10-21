export type HrKind = 'terms' | 'vacation' | 'payroll' | 'contract';
export type HrRecord = { id: string; profile_id: string; kind: HrKind; date_from: string; date_to: string | null; payload: Record<string, any>; file_path: string | null; filename: string | null; created_at: string };
export type EmployeeHr = { employee_name: string; company_name: string; records: HrRecord[] };
export const defaultTerms = () => ({ agreement: 'Comercio del Metal', province: '', contract_type: '', monthly_gross: 0, employer_contributions: 0, other_employer_costs: 0, overtime_hourly_price: 0, weekly_hours: 0, vacation_days: 0, vacation_basis: 'laborables', schedule: '' });
export const defaultPayroll = () => ({ mode: 'simulation', salary_base: 0, supplements: 0, overtime_hours: 0, overtime_hourly_price: 0, employee_deductions: 0, employer_contributions: 0, other_employer_costs: 0, paid_hours: null as number | null, presence_hours: null as number | null, notes: '' });
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export function payrollAmounts(payload: Record<string, any>) {
  const keys = ['salary_base', 'supplements', 'overtime_hours', 'overtime_hourly_price', 'employee_deductions', 'employer_contributions', 'other_employer_costs'];
  if (keys.some(key => !Number.isFinite(Number(payload[key])) || Number(payload[key]) < 0 || Number(payload[key]) > 1e9)) throw new Error('Los importes de nómina deben ser positivos o cero.');
  if (Number(payload.overtime_hours)>744) throw new Error('Las horas extra superan la duración de un mes.');
  const overtime = cents(Number(payload.overtime_hours) * Number(payload.overtime_hourly_price));
  const gross = cents(Number(payload.salary_base)) + cents(Number(payload.supplements)) + overtime;
  const deductions = cents(Number(payload.employee_deductions));
  if (deductions > gross) throw new Error('Las deducciones superan el salario bruto.');
  return { overtime_amount: overtime / 100, gross_amount: gross / 100, net_amount: (gross - deductions) / 100, employer_cost: (gross + cents(Number(payload.employer_contributions)) + cents(Number(payload.other_employer_costs))) / 100 };
}

export function payrollInputsForStudy(records: HrRecord[], from: string, to: string, mode: 'actual' | 'simulation') {
  const groups = new Map<string, HrRecord[]>();
  for (const record of records) {
    if (record.kind !== 'payroll' || record.payload.mode !== mode || !record.date_to || record.date_from < from || record.date_to > to) continue;
    groups.set(record.profile_id, [...groups.get(record.profile_id) ?? [], record]);
  }
  const nextDay = (date: string) => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  return [...groups].flatMap(([profile_id, rows]) => {
    rows.sort((a,b) => a.date_from.localeCompare(b.date_from));
    let next = from;
    for (const row of rows) { if (row.date_from !== next) return []; next = nextDay(row.date_to!); }
    if (next !== nextDay(to)) return [];
    const sum = (field: string) => rows.reduce((total,row) => total + Number(row.payload[field] ?? 0),0);
    return [{ profile_id, payroll_cost: sum('employer_cost'), paid_hours: rows.every(row => row.payload.paid_hours != null) ? sum('paid_hours') : null, presence_hours: rows.every(row => row.payload.presence_hours != null) ? sum('presence_hours') : null }];
  });
}

export function automaticStudyPayroll(records: HrRecord[], from: string, to: string, mode: 'auto'|'actual'|'simulation', timeEntries: {profile_id:string;work_date:string;total_cost:number|null}[]) {
  const selected=new Map<string,HrRecord>();
  for(const row of records){
    if(row.kind!=='payroll'||!row.date_to||row.date_from<from||row.date_to>to||!['actual','simulation'].includes(row.payload.mode)||(mode!=='auto'&&row.payload.mode!==mode))continue;
    const key=`${row.profile_id}/${row.date_from}/${row.date_to}`;
    const previous=selected.get(key);
    if(!previous||row.payload.mode==='actual')selected.set(key,row);
  }
  const groups=new Map<string,HrRecord[]>();
  for(const row of selected.values())groups.set(row.profile_id,[...groups.get(row.profile_id)??[],row]);
  const nextDay=(date:string)=>new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
  const employees=[...groups].map(([profile_id,rows])=>{
    rows.sort((a,b)=>a.date_from.localeCompare(b.date_from));
    let next=from;let complete=true;
    for(const row of rows){if(row.date_from!==next)complete=false;next=nextDay(row.date_to!);}
    if(next!==nextDay(to))complete=false;
    const uncovered=timeEntries.filter(entry=>entry.profile_id===profile_id&&!rows.some(row=>entry.work_date>=row.date_from&&entry.work_date<=row.date_to!));
    const sum=(key:string)=>rows.reduce((total,row)=>total+Number(row.payload[key]??0),0);
    return {profile_id,payroll_cost:sum('employer_cost')+uncovered.reduce((total,row)=>total+Number(row.total_cost??0),0),paid_hours:complete&&rows.every(row=>row.payload.paid_hours!=null)?sum('paid_hours'):null,presence_hours:complete&&rows.every(row=>row.payload.presence_hours!=null)?sum('presence_hours'):null,payroll_partial:!complete,payroll_source:'auto' as const};
  });
  return {employees,recordCount:selected.size,simulationCount:[...selected.values()].filter(row=>row.payload.mode==='simulation').length,actualCount:[...selected.values()].filter(row=>row.payload.mode==='actual').length,payrollTotal:[...selected.values()].reduce((total,row)=>total+Number(row.payload.employer_cost??0),0)};
}
