import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { createHash } from 'node:crypto';

const migration = readFileSync(new URL('../../supabase/migrations/145_guard_work_order_status_transitions.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_145_work_order_acl.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_145_guard_work_order_status_transitions.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

const editableColumns = [
  'case_id', 'quote_id', 'client_id', 'site_id', 'main_equipment_id', 'contact_id', 'access_requirement_id',
  'title', 'description', 'type', 'priority', 'origin', 'scheduled_date', 'scheduled_time',
  'estimated_duration_minutes', 'planned_material', 'technical_team', 'diagnosis', 'work_performed', 'result',
];

// A pinned executable contract: a comment, SQL literal or unreachable branch
// cannot stand in for a removed verifier check without changing this digest.
// Updating it requires review of the entire verifier DO body, not a grep hit.
const verifiedSqlBlob = 'cd8a41623cd9fc697182be5b5f5da70a7b2a86e7';
const blobId = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

describe('AUD-002 status mutation guard 145', () => {
  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, verification]) {
      try {
        expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
      } catch (error) {
        // Infinity is a parser failure, never evidence that the SQL is valid.
        throw new Error(`SQL parse failed (including Infinity): ${String(error)}`);
      }
    }
  });

  it('keeps create canonical and restricts only generic update columns', () => {
    expect(service).toContain("supabase.rpc('dmp_create_work_order_full'");
    expect(service).toContain('const workOrderEditableColumns');
    expect(service).not.toContain("'status', 'origin'");
    expect(service).toContain("'origin', 'scheduled_date'");
    expect(service).toContain("'result'");
  });

  it('revokes client table update and grants exactly the approved editable columns', () => {
    expect(migration).toContain('revoke update on table public.work_orders from public, anon, authenticated');
    expect(migration).toContain('revoke update (%I) on table public.work_orders from public, anon, authenticated');
    expect(migration).toContain('grant update (');
    const grant = migration.match(/grant update \(([^)]*)\) on table public\.work_orders to authenticated;/i);
    expect(grant).not.toBeNull();
    expect(grant![1].split(',').map((column) => column.trim())).toEqual(editableColumns);
    expect(migration).toContain('    result\n  ) on table public.work_orders to authenticated;');
    expect(migration).not.toContain('    status,');
    expect(migration).toContain("has_column_privilege('service_role'");
    expect(migration).not.toContain('grant update (%I) on table public.work_orders to service_role');
    expect(migration).toContain('v_service_role_had_table_update');
    expect(migration).not.toContain('grant update on table public.work_orders to service_role');
    expect(migration).toContain("raise exception '145: WAITING_FOR_REMOTE_PREFLIGHT - service_role UPDATE changed");
  });

  it('uses structural fail-hard checks without mutating SQL', () => {
    expect(blobId(verification)).toBe(verifiedSqlBlob);
    const doBody = verification.match(/\bdo \$\$([\s\S]*?)\$\$;/i)?.[1];
    expect(doBody).toBeDefined();
    // Any reviewer changing the DO must repin the digest after reviewing the
    // IF/RAISE paths below. This prevents string/comment substitutes.
    for (const clause of [
      /if v_table_oid is null then raise exception/i,
      /if not exists \(select 1 from pg_roles where rolname = 'anon'\)[\s\S]*?then\s+raise exception/i,
      /if exists \([\s\S]*?has_column_privilege\('authenticated',[\s\S]*?raise exception '145 verify: authenticated tiene UPDATE fuera de la allowlist'/i,
      /if has_table_privilege\('authenticated', v_table_oid, 'UPDATE'\) then\s+raise exception/i,
      /if v_actual_policy_names is distinct from v_expected_policy_names then\s+raise exception/i,
      /if v_policy\.using_expr is distinct from v_expected_using[\s\S]*?then\s+raise exception/i,
      /if v_rpc is null then\s+raise exception/i,
    ]) expect(doBody).toMatch(clause);
    expect(doBody).not.toMatch(/\bif\s+(?:false|0\s*=\s*1)\s+then\b/i);
    expect(verification).toContain('set transaction read only;');
    expect(verification).toContain('rollback;');
    expect(verification).toContain('aclexplode');
    expect(verification).toContain('has_table_privilege');
    expect(verification).toContain('has_column_privilege');
    expect(verification).toContain('to_regprocedure');
    expect(verification).not.toContain('work_orders_update_operational');
    expect(verification).toContain("array['work_orders_company_policy', 'work_orders_platform_superadmin_update']::text[]");
    expect(verification).toContain("when 'work_orders_company_policy' then '*' else 'w'");
    expect(verification).toContain("v_policy.polroles is distinct from array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]");
    expect(verification).toContain('or not v_policy.polpermissive');
    expect(verification).toContain("then '(company_id = current_company_id())' else 'is_platform_superadmin()' end");
    expect(verification).toContain("current_setting('dmp145.expected_company_using', true)");
    expect(verification).toContain("current_setting('dmp145.expected_company_check', true)");
    expect(verification).toContain("current_setting('dmp145.expected_platform_using', true)");
    expect(verification).toContain("current_setting('dmp145.expected_platform_check', true)");
    expect(verification).toContain('v_editable_columns constant text[]');
    expect(verification).toContain('expected_service_role_table_update');
    expect(verification).toContain('v_expected_service_columns is distinct from v_baseline_service_columns');
    expect(verification).toContain('cardinality(v_expected_service_columns) <> 65');
    expect(verification).toContain('expected_service_role_inherit');
    expect(verification).toContain('expected_service_role_bypassrls');
    expect(verification).toContain('expected_service_role_superuser');
    expect(verification).toContain('expected_service_role_inherited_roles');
    expect(verification).toContain('v_actual_inherited_roles is distinct from v_expected_inherited_roles');
    expect(verification).toContain('v_rpc_public is distinct from array[');
    expect(verification).toContain('v_rpc_anon is distinct from array[');
    expect(verification).toContain('v_rpc_service is distinct from array[');
    expect(verification).toContain('cardinality(v_rpc_public) is distinct from 8');
    expect(verification).toContain('expected_rpc_execute_service_role');
    expect(verification).toContain('expected_update_policy_names');
    expect(verification).toContain("v_actual_execution is distinct from v_expected_executions[v_rpc_index]::boolean");
    expect(verification).toContain("a.attname = any(v_editable_columns)");
    expect(verification).toContain("p.polcmd in ('w', '*')");
    expect(verification).toContain('v_actual_policy_names is distinct from v_expected_policy_names');
    expect(verification).toContain('v_expected_policy_names is distinct from array[');
    expect(verification).toContain("has_table_privilege(v_owner, v_table_oid, 'UPDATE')");
    expect(verification).toContain('PENDING PREFLIGHT');
    expect(verification).not.toMatch(/not \(\s*a\.attname = any\(v_editable_columns\)\s*and has_column_privilege/);
    expect(verification).not.toContain('grant ');
    expect(verification).not.toContain('revoke ');
    expect(verification).not.toContain('update public.work_orders');
  });

  it('protects canonical status writers structurally', () => {
    for (const signature of [
      'dmp_change_work_order_status(uuid,text,text)',
      'dmp_finalize_work_order_technical(uuid,jsonb)',
      'dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text)',
      'dmp_review_work_order_office(uuid,text,text)',
      'request_work_order_return(uuid,uuid,text)',
      'change_work_order_status(uuid,text,uuid,text,boolean,numeric,numeric)',
      'dmp_archive_entity(text,uuid,text)',
      'dmp_restore_entity(text,uuid,text)',
    ]) expect(verification).toContain(signature);
    expect(verification).toContain('p.prosecdef');
    expect(verification).toContain('search_path=public');
  });

  it('keeps the ACL preflight read-only and complete', async () => {
    expect(preflight).toContain('set transaction read only;');
    expect(preflight).toContain('rollback;');
    expect(preflight).toContain("to_regclass('public.work_orders')");
    expect(preflight).toContain('owner_role');
    expect(preflight).toContain("'PUBLIC'::name");
    expect(preflight).toContain('table_update_effective');
    expect(preflight).toContain('effective_update_columns');
    expect(preflight).toContain('explicit_update_columns');
    expect(preflight).toContain('service_role_exists');
    expect(preflight).toContain('pg_attribute');
    expect(preflight).toContain('pg_auth_members');
    expect(preflight).toContain('with recursive membership');
    expect(preflight).toContain('automatically_inherited');
    expect(preflight).toContain('public_contribution');
    expect(preflight).toContain('pg_policy');
    expect(preflight).toContain('execute_authenticated');
    expect(preflight).toContain('execute_anon');
    expect(preflight).toContain('execute_public_effective');
    expect(preflight).toContain('execute_service_role');
    expect(preflight).toContain('aclexplode');
    expect(preflight).toContain("p.polcmd in ('w', '*')");
    expect(preflight).toContain("role_oid = 0 then 'PUBLIC'");
    expect(preflight).toContain('missing_role_oids');
    expect(preflight).toContain('owner_effective_table_update');
    expect(preflight).toContain('search_path_public');
    expect(preflight).not.toMatch(/group by[^;]*p\.polqual/i);
    // Inspect parsed statement nodes, not words in comments, literals or ACL metadata.
    const forbiddenNodes = new Set(['GrantStmt', 'InsertStmt', 'DeleteStmt', 'UpdateStmt', 'AlterTableStmt', 'DropStmt', 'CreateStmt']);
    const hasForbiddenNode = (node: unknown): boolean => {
      if (Array.isArray(node)) return node.some(hasForbiddenNode);
      if (node === null || typeof node !== 'object') return false;
      return Object.entries(node).some(([kind, value]) => forbiddenNodes.has(kind) || hasForbiddenNode(value));
    };
    const parser = await pgQuery();
    expect(hasForbiddenNode(parser.parse(preflight).parse_tree.stmts)).toBe(false);
  });

  it('uses nullable raw ACLs for explicit grants and defaults only for effective grants', () => {
    for (const sql of [preflight, verification]) {
      expect(sql).not.toMatch(/'\{\}'::aclitem\[\]/i);
    }
    expect(preflight).toContain('select c.relacl as acl');
    expect(preflight).toContain("coalesce(c.relacl, acldefault('r', c.relowner))");
    expect(preflight).toContain('aclexplode(columns.attacl)');
    expect(preflight).toContain('aclexplode(a.attacl)');
    expect(preflight).toContain('aclexplode(p.proacl)');
    expect(preflight).toContain("coalesce(p.proacl, acldefault('f', p.proowner))");
    expect(verification).toContain('aclexplode(a.attacl)');
    expect(verification).toContain('aclexplode((select relacl from pg_class where oid = v_table_oid))');
    expect(verification).toContain('aclexplode(p.proacl)');
    expect(verification).toContain("acldefault('r', (select relowner from pg_class where oid = v_table_oid))");
    expect(verification).toContain("coalesce(p.proacl, acldefault('f', p.proowner))");
  });
});
