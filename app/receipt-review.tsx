'use client';
import { useState } from 'react';
import {
  confirmCandidate,
  type PendingProduct,
  type ExcludedProduct,
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
    <div className="panel">
      <h3>이 상품이 무엇인가요?</h3>
      <p>
        <strong>{item.productName}</strong> · {item.reason}
      </p>
      {item.resolution?.evidence.map((e) => (
        <p className="footnote" key={e}>
          {e}
        </p>
      ))}
      <div className="suggestions">
        {item.resolution?.candidates.map((candidate) => (
          <button key={candidate} onClick={() => setName(candidate)}>
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
  excluded,
  onResolve,
  onDismiss,
  onRestore,
}: {
  pending: PendingProduct[];
  excluded: ExcludedProduct[];
  onResolve: (index: number, draft: Draft) => void;
  onDismiss: (index: number) => void;
  onRestore: (index: number) => void;
}) {
  return (
    <section aria-label="구매 품목 분류 확인">
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
      {excluded.length > 0 && (
        <details className="panel">
          <summary>비식품으로 제외한 품목 {excluded.length}개</summary>
          {excluded.map((item, i) => (
            <div key={item.productName + ':' + i}>
              <p>
                {item.productName} · {item.reason}
              </p>
              <button onClick={() => onRestore(i)}>식품인지 다시 확인</button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
