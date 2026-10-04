import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const sql = readFileSync(new URL('../../supabase/migrations/156_optional_supplier_invoice_number.sql', import.meta.url), 'utf8');
const original = readFileSync(new URL('../../supabase/migrations/130_supplier_invoice_core.sql', import.meta.url), 'utf8');

describe('optional external supplier invoice number', () => {
  it('parses the migration and the registration function body', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });

  it('changes only the external-number guard and preserves every other registration check', () => {
    const body = (text: string) => text.match(/create or replace function public\.dmp_register_supplier_invoice\([\s\S]*?\$\$;/)![0];
    expect(body(sql)).toBe(body(original).replace(
      "  if nullif(trim(v_invoice.supplier_invoice_number), '') is null then raise exception 'factura proveedor: el número del proveedor es obligatorio'; end if;",
      '  -- El número externo es opcional; el código interno FPR identifica la factura.',
    ));
  });
});
