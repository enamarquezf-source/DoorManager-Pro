export type MaterialImportRow = {
  line: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  warehouseCode?: string;
};

export type MaterialImportIssue = { line: number; message: string };

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

const headerAliases: Record<string, string> = {
  codigo: 'code', código: 'code', code: 'code',
  descripcion: 'description', descripción: 'description', description: 'description',
  unidad: 'unit', unit: 'unit',
  cantidad: 'quantity', quantity: 'quantity', stock: 'quantity',
  almacen: 'warehouseCode', almacén: 'warehouseCode', warehouse: 'warehouseCode',
};

export function parseMaterialImport(text: string): { rows: MaterialImportRow[]; issues: MaterialImportIssue[] } {
  const raw = splitCsv(text.replace(/^\uFEFF/, ''));
  if (!raw.length) return { rows: [], issues: [{ line: 1, message: 'El archivo está vacío.' }] };
  const headers = raw[0].map((header) => headerAliases[header.toLowerCase()]);
  const issues: MaterialImportIssue[] = [];
  for (const required of ['code', 'description', 'quantity']) if (!headers.includes(required)) issues.push({ line: 1, message: `Falta la columna obligatoria: ${required}.` });
  if (issues.length) return { rows: [], issues };
  const rows: MaterialImportRow[] = [];
  raw.slice(1).forEach((values, index) => {
    const line = index + 2;
    const value = (key: string) => values[headers.indexOf(key)]?.trim() ?? '';
    const quantity = Number(value('quantity').replace(',', '.'));
    const row = { line, code: value('code'), description: value('description'), unit: value('unit') || 'ud', quantity, warehouseCode: value('warehouseCode') || undefined };
    if (!row.code || !row.description) issues.push({ line, message: 'Código y descripción son obligatorios.' });
    if (!Number.isFinite(quantity) || quantity <= 0) issues.push({ line, message: 'La cantidad debe ser un número mayor que cero.' });
    else rows.push(row);
  });
  const seen = new Set<string>();
  for (const row of rows) if (seen.has(row.code.toLowerCase())) issues.push({ line: row.line, message: `Código duplicado en el archivo: ${row.code}.` }); else seen.add(row.code.toLowerCase());
  return { rows, issues };
}
