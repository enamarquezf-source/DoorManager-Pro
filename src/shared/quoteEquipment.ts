function normalize(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

type EquipmentType = { id: string; name?: string | null };
type QuoteLine = { description?: string | null; quantity?: number | string | null };

function equipmentFamily(description?: string | null) {
  const value = normalize(description);
  if (value.includes('persiana')) return 'persiana';
  if (value.includes('seccional')) return 'seccional';
  if (value.includes('puerta rapida')) return 'rapida';
  if (value.includes('corredera') && value.includes('cristal')) return 'corredera_cristal';
  return null;
}

function resolveType(family: string, description: string, types: EquipmentType[]) {
  const named = types.map((type) => ({ type, name: normalize(type.name) }));
  if (family === 'persiana') return named.find(({ name }) => name.includes('persiana'))?.type;
  if (family === 'seccional') {
    return named.find(({ name }) => name.includes('seccional') && description.includes('industrial'))?.type
      ?? named.find(({ name }) => name.includes('seccional'))?.type;
  }
  if (family === 'rapida') return named.find(({ name }) => name.includes('rapida'))?.type;
  return named.find(({ name }) => name.includes('automatica') && name.includes('peatonal'))?.type
    ?? named.find(({ name }) => name.includes('peatonal'))?.type
    ?? named.find(({ name }) => name.includes('corredera') && name.includes('cristal'))?.type;
}

export function quoteEquipmentSelection(lines: QuoteLine[], types: EquipmentType[]) {
  const selection: Array<Record<string, unknown>> = [];
  const unresolved: string[] = [];

  for (const line of lines) {
    const description = String(line.description ?? '');
    const family = equipmentFamily(description);
    if (!family) continue;
    const type = resolveType(family, normalize(description), types);
    const quantity = Number(line.quantity ?? 0);
    if (!type || !Number.isInteger(quantity) || quantity < 1) {
      unresolved.push(`${quantity || 0} · ${description}`);
      continue;
    }
    selection.push(...Array.from({ length: quantity }, () => ({
      kind: 'new',
      equipment_type_id: type.id,
      quantity: undefined,
      brand: '',
      model: '',
      internal_location: '',
      serial_number: '',
      notes: description,
    })));
  }

  return { selection, unresolved };
}
