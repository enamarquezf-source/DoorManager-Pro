import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migrationRoot = new URL('../../supabase/migrations/', import.meta.url);
const migration073 = readFileSync(new URL('073_office_validation_and_additional_sales.sql', migrationRoot), 'utf8');
const migration074 = readFileSync(new URL('074_invoicing_and_collections.sql', migrationRoot), 'utf8');
const migration075 = readFileSync(new URL('075_material_stock_write_boundary.sql', migrationRoot), 'utf8');
const migration076 = readFileSync(new URL('../../supabase/migrations/076_fix_audit_log_operations_office_validation.sql', import.meta.url), 'utf8');
const migration078 = readFileSync(new URL('../../supabase/migrations/078_invoice_draft_review_and_issue.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_audit_log_operations_076.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_audit_log_operations_076.sql', import.meta.url), 'utf8');

const officeOperations = ['TECHNICAL_FINALIZE_PENDING_OFFICE', 'OFFICE_VALIDATE', 'OFFICE_REJECT'];
const legacyOperations = ['INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'OPERATIONAL_UPDATE', 'TECHNICAL_FINALIZE'];
const futureOperations = ['INVOICE_ISSUE', 'PAYMENT_RECORD', 'MATERIAL_CREATE'];

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && value[index + 1] === "'") { index += 1; continue; }
    if (character === "'") { quote = !quote; continue; }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function firstValuesTuple(sql: string, valuesStart: number) {
  const open = sql.indexOf('(', valuesStart);
  let depth = 0;
  let quote = false;
  for (let index = open; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'" && sql[index + 1] === "'") { index += 1; continue; }
    if (character === "'") { quote = !quote; continue; }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') { depth -= 1; if (depth === 0) return sql.slice(open + 1, index); }
  }
  return null;
}

function extractAuditOperations(sql: string) {
  const operations = new Set<string>();
  const dynamic: string[] = [];
  const insertPattern = /insert\s+into\s+public\.audit_log\s*\(([^)]*)\)\s*values\s*/gi;
  for (const match of sql.matchAll(insertPattern)) {
    const columns = splitTopLevel(match[1]).map((column) => column.toLowerCase());
    const operationIndex = columns.indexOf('operation');
    const tuple = firstValuesTuple(sql, (match.index ?? 0) + match[0].length);
    if (operationIndex < 0 || !tuple) continue;
    const expression = splitTopLevel(tuple)[operationIndex] ?? '';
    const literals = expression.match(/'([A-Z][A-Z0-9_]*)'/g)?.map((literal) => literal.slice(1, -1)) ?? [];
    literals.forEach((literal) => operations.add(literal));
    if (!literals.length && /[a-z_][a-z0-9_]*/i.test(expression)) dynamic.push(expression.replace(/\s+/g, ' ').trim());
  }
  return { operations, dynamic };
}

function finalConstraintOperations(sql: string) {
  return new Set(sql.match(/check\s*\(\s*operation\s+in\s*\(([^)]*)\)\s*\)/is)?.[1].match(/'([A-Z][A-Z0-9_]*)'/g)?.map((literal) => literal.slice(1, -1)) ?? []);
}

describe('audit_log operations 076', () => {
  it('parses the corrective migration and read-only checks', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration076).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('verifies the real 073, 074 and 075 audit sources', () => {
    for (const operation of officeOperations) expect(extractAuditOperations(migration073).operations).toContain(operation);
    for (const operation of ['INVOICE_ISSUE', 'PAYMENT_RECORD']) expect(extractAuditOperations(migration074).operations).toContain(operation);
    expect(extractAuditOperations(migration075).operations).toContain('MATERIAL_CREATE');
  });

  it('proves all literal audit operations are admitted by 076', () => {
    const operations = new Set<string>();
    const dynamic: string[] = [];
    for (const name of readdirSync(migrationRoot).filter((entry) => entry.endsWith('.sql'))) {
      const result = extractAuditOperations(readFileSync(new URL(name, migrationRoot), 'utf8'));
      result.operations.forEach((operation) => operations.add(operation));
      dynamic.push(...result.dynamic.map((expression) => `${name}: ${expression}`));
    }
    const admitted = finalConstraintOperations(migration078);
    expect([...operations].filter((operation) => !admitted.has(operation))).toEqual([]);
    expect([...admitted].sort()).toEqual([...new Set([...legacyOperations, ...officeOperations, ...futureOperations, 'INVOICE_DRAFT_CREATE', 'INVOICE_DRAFT_UPDATE'])].sort());
    expect(dynamic).toEqual(['022_security_lifecycle_controls.sql: p_operation']);
  });

  it('preserves legacy operations and keeps verification read-only', () => {
    expect(legacyOperations.every((operation) => finalConstraintOperations(migration076).has(operation))).toBe(true);
    expect(officeOperations.every((operation) => finalConstraintOperations(migration076).has(operation))).toBe(true);
    expect(futureOperations.every((operation) => finalConstraintOperations(migration076).has(operation))).toBe(true);
    for (const sql of [preflight, postflight]) {
      expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
    }
    expect(preflight).toContain("column_name = 'operation'");
    expect(postflight).toContain("'SUMMARY'");
    expect(postflight).toContain("'postcheck_076'");
    expect(migration076).not.toContain('074_');
    expect(migration076).not.toContain('075_');
  });
});
