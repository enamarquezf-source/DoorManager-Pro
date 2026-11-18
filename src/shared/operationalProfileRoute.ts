/** Only advertise a personnel detail link when that role has a real detail screen. */
export function operationalProfileRoute(person: any, id: string | null | undefined): string | null {
  if (!id) return null;
  const roles = [person?.primary_area, ...(person?.roles ?? []), ...(person?.profile_roles ?? []).map((r: any) => r.roles?.name)];
  if (roles.includes('Comercial')) return `/app/modulos/comerciales/${id}`;
  if (roles.includes('Tecnico')) return `/app/modulos/tecnicos/${id}`;
  return null;
}
