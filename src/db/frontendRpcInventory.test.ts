import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const servicesDir = resolve(process.cwd(), 'src/services');
const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const draftsDir = resolve(process.cwd(), 'docs/drafts');
const rpcReconcileMigration = readFileSync(resolve(migrationsDir, '018_rpc_reconcile_missing_frontend_functions.sql'), 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    if (extname(entry.name) !== '.ts' || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

function uniqueMatches(input: string, pattern: RegExp) {
  return [...new Set([...input.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe('frontend RPC inventory', () => {
  it('define en SQL todas las RPC usadas por src/services', () => {
    const frontendRpc = uniqueMatches(
      files(servicesDir).map((file) => readFileSync(file, 'utf8')).join('\n'),
      /supabase\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g,
    );
    const activeRpc = uniqueMatches(
      readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).map((file) => readFileSync(resolve(migrationsDir, file), 'utf8')).join('\n'),
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)\s*\(/gi,
    );
    const draftRpc = uniqueMatches(
      readdirSync(draftsDir).filter((file) => file.endsWith('.sql')).map((file) => readFileSync(resolve(draftsDir, file), 'utf8')).join('\n'),
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)\s*\(/gi,
    );

    expect(frontendRpc.length).toBeGreaterThanOrEqual(27);
    expect(frontendRpc.filter((name) => !activeRpc.includes(name) && !draftRpc.includes(name))).toEqual([]);
  });

  it('repone en la nueva reconciliacion las RPC ausentes en Supabase real', () => {
    for (const rpc of [
      'assign_commercial_work_order',
      'create_case',
      'create_work_order_full',
      'save_check_block_result',
      'superadmin_create_profile',
      'technician_global_search',
      'unassign_work_order_profile',
    ]) {
      expect(rpcReconcileMigration).toMatch(new RegExp(`create(?: or replace)? function public\\.${rpc}\\s*\\(`, 'i'));
    }
  });
});
