import { describe, expect, it } from 'vitest';
import { parseMaterialImport } from './materialImport';

describe('material import parser', () => {
  it('parses quoted CSV, aliases and decimal comma', () => {
    const result = parseMaterialImport('Código,Descripción,Unidad,Cantidad\nMAT-1,"Tornillo, 8mm",ud,"2,5"');
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ code: 'MAT-1', description: 'Tornillo, 8mm', quantity: 2.5 });
  });

  it('reports missing headers and duplicate codes', () => {
    expect(parseMaterialImport('codigo,descripcion\nA,Uno').issues[0].message).toContain('quantity');
    expect(parseMaterialImport('codigo,descripcion,cantidad\nA,Uno,1\nA,Dos,2').issues).toEqual([{ line: 3, message: 'Código duplicado en el archivo: A.' }]);
  });
});
