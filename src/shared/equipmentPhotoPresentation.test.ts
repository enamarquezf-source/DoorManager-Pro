import { describe, expect, it } from 'vitest';
import { equipmentPhotoExtension, primaryEquipmentPhoto } from './equipmentPhotoPresentation';

describe('equipment photo presentation', () => {
  it('selects only the explicitly marked primary photo', () => {
    const primary = { id: 'photo-2', is_primary: true };
    expect(primaryEquipmentPhoto([{ id: 'photo-1', is_primary: false }, primary])).toBe(primary);
    expect(primaryEquipmentPhoto([{ id: 'photo-1', is_primary: false }])).toBeNull();
  });

  it('uses safe image extensions', () => {
    expect(equipmentPhotoExtension('image/jpeg', 'camera.heic')).toBe('jpg');
    expect(equipmentPhotoExtension('image/png')).toBe('png');
    expect(equipmentPhotoExtension('image/webp')).toBe('webp');
  });
});
