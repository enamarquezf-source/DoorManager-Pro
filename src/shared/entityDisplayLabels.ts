type EntityRecord = Record<string, any> | null | undefined;

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function labelText(primary: string | null, code: string | null, fallback: string) {
  const name = primary ?? code ?? fallback;
  return code && code !== name ? `${name} · ${code}` : name;
}

export function formatClientLabel(client: EntityRecord) {
  return labelText(clean(client?.legal_name) ?? clean(client?.trade_name), clean(client?.code), 'Cliente');
}

export function formatCenterLabel(center: EntityRecord) {
  const name = clean(center?.name) ?? clean(center?.description);
  const client = clean(center?.clients?.legal_name) ?? clean(center?.client_name);
  const label = labelText(name, clean(center?.code), 'Centro');
  return client ? `${label} · Cliente: ${client}` : label;
}

export function formatMaterialLabel(material: EntityRecord) {
  return labelText(clean(material?.description) ?? clean(material?.name), clean(material?.code), 'Material');
}

export function formatSupplierLabel(supplier: EntityRecord) {
  return labelText(clean(supplier?.name) ?? clean(supplier?.trade_name), clean(supplier?.internal_code) ?? clean(supplier?.tax_id), 'Proveedor');
}

export function formatEquipmentLabel(equipment: EntityRecord) {
  const type = clean(equipment?.equipment_types?.name) ?? clean(equipment?.type_name) ?? clean(equipment?.equipment_type);
  const detail = [clean(equipment?.brand), clean(equipment?.model)].filter(Boolean).join(' ');
  const primary = [type, detail].filter(Boolean).join(' · ') || clean(equipment?.internal_location);
  return labelText(primary, clean(equipment?.code), 'Equipo');
}

export function formatEntityLabel(entity: EntityRecord) {
  if (entity?.legal_name || entity?.trade_name) return formatClientLabel(entity);
  if (entity?.supplier_id || entity?.tax_id && (entity?.name || entity?.trade_name)) return formatSupplierLabel(entity);
  if (entity?.equipment_type_id || entity?.equipment_types || entity?.brand || entity?.model) return formatEquipmentLabel(entity);
  if (entity?.client_id && (entity?.name || entity?.description)) return formatCenterLabel(entity);
  if (entity?.description || entity?.material_id) return formatMaterialLabel(entity);
  return labelText(clean(entity?.title) ?? clean(entity?.name), clean(entity?.code), 'Registro');
}
