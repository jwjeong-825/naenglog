'use client';
/* Local blob previews must remain unoptimized; they never leave the browser. */
/* eslint-disable next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import {
  House,
  Refrigerator,
  Plus,
  Sparkles,
  History,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Snowflake,
  ChevronRight,
  Upload,
  Send,
  Leaf,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ai, buildMockBriefing } from '../src/ai';
import { AIServiceError, type Briefing } from '../src/ai-service';
import {
  ranked,
  foods,
  id,
  today,
  calendarDate,
  type State,
  type Draft,
  type Command,
  type Storage,
} from '../src/domain';
import { loadRemote, mutateRemote, ApiError, type Mutation } from '../src/api';
const actionNames = {
  purchase: '구매 등록',
  consume: '소비',
  dispose: '폐기',
  adjust: '수량 수정',
  storage_change: '보관 변경',
};
const navs = [
  ['home', '오늘', House],
  ['fridge', '냉장고', Refrigerator],
  ['add', '추가', Plus],
  ['assistant', '도우미', Sparkles],
  ['history', '기록', History],
] as const;
function StorageSelect({
  value,
  onChange,
}: {
  value: Storage;
  onChange: (v: Storage) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Storage)}>
      <SelectTrigger aria-label="보관 방법">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(['냉장', '냉동', '실온'] as const).map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Blank({ text }: { text: string }) {
  return (
    <Empty>
      <EmptyTitle>아직 없어요</EmptyTitle>
      <EmptyDescription>{text}</EmptyDescription>
    </Empty>
  );
}
export default function Home() {
  const revisionRef = useRef(0),
    mutationRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const [brief, setBrief] = useState<Briefing | null>(null),
    [briefSource, setBriefSource] = useState('모의 분석 중');
  const [state, setState] = useState<State | null>(null),
    [view, setView] = useState('home'),
    [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('전체'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [source, setSource] = useState('직접 입력'),
    [text, setText] = useState(''),
    [preview, setPreview] = useState(''),
    [fileName, setFileName] = useState(''),
    [rows, setRows] = useState<Draft[]>([]),
    [batch, setBatch] = useState(''),
    [commandText, setCommandText] = useState(''),
    [pending, setPending] = useState<Command | null>(null),
    [answer, setAnswer] = useState(''),
    [amount, setAmount] = useState('1'),
    [reset, setReset] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => loadRemote(true))
      .then((s) => {
        if (active) {
          revisionRef.current = s.revision;
          setState(s.state);
          if (s.notice) setNotice(s.notice);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    ai.briefing(state, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setBrief(result);
          setBriefSource('규칙 기반');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBrief(buildMockBriefing(state));
          setBriefSource('분석 지연 · 기본 규칙 안내');
        }
      });
    return () => controller.abort();
  }, [state]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const sync = () => {
      if (mutationRef.current) return;
      void loadRemote()
        .then((snapshot) => {
          if (mutationRef.current) return;
          if (snapshot.revision !== revisionRef.current) {
            requestRef.current?.abort();
            revisionRef.current = snapshot.revision;
            setState(snapshot.state);
            setPending(null);
            setNotice('다른 화면의 변경을 불러왔어요.');
          }
        })
        .catch(() => {});
    };
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);
  const go = (v: string) => {
    requestRef.current?.abort();
    setBusy(false);
    setView(v);
    setError('');
    setNotice('');
    setPending(null);
    window.scrollTo({ top: 0 });
  };
  const commit = async (mutation: Mutation, message: string) => {
    if (mutationRef.current) return false;
    mutationRef.current = true;
    setSaving(true);
    setError('');
    try {
      const snapshot = await mutateRemote(mutation, revisionRef.current);
      revisionRef.current = snapshot.revision;
      setState(snapshot.state);
      setNotice(message);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const latest = await loadRemote();
        revisionRef.current = latest.revision;
        setState(latest.state);
        setPending(null);
      }
      throw error;
    } finally {
      mutationRef.current = false;
      setSaving(false);
    }
  };
  const execute = async (c: Command) => {
    if (!state) return;
    try {
      if (await commit({ kind: 'command', command: c }, '냉장고에 반영했어요.'))
        setPending(null);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const list = state ? ranked(state) : [],
    item = state?.items.find((i) => i.id === selected),
    urgent = list.filter((i) => i.days >= 0 && i.days <= 2),
    expired = list.filter((i) => i.days < 0);
  const choose = (itemId: string) => {
    setSelected(itemId);
    setAmount('1');
    go('detail');
  };
  const analyze = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError('');
    setBusy(true);
    setRows([]);
    try {
      if (source !== '직접 입력' && !preview)
        throw new Error('먼저 이미지를 선택해주세요.');
      const result = await ai.analyze({ source, text }, controller.signal);
      if (controller.signal.aborted) return;
      setRows(result);
      setBatch(id());
    } catch (e) {
      if (!(e instanceof AIServiceError && e.code === 'cancelled'))
        setError((e as Error).message);
    } finally {
      if (requestRef.current === controller) setBusy(false);
    }
  };
  const ask = async () => {
    if (!state || !commandText.trim()) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError('');
    setPending(null);
    try {
      const result = await ai.interpret(commandText, state, controller.signal);
      if (controller.signal.aborted) return;
      if ('message' in result) setAnswer(result.message);
      else {
        setPending(result);
        setAnswer('아래 변경 내용을 확인해주세요.');
      }
    } catch (e) {
      if (!(e instanceof AIServiceError && e.code === 'cancelled'))
        setError((e as Error).message);
    } finally {
      if (requestRef.current === controller) setBusy(false);
    }
  };
  const card = (i: (typeof list)[number], index?: number) => (
    <button key={i.id} className="food-row" onClick={() => choose(i.id)}>
      <span className="food-icon">{foods[i.name]?.emoji ?? '🌱'}</span>
      <span className="food-info">
        <strong>
          {index !== undefined && <span className="rank">0{index + 1} </span>}
          {i.name}
        </strong>
        <small>
          {i.quantity}
          {i.unit} · {i.storage}
        </small>
      </span>
      <span
        className={`badge ${i.days < 0 ? 'danger' : i.days <= 2 ? 'urgent' : ''}`}
      >
        {i.days < 0 ? '시점 지남' : i.days === 0 ? '오늘' : `D-${i.days}`}
      </span>
      <ChevronRight size={17} />
    </button>
  );
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => go('home')}>
          <span className="brand-icon">
            <Refrigerator size={23} />
          </span>
          냉로그<span className="brand-dot">.</span>
        </button>
        <span className="demo-tag">
          <span /> DEMO
        </span>
      </header>
      <main>
        <div className="mode-note">
          <Sparkles size={14} /> 모의 AI 체험 · 나만의 냉장고에 저장돼요
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button onClick={() => setError('')} aria-label="오류 닫기">
              ×
            </button>
          </div>
        )}
        {saving && <output className="success">냉장고에 저장 중…</output>}
        {notice && (
          <output className="success">
            <Check size={17} />
            {notice}
          </output>
        )}
        {!state ? (
          <section className="panel">
            <h1>
              {error
                ? '냉장고 연결을 확인해주세요'
                : '냉장고를 준비하고 있어요'}
            </h1>
            {!error && <Skeleton className="h-40 w-full" />}
            {error && (
              <button
                className="primary wide"
                onClick={() => window.location.reload()}
              >
                다시 연결하기
              </button>
            )}
            {error && (
              <p>
                서버 연결을 확인한 뒤 다시 시도해주세요. 기존 재고는 보존됩니다.
              </p>
            )}
          </section>
        ) : (
          <>
            {view === 'home' && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">
                      {new Date().toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                      })}
                    </p>
                    <h1>오늘의 냉장고</h1>
                  </div>
                  <span className="round-icon">
                    <Leaf />
                  </span>
                </div>
                <section className="brief-card">
                  <div className="brief-top">
                    <span>
                      <Sparkles size={16} /> 오늘의 브리핑
                    </span>
                    <span>{briefSource}</span>
                  </div>
                  <h2>
                    {brief?.title ?? '오늘의 재료를 살펴보고 있어요'}
                    <span className="accent-dot">.</span>
                  </h2>
                  <p>{brief?.message}</p>
                  <button
                    className="light-button"
                    onClick={() => go('assistant')}
                  >
                    도우미와 정리하기 <ArrowUpRight size={17} />
                  </button>
                  <div className="brief-footer">작은 실천으로, 남김없이.</div>
                </section>
                <div className="stats">
                  <div>
                    <span>함께 관리 중</span>
                    <strong>
                      {list.length}
                      <small>가지</small>
                    </strong>
                  </div>
                  <div>
                    <span>먼저 살펴볼 재료</span>
                    <strong className="orange">
                      {urgent.length}
                      <small>가지</small>
                    </strong>
                  </div>
                  <div>
                    <span>시점 지난 재료</span>
                    <strong>
                      {expired.length}
                      <small>가지</small>
                    </strong>
                  </div>
                </div>
                <section>
                  <div className="section-heading">
                    <h2>먼저 꺼내볼까요?</h2>
                    <button onClick={() => go('fridge')}>
                      전체 보기 <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="panel food-list">
                    {list.length ? (
                      list.slice(0, 3).map((i, n) => card(i, n))
                    ) : (
                      <Blank text="구매내역을 추가해 냉장고를 채워보세요." />
                    )}
                  </div>
                </section>
                {list.some(
                  (i) =>
                    i.name === '닭가슴살' &&
                    i.storage === '냉장' &&
                    i.days >= 0 &&
                    i.days <= 2,
                ) && (
                  <button
                    className="storage-tip"
                    onClick={() =>
                      choose(
                        list.find(
                          (i) => i.name === '닭가슴살' && i.storage === '냉장',
                        )!.id,
                      )
                    }
                  >
                    <Snowflake size={24} />
                    <span>
                      <strong>오늘 먹지 않는다면 냉동으로</strong>
                      <small>닭가슴살 보관 방법을 확인해보세요</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                )}
                {brief?.menu && (
                  <section className="meal-card">
                    <span className="eyebrow">남은 재료로 한 끼</span>
                    <h3>{brief.menu}</h3>
                    <p>먼저 사용할 재료를 함께 꺼내보세요.</p>
                    <button
                      onClick={() => {
                        go('assistant');
                        setCommandText('오늘 뭐부터 먹어?');
                      }}
                    >
                      재료 우선순위 확인 <ArrowUpRight size={16} />
                    </button>
                  </section>
                )}
                <button className="primary wide" onClick={() => go('add')}>
                  <Plus size={19} /> 구매내역 추가하기
                </button>
                <p className="footnote">
                  예상 시점은 데모 기준입니다. 제품 표시와 실제 상태를 먼저
                  확인해주세요.
                </p>
              </>
            )}
            {view === 'fridge' && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">MY FRIDGE</p>
                    <h1>우리 집 냉장고</h1>
                  </div>
                  <span>{list.length}가지</span>
                </div>
                <Tabs
                  value={filter}
                  onValueChange={(v) => setFilter(String(v))}
                >
                  <TabsList className="filter-tabs">
                    {['전체', '냉장', '냉동', '실온', '곧 소비'].map((v) => (
                      <TabsTrigger key={v} value={v}>
                        {v}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="panel food-list">
                  {list
                    .filter(
                      (i) =>
                        filter === '전체' ||
                        (filter === '곧 소비' && i.days <= 2) ||
                        i.storage === filter,
                    )
                    .map((i) => card(i))}
                  {!list.filter(
                    (i) =>
                      filter === '전체' ||
                      (filter === '곧 소비' && i.days <= 2) ||
                      i.storage === filter,
                  ).length && <Blank text="이곳에 보관한 재료가 없어요." />}
                </div>
                <button className="primary wide" onClick={() => go('add')}>
                  <Plus size={18} /> 구매내역 추가
                </button>
              </>
            )}
            {view === 'detail' && item && (
              <>
                <button className="back" onClick={() => go('fridge')}>
                  <ArrowLeft size={18} /> 냉장고
                </button>
                <section className="panel detail">
                  <span className="detail-emoji">
                    {foods[item.name]?.emoji ?? '🌱'}
                  </span>
                  <p className="eyebrow">{item.category}</p>
                  <h1>{item.name}</h1>
                  <p>
                    {item.quantity}
                    {item.unit} 남음 · {item.storage}
                  </p>
                  <dl>
                    <div>
                      <dt>상품명</dt>
                      <dd>{item.productName}</dd>
                    </div>
                    <div>
                      <dt>구매일</dt>
                      <dd>{item.purchasedAt}</dd>
                    </div>
                    <div>
                      <dt>등록일</dt>
                      <dd>{calendarDate(item.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>예상 사용 시점</dt>
                      <dd>{item.expectedAt}</dd>
                    </div>
                  </dl>
                  <p className="footnote">
                    모의 정책으로 계산한 시점이며 식품 안전을 보장하지 않아요.
                    개봉 여부, 제품 표시와 실제 상태를 확인해주세요.
                  </p>
                  <div className="field-label">
                    보관 방법
                    <StorageSelect
                      value={item.storage}
                      onChange={(storage) =>
                        setPending({
                          id: id(),
                          itemId: item.id,
                          action: 'storage_change',
                          storage,
                        })
                      }
                    />
                  </div>
                  <label>
                    변경할 수량 ({item.unit})
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <div className="action-grid">
                    <button
                      className="primary"
                      onClick={() =>
                        setPending({
                          id: id(),
                          itemId: item.id,
                          action: 'consume',
                          quantity: amount === '' ? NaN : Number(amount),
                        })
                      }
                    >
                      이만큼 사용
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        setPending({
                          id: id(),
                          itemId: item.id,
                          action: 'adjust',
                          quantity: amount === '' ? NaN : Number(amount),
                        })
                      }
                    >
                      남은 수량 수정
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        setPending({
                          id: id(),
                          itemId: item.id,
                          action: 'consume',
                          quantity: item.quantity,
                        })
                      }
                    >
                      전부 소비
                    </button>
                    <button
                      className="danger-button"
                      onClick={() =>
                        setPending({
                          id: id(),
                          itemId: item.id,
                          action: 'dispose',
                          quantity: amount === '' ? NaN : Number(amount),
                        })
                      }
                    >
                      이만큼 폐기
                    </button>
                  </div>
                </section>
              </>
            )}
            {view === 'add' && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">PURCHASE TO FRIDGE</p>
                    <h1>장 본 내역을 알려주세요</h1>
                  </div>
                </div>
                <p className="intro">기록은 간단하게, 정리는 냉로그에게.</p>
                <Tabs
                  value={source}
                  onValueChange={(v) => {
                    setSource(String(v));
                    setRows([]);
                    setError('');
                  }}
                >
                  <TabsList className="filter-tabs">
                    {['직접 입력', '영수증', '온라인 캡처'].map((v) => (
                      <TabsTrigger disabled={busy} key={v} value={v}>
                        {v}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <section className="panel">
                  {source === '직접 입력' ? (
                    <>
                      <label>
                        식재료 · 수량 · 단위
                        <textarea
                          disabled={busy}
                          rows={5}
                          value={text}
                          onChange={(e) => {
                            setText(e.target.value);
                            setRows([]);
                          }}
                          placeholder={'계란 10개\n우유 2개\n버섯 1팩'}
                        />
                      </label>
                      <p className="footnote">
                        한 줄에 하나씩 입력해주세요. 예: 서울우유 1L 2개
                      </p>
                    </>
                  ) : (
                    <>
                      <label className="upload-zone">
                        <Upload size={27} />
                        <strong>{fileName || '구매내역 이미지 선택'}</strong>
                        <span>JPG, PNG, WEBP · 최대 5MB</span>
                        <input
                          disabled={busy}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setRows([]);
                            setPreview('');
                            setFileName('');
                            if (
                              ![
                                'image/jpeg',
                                'image/png',
                                'image/webp',
                              ].includes(file.type) ||
                              file.size > 5 * 1024 * 1024
                            ) {
                              setError(
                                '5MB 이하 JPG, PNG, WEBP 이미지를 선택해주세요.',
                              );
                              return;
                            }
                            setPreview(URL.createObjectURL(file));
                            setFileName(file.name);
                            setError('');
                          }}
                        />
                      </label>
                      {preview && (
                        <img
                          className="receipt-preview"
                          src={preview}
                          alt="선택한 구매내역"
                          onError={() => {
                            setError(
                              '이미지를 열지 못했어요. 다른 파일을 선택해주세요.',
                            );
                            setPreview('');
                          }}
                        />
                      )}
                      <p className="mock-warning">
                        현재는 이미지 인식 없이 예시 재료 4개를 보여줍니다. 사진
                        속 실제 구매내역과 다를 수 있어요. 이미지는 외부로
                        전송하지 않습니다.
                      </p>
                    </>
                  )}
                  <button
                    disabled={busy}
                    className="primary wide"
                    onClick={analyze}
                  >
                    <Sparkles size={17} />
                    {busy
                      ? '모의 분석 중…'
                      : source === '직접 입력'
                        ? '입력 내용 정리하기'
                        : '예시 분석 체험하기'}
                  </button>
                </section>
                {rows.length > 0 && (
                  <section>
                    <div className="section-heading">
                      <h2>이렇게 등록할까요?</h2>
                      <span>{rows.length}가지</span>
                    </div>
                    <p className="footnote">
                      수량과 보관 방법을 확인해주세요. 같은 재료는 별도 구매
                      건으로 추가됩니다.
                    </p>
                    {rows.map((d, n) => (
                      <div className="panel draft" key={n}>
                        <div className="draft-head">
                          <span>재료 {n + 1}</span>
                          <button
                            onClick={() =>
                              setRows(rows.filter((_, j) => j !== n))
                            }
                          >
                            제외
                          </button>
                        </div>
                        <label>
                          식재료명
                          <input
                            value={d.name}
                            onChange={(e) =>
                              setRows(
                                rows.map((r, j) =>
                                  j === n
                                    ? {
                                        ...r,
                                        name: e.target.value,
                                        category:
                                          foods[e.target.value]?.category ??
                                          '미분류',
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                        <div className="two-cols">
                          <label>
                            수량
                            <input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={Number.isNaN(d.quantity) ? '' : d.quantity}
                              onChange={(e) =>
                                setRows(
                                  rows.map((r, j) =>
                                    j === n
                                      ? {
                                          ...r,
                                          quantity:
                                            e.target.value === ''
                                              ? NaN
                                              : Number(e.target.value),
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            단위
                            <input
                              value={d.unit}
                              onChange={(e) =>
                                setRows(
                                  rows.map((r, j) =>
                                    j === n
                                      ? { ...r, unit: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="two-cols">
                          <label>
                            구매일
                            <input
                              type="date"
                              max={today()}
                              value={d.purchasedAt}
                              onChange={(e) =>
                                setRows(
                                  rows.map((r, j) =>
                                    j === n
                                      ? { ...r, purchasedAt: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </label>
                          <div className="field-label">
                            보관
                            <StorageSelect
                              value={d.storage}
                              onChange={(storage) =>
                                setRows(
                                  rows.map((r, j) =>
                                    j === n ? { ...r, storage } : r,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      className="primary wide"
                      disabled={saving}
                      onClick={async () => {
                        try {
                          if (
                            !(await commit(
                              {
                                kind: 'purchase',
                                rows,
                                batchId: batch,
                                source,
                              },
                              `${rows.length}가지 재료를 등록했어요.`,
                            ))
                          )
                            return;
                          setRows([]);
                          setText('');
                          setView('fridge');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Check size={18} /> 확인하고 냉장고에 넣기
                    </button>
                  </section>
                )}
              </>
            )}
            {view === 'assistant' && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">FRIDGE ASSISTANT</p>
                    <h1>말로 정리하는 냉장고</h1>
                  </div>
                  <Sparkles />
                </div>
                <section className="assistant-welcome">
                  <span className="round-icon">
                    <Sparkles />
                  </span>
                  <h2>무엇을 도와드릴까요?</h2>
                  <p>
                    사용한 재료를 알려주세요.
                    <br />
                    수량과 보관 변경을 함께 정리할게요.
                  </p>
                </section>
                <div className="suggestions">
                  {[
                    '오늘 뭐부터 먹어?',
                    '계란 3개 썼어',
                    '닭가슴살 냉동으로 옮겼어',
                    '우유 다 마셨어',
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setCommandText(s);
                        setPending(null);
                      }}
                    >
                      {s}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
                <form
                  className="command-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <label htmlFor="command">냉장고에게 한마디</label>
                  <div>
                    <input
                      id="command"
                      value={commandText}
                      onChange={(e) => {
                        setCommandText(e.target.value);
                        setPending(null);
                      }}
                      placeholder="계란 3개 썼어"
                      maxLength={200}
                    />
                    <button
                      className="primary"
                      disabled={busy || !commandText.trim()}
                      aria-label="요청 해석"
                    >
                      <Send size={19} />
                    </button>
                  </div>
                </form>
                {busy && <Skeleton className="h-20 w-full" />}
                {answer && (
                  <div className="panel answer">
                    <Sparkles size={20} />
                    <p>{answer}</p>
                  </div>
                )}
                <p className="footnote">
                  현재는 예시 표현을 이해하는 규칙 기반 도우미예요. 변경은 확인
                  후 적용됩니다.
                </p>
              </>
            )}
            {view === 'history' && (
              <>
                <div className="heading">
                  <div>
                    <p className="eyebrow">LITTLE ACTIONS, LESS WASTE</p>
                    <h1>냉장고의 기록</h1>
                  </div>
                </div>
                <div className="stats">
                  <div>
                    <span>소비 기록</span>
                    <strong>
                      {
                        state.transactions.filter((t) => t.action === 'consume')
                          .length
                      }
                      <small>회</small>
                    </strong>
                  </div>
                  <div>
                    <span>폐기 기록</span>
                    <strong>
                      {
                        state.transactions.filter((t) => t.action === 'dispose')
                          .length
                      }
                      <small>회</small>
                    </strong>
                  </div>
                </div>
                <section className="panel">
                  {state.transactions.length ? (
                    state.transactions
                      .slice()
                      .reverse()
                      .map((t) => (
                        <div className="history-row" key={t.id}>
                          <span
                            className={
                              'history-dot ' +
                              (t.action === 'dispose' ? 'waste' : '')
                            }
                          />
                          <div>
                            <strong>
                              {t.name} · {actionNames[t.action]}
                            </strong>
                            <p>{t.detail}</p>
                            <small>
                              {new Date(t.at).toLocaleString('ko-KR')}
                            </small>
                          </div>
                        </div>
                      ))
                  ) : (
                    <Blank text="구매하거나 사용한 기록이 여기에 쌓여요." />
                  )}
                </section>
                <button
                  className="secondary wide"
                  onClick={() => setReset(true)}
                >
                  데모 처음부터 다시 체험하기
                </button>
                <p className="footnote">
                  현재 냉장고의 기록과 재고가 데모 초기 상태로 바뀝니다.
                </p>
              </>
            )}
            {pending && (
              <section className="panel confirmation" aria-live="polite">
                <h3>변경 내용을 확인해주세요</h3>
                <p>
                  {state.items.find((i) => i.id === pending.itemId)?.name} ·{' '}
                  {actionNames[pending.action]}
                </p>
                <strong>
                  {pending.action === 'storage_change'
                    ? pending.storage
                    : `${pending.quantity} ${state.items.find((i) => i.id === pending.itemId)?.unit}`}
                </strong>
                <div className="action-grid">
                  <button
                    className="secondary"
                    onClick={() => setPending(null)}
                  >
                    취소
                  </button>
                  <button
                    className="primary"
                    disabled={saving}
                    onClick={() => void execute(pending)}
                  >
                    확인하고 적용
                  </button>
                </div>
              </section>
            )}
            <AlertDialog open={reset} onOpenChange={setReset}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    데모를 처음부터 시작할까요?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    직접 추가한 재고와 모든 기록이 삭제되고 기본 데모 데이터로
                    교체됩니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={saving}
                    onClick={async () => {
                      try {
                        if (
                          !(await commit(
                            { kind: 'reset' },
                            '데모를 새로 준비했어요.',
                          ))
                        )
                          return;
                        setReset(false);
                        setView('home');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    초기화
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="주 메뉴">
        {navs.map(([v, label, Icon]) => (
          <button
            key={v}
            aria-current={view === v ? 'page' : undefined}
            className={view === v ? 'active' : ''}
            onClick={() => go(v)}
          >
            <span className={v === 'add' ? 'nav-add' : ''}>
              <Icon size={21} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
