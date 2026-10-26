/** Catalog codes are extensible; the server persists the selected code, not
 * necessarily the legacy literal "desplazamiento" used in local drafts. */
export function isTravelCost(row: { cost_type?: string; unit?: string; description?: string; deleted_at?: unknown }) {
  if (row.deleted_at) return false;
  return row.cost_type === 'desplazamiento' || row.unit?.trim().toLowerCase() === 'km'
    || /^desplazamiento(?:\s|$)/i.test(row.description?.trim() ?? '');
}
