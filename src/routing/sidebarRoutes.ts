/** Historical names resolve to one destination, including existing bookmarks. */
export const moduleAliases: Record<string, string> = {
  contratos: 'mantenimientos',
  personal: 'tecnicos',
  informes: 'resumen',
  'informes-comerciales': 'ventas',
};

export function canonicalModulePath(moduleId: string) {
  const canonical = moduleAliases[moduleId] ?? moduleId;
  return canonical === 'resumen' ? '/app/gerencia' : `/app/modulos/${canonical}`;
}

export function canonicalSidebar<T extends { id: string; label: string; path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.flatMap(item => {
    const id = item.id === 'calidad' ? 'deficiencias' : moduleAliases[item.id] ?? item.id;
    const path = moduleAliases[item.id] ? canonicalModulePath(item.id) : item.path;
    const label = item.id === 'calidad' ? 'Deficiencias' : item.id === 'administracion' ? 'Datos de empresa' : item.id === 'informes-comerciales' ? 'Ventas' : item.label;
    if (seen.has(path)) return [];
    seen.add(path);
    return [{ ...item, id, label, path }];
  });
}
