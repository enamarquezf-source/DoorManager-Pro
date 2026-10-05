export function storageUploadAlreadyExists(error: { statusCode?: string | number; message?: string } | null) {
  if (!error) return false;
  const status = String(error.statusCode);
  return status === '409' || (status === '400' && /^(?:The resource already exists|Asset Already Exists)\.?$/i.test(error.message ?? ''));
}
