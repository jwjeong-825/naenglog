-- Approved recovery: preserve unknown costs and history, permit one image attempt.
-- Exact revision/state guards make this idempotent and fail closed on any drift.
UPDATE ai_budget
SET snapshot = json_set(snapshot,
  '$.halted', json('false'),
  '$.receiptTest', json('{"remaining":1,"recovery":"receipt-test-2026-09-15"}'),
  '$.recoveryAudit', json('{"reason":"owner-approved one receipt test; unknown reservation retained","priorRevision":2,"priorHalted":true,"retainedMilliKrw":12358,"recovery":"receipt-test-2026-09-15"}')
), revision = revision + 1
WHERE id = 'championship-2026'
  AND revision = 2
  AND json_valid(snapshot)
  AND json_extract(snapshot, '$.halted') = 1
  AND json_extract(snapshot, '$.total') = 12358
  AND json_array_length(snapshot, '$.entries') = 1
  AND json_extract(snapshot, '$.entries[0].status') = 'uncertain'
  AND json_extract(snapshot, '$.entries[0].usage') IS NULL
  AND json_extract(snapshot, '$.entries[0].cost') = 12358
  AND json_extract(snapshot, '$.receiptTest') IS NULL;
