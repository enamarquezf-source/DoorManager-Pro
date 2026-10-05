import { describe, expect, it } from 'vitest';
import { normalizeAlertRecipients } from './alertRecipients';

describe('alert recipients', () => {
  it('sends a personal alert only to the selected person, without the default SAT group', () => {
    expect(normalizeAlertRecipients([{ role: 'SAT', profile_id: ' worker ' }])).toEqual([{ profile_id: 'worker' }]);
  });
  it('retains department alerts and removes repeated recipients', () => {
    expect(normalizeAlertRecipients([{ role: ' SAT ' }, { role: 'SAT' }, { profile_id: 'worker' }, { profile_id: 'worker' }])).toEqual([{ role: 'SAT' }, { profile_id: 'worker' }]);
  });
  it('rejects a missing destination before creating any record', () => {
    expect(() => normalizeAlertRecipients([])).toThrow('al menos un destinatario');
    expect(() => normalizeAlertRecipients([{ role: '' }])).toThrow('rol destinatario');
  });
});
