import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/032_fix_operational_update_rpc_runtime.sql', import.meta.url), 'utf8');
const technicalWork030 = readFileSync(new URL('../../supabase/migrations/030_real_technical_work_current_fields.sql', import.meta.url), 'utf8');

describe('operational update runtime 032', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('allows the audit operation inserted by the operational update RPC', () => {
    expect(technicalWork030).toContain("'OPERATIONAL_UPDATE'");
    expect(migration).toContain('drop constraint if exists audit_log_operation_check');
    expect(migration).toContain("'OPERATIONAL_UPDATE'");
  });

  it('does not relax RLS or use privileged secrets', () => {
    expect(migration.toLowerCase()).not.toContain('disable row level security');
    expect(migration.toLowerCase()).not.toContain('service_role');
  });
});
