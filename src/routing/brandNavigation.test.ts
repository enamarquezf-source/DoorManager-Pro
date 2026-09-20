import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('workspace brand navigation', () => {
  it('resolves the brand link through the canonical workspace home helper', () => {
    expect(app).toContain("props.className === 'brand' && auth ? homeRouteForWorkspace(auth.workspace) : props.to");
    expect(app).toContain('return <RouterLink {...props} to={to} />;');
    expect(app).toContain('<Link className="brand" to={workspace === \'tecnico\' ? \'/app/tecnico\' : \'/app/inicio\'}>');
  });
});
