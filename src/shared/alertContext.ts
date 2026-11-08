export function alertContextOptions(sites: any[], equipment: any[], clientId?: string, siteId?: string) {
  return {
    sites: sites.filter(row => !clientId || row.client_id === clientId),
    equipment: equipment.filter(row => (!clientId || row.client_id === clientId) && (!siteId || row.site_id === siteId)),
  };
}

export function changeAlertContext(current: Record<string, any>, key: string, value: any) {
  const next = { ...current, [key]: value };
  if (key === 'client_id' || key === 'site_id') {
    for (const field of ['equipment_id', 'case_id', 'work_order_id', 'check_id', 'deficiency_id']) next[field] = '';
    if (key === 'client_id') next.site_id = '';
  }
  // Group and individual delivery are mutually exclusive.
  if (key === 'recipient_role') next.recipient_profile_id = '';
  if (key === 'recipient_profile_id' && value) next.recipient_role = '';
  return next;
}
