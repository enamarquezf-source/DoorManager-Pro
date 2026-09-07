type EquipmentRecord = {
  code?: string | null;
  internal_location?: string | null;
  equipment_types?: { name?: string | null } | null;
  type_name?: string | null;
  equipment_type?: string | null;
  clients?: { legal_name?: string | null } | null;
  sites?: { name?: string | null } | null;
  client_name?: string | null;
  site_name?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
};

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function equipmentOperationalLabel(equipment: EquipmentRecord | null | undefined) {
  const type = clean(equipment?.equipment_types?.name) ?? clean(equipment?.type_name) ?? clean(equipment?.equipment_type) ?? 'Tipo no informado';
  const code = clean(equipment?.code) ?? 'Código no informado';
  const client = clean(equipment?.clients?.legal_name) ?? clean(equipment?.client_name);
  const site = clean(equipment?.sites?.name) ?? clean(equipment?.site_name);
  const detail = [clean(equipment?.brand), clean(equipment?.model)].filter(Boolean).join(' ') || 'Marca/modelo no informado';

  return {
    primary: clean(equipment?.internal_location) ?? 'Ubicación sin definir',
    secondary: `${type} · ${code}`,
    context: [client, site].filter(Boolean).join(' · ') || 'Cliente / centro no informados',
    detail,
    status: clean(equipment?.status) ?? 'Sin estado',
  };
}
