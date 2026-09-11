'use client';
import { CONFIDENCE_THRESHOLDS } from '../src/receipt-resolution';
import type { Draft } from '../src/domain';
import type { ProductMeaning } from '../src/product';
export function ProductReview({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const m = draft.meaning;
  if (!m) return null;
  const update = (patch: Partial<ProductMeaning>) =>
    onChange({ ...draft, meaning: { ...m, ...patch, confirmed: false } });
  return (
    <details className="product-review" open>
      <summary>
        상품 의미 확인 · {m.confirmed ? '확인 완료' : '확인 필요'}
      </summary>
      <p>
        <strong>원본 상품명</strong>
        <br />
        <input
          aria-label="원본 상품명"
          maxLength={120}
          value={draft.productName}
          onChange={(e) =>
            onChange({
              ...draft,
              productName: e.target.value,
              meaning: { ...m, confirmed: false },
            })
          }
        />
      </p>
      <p>
        → {draft.name} · {draft.quantity}
        {draft.unit}로 관리
      </p>
      {m.reasons.map((r) => (
        <p className="footnote" key={r}>
          {r}
        </p>
      ))}
      {m.resolution && (
        <p className="footnote">
          분류: 식품 · 신뢰 점수 {m.resolution.score.toFixed(2)} ·{' '}
          {m.resolution.score < CONFIDENCE_THRESHOLDS.review
            ? '추가 확인 필요'
            : m.resolution.score < CONFIDENCE_THRESHOLDS.high
              ? '수정 가능'
              : '확인 후 일괄 등록'}{' '}
          {['local_rule', 'mock_catalog'].includes(m.resolution.method)
            ? '(규칙 기반 예시, 실제 AI 확률 아님)'
            : ''}
        </p>
      )}
      <label>
        제품 표시 소비기한 (선택)
        <input
          type="date"
          min={draft.purchasedAt}
          value={draft.expiryDate ?? ''}
          onChange={(e) =>
            onChange({
              ...draft,
              expiryDate: e.target.value || undefined,
              meaning: { ...m, confirmed: false },
            })
          }
        />
      </label>
      <p className="footnote">
        제품 표시가 없으면 보관별 기본 예상기간으로 안내해요. 실제 소비기한으로
        확정하지 않아요.
      </p>
      <div className="two-cols">
        <label>
          카테고리
          <input
            value={draft.category}
            onChange={(e) =>
              onChange({
                ...draft,
                category: e.target.value,
                meaning: { ...m, confirmed: false },
              })
            }
          />
        </label>
        <label>
          브랜드
          <input
            value={m.brand ?? ''}
            placeholder="알 수 없음"
            onChange={(e) => update({ brand: e.target.value || null })}
          />
        </label>
        <label>
          포장 단위
          <input
            value={m.packaging ?? ''}
            placeholder="알 수 없음"
            onChange={(e) => update({ packaging: e.target.value || null })}
          />
        </label>
        <label>
          포장당 중량/용량
          <input
            type="number"
            min="0"
            step="any"
            value={m.weightPerUnit ?? ''}
            onChange={(e) => {
              const w = e.target.value === '' ? null : Number(e.target.value);
              update({
                weightPerUnit: w,
                weightUnit: w === null ? null : (m.weightUnit ?? 'g'),
                totalWeight:
                  w === null
                    ? null
                    : Math.round(w * draft.quantity * 1000) / 1000,
              });
            }}
          />
        </label>
        <label>
          중량/용량 단위
          <select
            value={m.weightUnit ?? ''}
            disabled={m.weightPerUnit === null}
            onChange={(e) =>
              update({
                weightUnit: e.target.value as ProductMeaning['weightUnit'],
              })
            }
          >
            <option value="">미확인</option>
            {['g', 'kg', 'ml', 'L'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          가공식품
          <select
            value={String(m.processed)}
            onChange={(e) =>
              update({
                processed:
                  e.target.value === 'null' ? null : e.target.value === 'true',
              })
            }
          >
            <option value="null">미확인</option>
            <option value="true">예</option>
            <option value="false">아니요</option>
          </select>
        </label>
        <label>
          개봉 전후 구분 필요
          <select
            value={String(m.openingSensitive)}
            onChange={(e) =>
              update({
                openingSensitive:
                  e.target.value === 'null' ? null : e.target.value === 'true',
              })
            }
          >
            <option value="null">미확인</option>
            <option value="true">예</option>
            <option value="false">아니요</option>
          </select>
        </label>
      </div>
      <p>
        구매 총량:{' '}
        {m.totalWeight === null ? '미확인' : `${m.totalWeight}${m.weightUnit}`}{' '}
        · 보관 후보: {m.storageCandidates.join(' / ')} (제품 표시 우선)
      </p>
      <label>
        <input
          type="checkbox"
          checked={m.confirmed}
          onChange={(e) =>
            onChange({
              ...draft,
              meaning: { ...m, confirmed: e.target.checked },
            })
          }
        />{' '}
        해석·수량·구매일·보관 조건을 확인했어요
      </label>
    </details>
  );
}
