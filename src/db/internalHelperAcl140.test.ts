import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/140_revoke_internal_user_management_helper.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_140_revoke_internal_user_management_helper.sql', import.meta.url), 'utf8');

describe('HOTFIX-140-INTERNAL-HELPER-ACL', () => {
  it('parses a read-only verification and revokes every client role', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    expect(migration).toContain('revoke all on function public.dmp_assert_user_management_transition(uuid, boolean, text[]) from public, anon, authenticated');
  });

  it('verifies the exact helper signature and effective ACL contract', () => {
    expect(verification).toContain("to_regprocedure('public.dmp_assert_user_management_transition(uuid,boolean,text[])')");
    expect(verification).toContain("has_function_privilege('authenticated', v_oid, 'EXECUTE')");
    expect(verification).toContain("has_function_privilege('anon', v_oid, 'EXECUTE')");
    expect(verification).toContain('v_acl.grantee = 0');
    expect(verification).toContain('SECURITY DEFINER missing');
    expect(verification).toContain("array['search_path=public']");
  });
});
