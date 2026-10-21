// Aggregate canonical SQL amounts; never reconstruct prices or attribute a team's sale to one employee.
type Row = Record<string, any>;
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function managementReport(works: Row[], entries: Row[] = []) {
  const metrics = { sale_amount: 0, real_cost: 0, margin_amount: 0, additional_sale_amount: 0, warranty_cost: 0, pending_invoice_work_orders: 0 };
  const clients = new Map<string, Row>();
  const workIds = new Set(works.map(work => work.id));
  for (const work of works) {
    const sale = amount(work.sale_amount ?? work.estimated_sale_amount);
    const cost = amount(work.real_cost_amount);
    const margin = amount(work.margin_amount ?? work.estimated_margin_amount);
    metrics.sale_amount += sale;
    metrics.real_cost += cost;
    metrics.margin_amount += margin;
    metrics.additional_sale_amount += amount(work.additional_sale_amount);
    if (work.warranty || work.economic_status === 'garantia') metrics.warranty_cost += cost;
    if (work.economic_status === 'pendiente_facturar' && sale > 0 && amount(work.invoiced_amount) === 0 && !work.warranty) metrics.pending_invoice_work_orders++;
    const key = work.client_id ?? 'unknown';
    const client = clients.get(key) ?? { client_id: work.client_id, client_name: work.client_name ?? 'Sin cliente', real_cost_amount: 0, sale_amount: 0, estimated_margin_amount: 0 };
    client.real_cost_amount += cost;
    client.sale_amount += sale;
    client.estimated_margin_amount += margin;
    clients.set(key, client);
  }
  const employees = new Map<string, Row>();
  for (const entry of entries) {
    if (!workIds.has(entry.work_order_id)) continue;
    const employee = employees.get(entry.profile_id) ?? { profile_id: entry.profile_id, name: [entry.profiles?.first_name, entry.profiles?.last_name].filter(Boolean).join(' ') || 'Empleado sin nombre', minutes: 0, travelMinutes: 0, cost: 0, missingCosts: 0, workIds: new Set<string>() };
    employee.minutes += amount(entry.duration_minutes);
    if (entry.hour_type === 'desplazamiento') employee.travelMinutes += amount(entry.duration_minutes);
    if (entry.total_cost == null) employee.missingCosts++;
    else employee.cost += amount(entry.total_cost);
    employee.workIds.add(entry.work_order_id);
    employees.set(entry.profile_id, employee);
  }
  const employeeRows: Row[] = [...employees.values()].map(({ workIds, ...employee }) => ({ ...employee, workCount: workIds.size }));
  return { metrics, clients: [...clients.values()].sort((a, b) => b.estimated_margin_amount - a.estimated_margin_amount), employees: employeeRows.sort((a, b) => b.minutes - a.minutes) };
}
