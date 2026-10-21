export function studyHours(hours: number) {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60).toLocaleString('es-ES')} h ${String(minutes % 60).padStart(2, '0')} min`;
}
