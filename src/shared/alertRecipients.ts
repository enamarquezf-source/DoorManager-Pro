export type AlertRecipient = { role?: string; profile_id?: string };

export function normalizeAlertRecipients(recipients: AlertRecipient[]): AlertRecipient[] {
  const result = new Map<string, AlertRecipient>();
  for (const recipient of recipients) {
    const profile_id = recipient.profile_id?.trim();
    const role = recipient.role?.trim();
    // A concrete person takes precedence over the form's default department.
    if (profile_id) result.set(`profile:${profile_id}`, { profile_id });
    else if (role) result.set(`role:${role}`, { role });
    else throw new Error('Selecciona un rol destinatario o una persona antes de crear el aviso.');
  }
  if (!result.size) throw new Error('Selecciona al menos un destinatario para el aviso.');
  return [...result.values()];
}
