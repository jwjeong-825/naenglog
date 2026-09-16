'use client';
import { useState } from 'react';
import { recipeSafety, type Recipe } from '../src/recipes';
export function RecipeResults({
  recipes,
  mode,
  onBack,
}: {
  recipes: Recipe[];
  mode: string;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const recipe = recipes.find((r) => r.id === selected);
  return (
    <section className="recipes">
      <button
        className="back"
        onClick={() => (recipe ? setSelected(null) : onBack())}
      >
        ← {recipe ? '추천 목록' : '재료 선택'}
      </button>
      <h1>{recipe ? recipe.title : '선택한 재료로 만드는 한 끼'}</h1>
      <p className="footnote">
        {mode === 'mock'
          ? 'Mock 시연 결과 · 실제 조합을 분석한 레시피가 아닙니다.'
          : '선택한 재료 기반 추천'}{' '}
        · 각 레시피는 별도 대안이에요. 등록된 수량이 자동 차감되지는 않아요.
      </p>
      <p className="safety-note">{recipeSafety}</p>
      {(recipe ? [recipe] : recipes).map((r) => (
        <article className="recipe-result" key={r.id}>
          <h2>{r.title}</h2>
          <p>{r.summary}</p>
          <p>
            {r.cookingTimeMinutes}분 · {r.difficulty}
          </p>
          <h3>내 냉장고 재료</h3>
          <ul>
            {r.usedInventoryItems.map((i) => (
              <li key={i.itemId}>
                {i.name} · {i.quantity}
                {i.unit}
              </li>
            ))}
          </ul>
          <h3>추가로 필요한 재료</h3>
          {r.extraIngredients.length ? (
            <ul>
              {r.extraIngredients.map((i, n) => (
                <li key={n}>
                  {i.name} · {i.amount}
                </li>
              ))}
            </ul>
          ) : (
            <p>없어요</p>
          )}
          {recipe ? (
            <>
              <h3>조리 순서</h3>
              <ol>
                {r.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <h3>팁</h3>
              <ul>
                {r.tips.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : (
            <button
              className="secondary"
              onClick={() => {
                setSelected(r.id);
                window.scrollTo({ top: 0 });
              }}
            >
              자세히 보기
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
