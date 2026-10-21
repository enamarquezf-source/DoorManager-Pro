type Field = [string, string, boolean?];
export function groupEntityFields(fields: Field[]): { title: string; fields: Field[] }[] {
  if (fields.length <= 6) return [{ title: 'Datos principales', fields }];
  const address = new Set(['address','city','province','postal_code','country','schedule']);
  const contact = new Set(['phone','email','notes']);
  return [
    { title: 'Identificación', fields: fields.filter(([key]) => !address.has(key) && !contact.has(key)) },
    { title: 'Ubicación y horario', fields: fields.filter(([key]) => address.has(key)) },
    { title: 'Contacto y observaciones', fields: fields.filter(([key]) => contact.has(key)) },
  ].filter(group => group.fields.length > 0);
}
