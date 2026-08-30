export type InitialStockStatus = 'LEGACY_ONLY_POSITIVE' | 'LEGACY_ONLY_ZERO' | 'LEGACY_UNKNOWN' | 'MISMATCH' | 'MATCH';

export function classifyInitialStockMaterial(material: { stock_quantity?: number | string | null }, canonical: Array<{ quantity?: number | string | null }>) {
  const rawLegacy = material.stock_quantity;
  const legacy = rawLegacy === null || rawLegacy === undefined || rawLegacy === '' ? null : Number(rawLegacy);
  const canonicalTotal = canonical.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

  if (canonical.length > 0) {
    return {
      legacy,
      canonicalTotal,
      status: canonical.length > 1 || legacy === null || !Number.isFinite(legacy) || canonicalTotal !== legacy ? 'MISMATCH' as const : 'MATCH' as const,
    };
  }
  if (legacy === null || !Number.isFinite(legacy)) return { legacy, canonicalTotal, status: 'LEGACY_UNKNOWN' as const };
  return { legacy, canonicalTotal, status: legacy > 0 ? 'LEGACY_ONLY_POSITIVE' as const : legacy === 0 ? 'LEGACY_ONLY_ZERO' as const : 'LEGACY_UNKNOWN' as const };
}
