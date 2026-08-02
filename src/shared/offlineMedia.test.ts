import { describe, expect, it } from 'vitest';
import { allowedPhotoMimeTypes, hasInkInPixels, maxOfflinePhotoBytes, validatePhotoFile } from './offlineMedia';

function file(size: number, type: string) {
  return new File([new Uint8Array(size)], 'test.bin', { type });
}

describe('offline media validation', () => {
  it('acepta solo MIME de imagen permitidos', () => {
    for (const mime of allowedPhotoMimeTypes) expect(() => validatePhotoFile(file(100, mime))).not.toThrow();
    expect(() => validatePhotoFile(file(100, 'application/pdf'))).toThrow('Formato de foto no permitido');
  });

  it('rechaza fotografia demasiado grande antes de IndexedDB', () => {
    expect(() => validatePhotoFile(file(maxOfflinePhotoBytes + 1, 'image/jpeg'))).toThrow('10 MB');
  });

  it('detecta firma vacia frente a firma con trazo', () => {
    expect(hasInkInPixels(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(hasInkInPixels(new Uint8ClampedArray([0, 0, 0, 0, 1, 1, 1, 255]))).toBe(true);
  });
});
