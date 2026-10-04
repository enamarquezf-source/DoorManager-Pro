import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const sql = readFileSync(new URL('../../supabase/repairs/correct_PED_2026_000010_four_radars.sql', import.meta.url), 'utf8');

describe('four-radar administrative repair SQL', () => {
  it('parses the complete transaction and procedural block', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });

  it.each([
    ['119_purchase_orders.sql', 'dmp_purchase_order_line_guard', 0],
    ['120_purchase_receipts.sql', 'dmp_purchase_receipt_line_guard', 1],
  ] as const)('parses the generated scoped exception inside %s', async (file, functionName, index) => {
    const parser = await pgQuery();
    const migration = readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');
    const start = migration.indexOf(`create or replace function public.${functionName}()`);
    const end = migration.indexOf('$$;', migration.indexOf('as $$', start)) + 3;
    const definition = migration.slice(start, end);
    const branch = [...sql.matchAll(/v_branch := format\(\$branch\$([\s\S]*?)\$branch\$/g)][index][1];
    // Exercise apostrophes and backslashes in JSON literals used by format(%L).
    const literal = `'${JSON.stringify({ description: "Radar Falcón d'obra \\ unidad", quantity: 1 }).replaceAll("'", "''")}'`;
    const generated = definition.replace(/\bbegin\b/i, () => `begin\n${branch.replace('%L', () => literal)}`);
    expect(parser.parse(generated).error).toBeNull();
    expect(parser.parsePlpgsql(generated).error).toBeNull();
  });
});
