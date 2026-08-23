export function filterSitesForClient<T extends { client_id?: string | null }>(sites: T[], clientId?: string | null) {
  return sites.filter((site) => !clientId || site.client_id === clientId);
}

export function filterEquipmentForContext<T extends { client_id?: string | null; site_id?: string | null }>(equipment: T[], clientId?: string | null, siteId?: string | null) {
  return equipment.filter((item) => (!clientId || item.client_id === clientId) && (!siteId || item.site_id === siteId));
}
