export function filterCommercialOpportunities(rows: any[], status: string, filter: string | null) {
  return rows.filter(row => {
    if (filter === 'sin-responsable' && row.responsible_profile_id) return false;
    if (status === 'abiertas') return !['Ganada','Perdida','Cerrada'].includes(row.status);
    return !status || status === 'todos' || String(row.status).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'') === status;
  });
}
