import type { Draft } from './domain';

export function confirmAllReviewRows(rows: Draft[]): Draft[] {
  return rows.map((row) =>
    row.meaning
      ? {
          ...row,
          meaning: { ...row.meaning, confirmed: true },
        }
      : row,
  );
}

export function allReviewRowsConfirmed(rows: Draft[]): boolean {
  return (
    rows.length > 0 &&
    rows.every((row) => !row.meaning || row.meaning.confirmed)
  );
}
