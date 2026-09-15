import {
  assertResolution,
  type PendingProduct,
  type ExcludedProduct,
} from './receipt-resolution';
import type { Draft } from './domain';
import { assertDraft, DraftValidationError, isRecord } from './validation';
export type AnalysisValidationReason =
  | 'invalid_analysis_envelope'
  | 'invalid_warning_or_notice'
  | 'invalid_product_notice'
  | 'invalid_draft_basic_fields'
  | 'invalid_quantity'
  | 'invalid_purchase_date'
  | 'invalid_expiry_date'
  | 'invalid_storage'
  | 'invalid_product_meaning'
  | 'invalid_weight_fields'
  | 'invalid_total_weight'
  | 'invalid_resolution'
  | 'invalid_analysis_fields'
  | 'empty_analysis';
export class AnalysisValidationError extends Error {
  constructor(public readonly reasonCode: AnalysisValidationReason) {
    super(reasonCode);
    this.name = 'AnalysisValidationError';
  }
}
const fail = (reasonCode: AnalysisValidationReason): never => {
  throw new AnalysisValidationError(reasonCode);
};
export type AnalysisResult = {
  version: 1;
  rows: Draft[];
  unresolved: PendingProduct[];
  excluded?: ExcludedProduct[];
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
    fail('invalid_analysis_envelope');
  const analysis = raw as Record<string, unknown> & {
    rows: unknown[];
    unresolved: unknown[];
    warnings: unknown[];
    excluded?: unknown[];
  };
  const short = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (
    !keys(analysis, ['version', 'rows', 'unresolved', 'warnings', 'excluded'])
  )
    fail('invalid_analysis_fields');
  if (
    !analysis.warnings.every((v) => short(v, 300)) ||
    !analysis.unresolved.every(
      (v) => isRecord(v) && short(v.productName, 120) && short(v.reason, 300),
    )
  )
    fail('invalid_warning_or_notice');
  if (
    analysis.excluded !== undefined &&
    (!Array.isArray(analysis.excluded) || analysis.excluded.length > 50)
  )
    fail('invalid_product_notice');
  for (const item of [...analysis.unresolved, ...(analysis.excluded ?? [])]) {
    if (
      !isRecord(item) ||
      !short(item.productName, 120) ||
      !short(item.reason, 300) ||
      !keys(item, ['productName', 'reason', 'resolution'])
    )
      fail('invalid_product_notice');
    const notice = item as Record<string, unknown>;
    if (notice.resolution !== undefined) {
      try {
        assertResolution(notice.resolution);
      } catch {
        fail('invalid_resolution');
      }
    }
  }
  for (const item of (analysis.excluded as ExcludedProduct[]) ?? [])
    if (!item.resolution || item.resolution.classification !== 'NON_FOOD')
      fail('invalid_resolution');
  analysis.rows.forEach((value) => {
    try {
      assertDraft(value);
    } catch (error) {
      if (error instanceof DraftValidationError) fail(error.reasonCode);
      throw error;
    }
    const v = value;
    if (!v.meaning) fail('invalid_product_meaning');
    const meaning = v.meaning!;
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
        'expiryDate',
      ]) ||
      !keys(meaning, [
        'version',
        'resolution',
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
      fail('invalid_analysis_fields');
    if (
      meaning.weightPerUnit !== null &&
      meaning.totalWeight !==
        Math.round(meaning.weightPerUnit * v.quantity * 1000) / 1000
    )
      fail('invalid_total_weight');
  });
  if (
    !analysis.rows.length &&
    !analysis.unresolved.length &&
    !analysis.excluded?.length
  )
    fail('empty_analysis');
  return {
    ...(structuredClone(analysis) as AnalysisResult),
    rows: (analysis.rows as Draft[]).map((v) => ({
      ...v,
      meaning: { ...v.meaning!, confirmed: false },
    })),
  };
}
