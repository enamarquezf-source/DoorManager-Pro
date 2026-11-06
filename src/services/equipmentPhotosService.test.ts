import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const remove = vi.fn();
const storageFrom = vi.fn(() => ({ upload, remove }));
const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabase/client', () => ({ supabase: { from, storage: { from: storageFrom }, rpc } }));
vi.mock('./query', () => ({
  currentCompanyId: vi.fn().mockResolvedValue('company-1'),
  expectData: vi.fn(async (request: Promise<any>) => {
    const result = await request;
    if (result.error) throw result.error;
    return result.data;
  }),
}));

describe('equipmentPhotosService', () => {
  beforeEach(() => {
    upload.mockReset().mockResolvedValue({ data: {}, error: null });
    remove.mockReset().mockResolvedValue({ data: {}, error: null });
    rpc.mockReset().mockResolvedValue({ data: 'photo-1', error: null });
    storageFrom.mockClear();
  });

  it('uploads under the tenant equipment path and registers equipment_photos, not check_photos', async () => {
    const { equipmentPhotosService } = await import('./equipmentPhotosService');
    await equipmentPhotosService.upload('equipment-1', {
      id: 'local-1', name: 'camera.jpg', type: 'image/jpeg', size: 4, dataUrl: 'data:image/jpeg;base64,AAAA', syncStatus: 'pending',
    });

    expect(storageFrom).toHaveBeenCalledWith('dmp-files');
    expect(upload.mock.calls[0][0]).toBe('company-1/equipment/equipment-1/local-1.jpg');
    expect(rpc).toHaveBeenCalledWith('dmp_register_equipment_photo', expect.objectContaining({ p_payload: expect.objectContaining({ equipment_id: 'equipment-1', is_primary: true }) }));
  });

  it('changes the selected primary through the dedicated RPC', async () => {
    const { equipmentPhotosService } = await import('./equipmentPhotosService');
    await equipmentPhotosService.setPrimary('photo-1');
    expect(rpc).toHaveBeenCalledWith('dmp_set_equipment_primary_photo', { p_photo_id: 'photo-1' });
  });

  it('filters to the equipment cover in the database before resolving file URLs', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    from.mockReturnValue(query);
    const { equipmentPhotosService } = await import('./equipmentPhotosService');

    expect(await equipmentPhotosService.listPrimary('equipment-1')).toEqual([]);
    expect(from).toHaveBeenCalledWith('equipment_photos');
    expect(query.eq.mock.calls).toEqual([['equipment_id', 'equipment-1'], ['is_primary', true]]);
    expect(query.limit).toHaveBeenCalledWith(1);
  });
});
