export const appearanceThemes = [
  { id: 'dmp', name: 'Verde DMP', description: 'El estilo original', primary: '#173f47', hover: '#215863', sidebar: '#112a30', active: '#25494f', accent: '#a3f1e2', background: '#edf2f3', soft: '#eef7f2', border: '#cbded6' },
  { id: 'blue', name: 'Azul acero', description: 'Claro y técnico', primary: '#254e77', hover: '#30618f', sidebar: '#172b40', active: '#304d6c', accent: '#bddfff', background: '#eef2f7', soft: '#edf4fc', border: '#cddceb' },
  { id: 'slate', name: 'Grafito', description: 'Sobrio y neutral', primary: '#3f4c59', hover: '#526272', sidebar: '#252c34', active: '#424e5b', accent: '#e0e8f0', background: '#f0f2f4', soft: '#f0f3f6', border: '#d4dce3' },
  { id: 'violet', name: 'Violeta mineral', description: 'Un toque diferente', primary: '#594378', hover: '#705591', sidebar: '#2b243a', active: '#4b3d61', accent: '#e4d2ff', background: '#f3f0f6', soft: '#f4effb', border: '#ded2ea' },
  { id: 'sand', name: 'Arena', description: 'Cálido y discreto', primary: '#70512b', hover: '#846337', sidebar: '#332b22', active: '#594734', accent: '#f6dfb4', background: '#f5f2ed', soft: '#faf3e8', border: '#e4d7c3' },
] as const;

export type AppearanceTheme = typeof appearanceThemes[number]['id'];
export type AppearanceScope = { companyId: string; profileId: string };
const tokens = ['primary', 'hover', 'sidebar', 'active', 'accent', 'background', 'soft', 'border'] as const;
export const appearanceKey = (scope: AppearanceScope) => `dmp.appearance.v1:${JSON.stringify([scope.companyId, scope.profileId])}`;
export const validAppearance = (value: string | null): AppearanceTheme => appearanceThemes.find(theme => theme.id === value)?.id ?? 'dmp';

export function readAppearance(scope: AppearanceScope): AppearanceTheme {
  try { return validAppearance(localStorage.getItem(appearanceKey(scope))); } catch { return 'dmp'; }
}
export function saveAppearance(scope: AppearanceScope, theme: AppearanceTheme): boolean {
  try { localStorage.setItem(appearanceKey(scope), theme); return true; } catch { return false; }
}
export function applyAppearance(id: AppearanceTheme) {
  const root = document.documentElement;
  const theme = appearanceThemes.find(item => item.id === id) ?? appearanceThemes[0];
  if (theme.id === 'dmp') {
    delete root.dataset.dmpTheme;
    for (const token of tokens) root.style.removeProperty(`--dmp-${token}`);
    return;
  }
  for (const token of tokens) root.style.setProperty(`--dmp-${token}`, theme[token]);
  root.dataset.dmpTheme = theme.id;
}
