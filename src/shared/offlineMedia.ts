export const allowedPhotoMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const maxOfflinePhotoBytes = 10 * 1024 * 1024;
const compressionThresholdBytes = 1.5 * 1024 * 1024;
const maxPhotoSide = 1600;

export type LocalPhoto = Record<string, string | number | boolean>;

export function validatePhotoFile(file: File) {
  if (!allowedPhotoMimeTypes.includes(file.type as any)) throw new Error('Formato de foto no permitido. Usa JPG, PNG o WEBP.');
  if (file.size > maxOfflinePhotoBytes) throw new Error('La foto supera el máximo de 10 MB permitido antes de guardarla offline.');
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File): Promise<Blob> {
  if (file.size <= compressionThresholdBytes || typeof Image === 'undefined') return file;
  const dataUrl = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se ha podido procesar la imagen seleccionada.'));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxPhotoSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob && blob.size < file.size ? blob : file;
}

export async function fileToLocalPhoto(file: File): Promise<LocalPhoto> {
  validatePhotoFile(file);
  const prepared = await compressImage(file);
  const dataUrl = await readFileAsDataUrl(prepared);
  return { id: crypto.randomUUID(), name: file.name, type: prepared.type || file.type, size: prepared.size, originalSize: file.size, dataUrl, syncStatus: 'pending', compressed: prepared.size < file.size };
}

export function hasInkInPixels(data: Uint8ClampedArray) {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}

export function canvasHasInk(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  return hasInkInPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}
