import { supabase } from '../lib/supabase/client';
import { currentCompanyId, expectData } from './query';
import { fileToLocalPhoto, type LocalPhoto } from '../shared/offlineMedia';
import { equipmentPhotoExtension } from '../shared/equipmentPhotoPresentation';
import { filesBucket, withSignedFileUrl } from '../shared/signedFiles';

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*);base64/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

export const equipmentPhotosService = {
  async list(equipmentId: string) {
    const rows = await expectData<any[]>(supabase.from('equipment_photos').select('*, files!equipment_photos_file_id_fkey(*)').eq('equipment_id', equipmentId).order('is_primary', { ascending: false }).order('taken_at', { ascending: false }));
    return Promise.all(rows.map(withSignedFileUrl));
  },
  async upload(equipmentId: string, photo: LocalPhoto) {
    const companyId = await currentCompanyId();
    if (!companyId) throw new Error('No se ha podido determinar la empresa para subir la foto.');
    const mime = String(photo.type ?? '');
    const name = String(photo.name ?? 'foto.jpg');
    const localId = String(photo.id ?? crypto.randomUUID());
    const extension = equipmentPhotoExtension(mime, name);
    const path = `${companyId}/equipment/${equipmentId}/${localId}.${extension}`;
    const { blob, mime: uploadedMime } = dataUrlToBlob(String(photo.dataUrl ?? ''));
    const { error } = await supabase.storage.from(filesBucket).upload(path, blob, { contentType: mime || uploadedMime, upsert: true });
    if (error) throw new Error(`No se ha podido subir el archivo a Storage. ${error.message}`);
    try {
      return await expectData<string>(supabase.rpc('dmp_register_equipment_photo', { p_payload: { equipment_id: equipmentId, bucket: filesBucket, path, name, mime_type: mime || uploadedMime, size_bytes: blob.size, make_primary: true, metadata: { source: 'equipment' } } }));
    } catch (error) {
      await supabase.storage.from(filesBucket).remove([path]);
      throw error;
    }
  },
  setPrimary(photoId: string) {
    return expectData<string>(supabase.rpc('dmp_set_equipment_primary_photo', { p_equipment_photo_id: photoId }));
  },
  prepare(file: File) {
    return fileToLocalPhoto(file);
  },
};
