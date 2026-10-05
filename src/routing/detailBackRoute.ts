/** A directly opened detail has no in-app history to return to. */
export function detailBackRoute(pathname: string, search = '') {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[1] === 'tecnico') return '/app/tecnico';
  const minimum = segments[1] === 'superadmin' || segments[1] === 'modulos' ? 3 : 2;
  if (search && segments.length === minimum) return pathname;
  return segments.length > minimum ? `/${segments.slice(0, -1).join('/')}` : '/app/inicio';
}
