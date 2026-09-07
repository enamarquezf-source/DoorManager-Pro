export function primaryEquipmentPhoto(photos: any[] = []) {
  return photos.find((photo) => photo.is_primary === true) ?? null;
}

export function equipmentPhotoExtension(mimeType: string, fileName = '') {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  const fromName = fileName.split('.').pop()?.toLowerCase();
  return fromName === 'png' || fromName === 'webp' || fromName === 'jpg' || fromName === 'jpeg' ? fromName : 'jpg';
}
