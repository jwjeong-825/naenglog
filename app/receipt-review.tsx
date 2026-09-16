'use client';
import { useState } from 'react';
import {
  confirmCandidate,
  type PendingProduct,
} from '../src/receipt-resolution';
import type { Draft } from '../src/domain';
function ReviewItem({
  item,
  onResolve,
  onExclude,
}: {
  item: PendingProduct;
  onResolve: (d: Draft) => void;
  onExclude: () => void;
}) {
  const [name, setName] = useState(''),
    [quantity, setQuantity] = useState('1'),
    [unit, setUnit] = useState('개'),
    [error, setError] = useState('');
  return (
    <div className="uncertain-item">
      <h3>{item.productName}</h3>
      <p>{item.reason}</p>
      {item.resolution?.evidence.map((e) => (
        <p className="footnote" key={e}>
          {e}
        </p>
      ))}
      <div className="suggestions">
        {item.resolution?.candidates.map((candidate) => (
          <button
            key={candidate}
            aria-pressed={name === candidate}
            onClick={() => setName(candidate)}
          >
            {candidate} 후보
          </button>
        ))}
      </div>
      <label>
        식품명 직접 확인
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="two-cols">
        <label>
          수량
          <input
            type="number"
            min="0.001"
            max="10000"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          단위
          <input
            maxLength={10}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="two-cols">
        <button
          className="primary"
          onClick={() => {
            if (
              !name.trim() ||
              !unit.trim() ||
              !Number.isFinite(Number(quantity)) ||
              Number(quantity) <= 0 ||
              Number(quantity) > 10000
            ) {
              setError('식품명·수량·단위를 확인해주세요.');
              return;
            }
            try {
              onResolve(
                confirmCandidate(
                  item.productName,
                  name.trim(),
                  Number(quantity),
                  unit.trim(),
                ),
              );
            } catch {
              setError('식품명·수량·단위를 확인해주세요.');
            }
          }}
        >
          확인 목록에 추가
        </button>
        <button className="secondary" onClick={onExclude}>
          이 품목 제외
        </button>
      </div>
    </div>
  );
}
export function ReceiptReview({
  pending,
  excludedCount,
  onResolve,
  onDismiss,
}: {
  pending: PendingProduct[];
  excludedCount: number;
  onResolve: (index: number, draft: Draft) => void;
  onDismiss: (index: number) => void;
}) {
  return (
    <section
      className="receipt-classification"
      aria-label="구매 품목 분류 확인"
    >
      {excludedCount > 0 && (
        <p className="footnote">
          비식품 {excludedCount}개를 자동으로 제외했습니다.
        </p>
      )}
      {pending.length > 0 && (
        <>
          <h2>확인이 필요한 품목 {pending.length}개</h2>
          {pending.map((item, i) => (
            <ReviewItem
              key={item.productName + ':' + i}
              item={item}
              onResolve={(draft) => onResolve(i, draft)}
              onExclude={() => onDismiss(i)}
            />
          ))}
        </>
      )}
    </section>
  );
}
