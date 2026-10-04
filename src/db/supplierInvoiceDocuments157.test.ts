import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const sql = readFileSync(new URL('../../supabase/migrations/157_supplier_invoice_documents.sql', import.meta.url), 'utf8');

describe('supplier invoice attachment storage', () => {
  it('parses storage policies and procedural registration', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('keeps files private and scopes uploads to the exact invoice and company', () => {
    expect(sql).toContain("'dmp-invoice-documents', 'dmp-invoice-documents', false");
    expect(sql).toContain("i.company_id = public.current_company_id()");
    expect(sql).toContain("split_part(p_path, '/', 2) is distinct from p_invoice_id::text");
    expect(sql).toContain("split_part(p_path, '/', 3) is distinct from p_origin");
    expect(sql).toContain("public.has_permission('documents.create')");
    expect(sql).toContain('o.owner = auth.uid()');
    expect(sql).toContain('if found then return v_document_id; end if;');
    expect(sql).not.toContain('update public.supplier_invoices');
    expect(sql).not.toContain('update public.warehouse_stock');
  });
});
