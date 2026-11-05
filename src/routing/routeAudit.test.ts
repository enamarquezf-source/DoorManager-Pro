// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { navForWorkspace } from '../App';
import { canAccessModule, canAccessRoute } from '../auth/permissions';
import { moduleRegistry } from './moduleCatalog';
import type { Profile, RoleName, Workspace } from '../shared/types';

const roles: [Workspace, RoleName][] = [['sat', 'SAT'], ['tecnico', 'Tecnico'], ['oficina', 'Oficina'], ['comercial', 'Comercial'], ['gerencia', 'Gerencia'], ['superadmin', 'superadmin']];
const profile = (role: RoleName): Profile => ({ id: 'p', company_id: 'c', auth_user_id: 'u', active: true, first_name: 'Auditoría', last_name: '', email: '', phone: null, primary_area: role, roles: [role] });

describe('cross-profile route audit', () => {
  it.each(roles)('every visible %s menu destination accepts the same validated role', (workspace, role) => {
    const actor = profile(role);
    const visible = navForWorkspace(workspace).filter(item => canAccessModule(actor, workspace, item.id));
    const denied = visible.filter(item => !canAccessRoute(actor, item.path));
    expect(denied.map(item => ({ id: item.id, path: item.path }))).toEqual([]);
    expect(new Set(visible.map(item => item.path)).size).toBe(visible.length);
  });

  it.each(roles)('inactive %s cannot open any menu or module destination', (workspace, role) => {
    const actor = { ...profile(role), active: false };
    const paths = [...navForWorkspace(workspace).map(item => item.path), ...Object.values(moduleRegistry).map(item => item.route)];
    expect(paths.filter(path => canAccessRoute(actor, path))).toEqual([]);
  });

  it('every module has an application renderer and internal links point to declared routes', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const renderers = new Set<string>(); const routes: string[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'moduleRenderers' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) if (property.name) renderers.add(property.name.getText(ast).replace(/^['"]|['"]$/g, ''));
      }
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'path' && node.initializer && ts.isStringLiteral(node.initializer)) routes.push(node.initializer.text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    expect(Object.values(moduleRegistry).filter(module => !renderers.has(module.renderer)).map(module => module.moduleId)).toEqual([]);
    const paths = Object.values(moduleRegistry).flatMap(module => module.links.map(link => link.to.split('?')[0]));
    const resolved = (path: string) => routes.some(route => {
      // Generic not-found routes do not count as an implemented destination.
      if (route === '*' || route === '/app/*') return false;
      return new RegExp('^' + route.replace(/:[^/]+/g, '[^/]+') + '$').test(path);
    });
    expect(paths.filter(path => !resolved(path))).toEqual([]);
  });
});
