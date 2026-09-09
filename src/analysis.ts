import type { Draft } from './domain';
import { assertDraft, isRecord } from './validation';
export type AnalysisResult = {
  version: 1;
  rows: Draft[];
  unresolved: { productName: string; reason: string }[];
  warnings: string[];
};
export function validateAnalysis(raw: unknown): AnalysisResult {
  const keys = (v: Record<string, unknown>, allowed: string[]) =>
    Object.keys(v).every((k) => allowed.includes(k));
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.rows) ||
    raw.rows.length > 50 ||
    !Array.isArray(raw.unresolved) ||
    raw.unresolved.length > 50 ||
    !Array.isArray(raw.warnings) ||
    raw.warnings.length > 10
  )
    throw new Error('Invalid analysis envelope');
  const short = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!keys(raw, ['version', 'rows', 'unresolved', 'warnings']))
    throw new Error('Unknown analysis fields');
  if (
    !raw.warnings.every((v) => short(v, 300)) ||
    !raw.unresolved.every(
      (v) => isRecord(v) && short(v.productName, 120) && short(v.reason, 300),
    )
  )
    throw new Error('Invalid analysis notices');
  raw.rows.forEach((v) => {
    assertDraft(v);
    if (!v.meaning) throw new Error('Missing product meaning');
    if (
      !keys(v, [
        'name',
        'productName',
        'quantity',
        'unit',
        'category',
        'purchasedAt',
        'storage',
        'meaning',
      ]) ||
      !keys(v.meaning, [
        'version',
        'normalizedFoodName',
        'brand',
        'weightPerUnit',
        'weightUnit',
        'totalWeight',
        'packaging',
        'storageCandidates',
        'processed',
        'openingSensitive',
        'confidence',
        'reasons',
        'confirmed',
      ])
    )
      throw new Error('Unknown product fields');
    if (
      v.meaning.weightPerUnit !== null &&
      v.meaning.totalWeight !==
        Math.round(v.meaning.weightPerUnit * v.quantity * 1000) / 1000
    )
      throw new Error('Invalid total weight');
  });
  if (!raw.rows.length && !raw.unresolved.length)
    throw new Error('Empty analysis');
  return {
    ...(structuredClone(raw) as AnalysisResult),
    rows: raw.rows.map((v) => ({
      ...v,
      meaning: { ...v.meaning!, confirmed: false },
    })),
  };
}
