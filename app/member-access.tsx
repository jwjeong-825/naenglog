'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { Member } from '../src/server/auth';
export async function accountRequest(body?: object) {
  const r = await fetch('/api/auth', {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = (await r.json()) as { user: Member; error?: string };
  if (!r.ok)
    throw Object.assign(
      new Error(result.error ?? '계정 요청을 처리하지 못했어요.'),
      { status: r.status },
    );
  return result as { user: Member };
}
export function MemberAccess({
  children,
}: {
  children: (user: Member, logout: () => Promise<void>) => ReactNode;
}) {
  const [user, setUser] = useState<Member | null>(null),
    [loading, setLoading] = useState(true),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const check = () => {
      void accountRequest()
        .then((r) => {
          if (active) {
            setUser(r.user);
            setError('');
          }
        })
        .catch((e) => {
          if (active) {
            setUser(null);
            if (e.status !== 401)
              setError('로그인 상태를 확인하지 못했어요. 연결을 확인해주세요.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    const expired = () => {
      setUser(null);
      setError('로그인이 만료되었어요. 다시 로그인해주세요.');
    };
    const sync = (e: StorageEvent) => {
      if (e.key === 'naenglog.account-changed') check();
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('storage', sync);
    window.addEventListener('naenglog-auth-required', expired);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', sync);
      window.removeEventListener('naenglog-auth-required', expired);
    };
  }, []);
  const notify = () => {
    try {
      localStorage.setItem('naenglog.account-changed', crypto.randomUUID());
    } catch {
      /* No credentials are stored in browser storage. */
    }
  };
  if (loading)
    return (
      <main className="auth-shell">
        <h1>냉로그</h1>
        <output>로그인 상태를 확인하고 있어요.</output>
      </main>
    );
  if (user)
    return children(user, async () => {
      await accountRequest({ operation: 'logout' });
      setUser(null);
      notify();
    });
  return (
    <main className="auth-shell">
      <span className="brand">냉로그</span>
      <h1>{register ? '나만의 냉장고 만들기' : '내 냉장고에 로그인'}</h1>
      <p>구매한 식품부터 오늘의 한 끼까지, 내 계정에 안전하게 보관해요.</p>
      <div className="auth-tabs">
        <button
          aria-pressed={!register}
          onClick={() => {
            setRegister(false);
            setError('');
          }}
        >
          로그인
        </button>
        <button
          aria-pressed={register}
          onClick={() => {
            setRegister(true);
            setError('');
          }}
        >
          회원가입
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <form
        key={String(register)}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          const form = e.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          try {
            const result = await accountRequest({
              ...data,
              operation: register ? 'register' : 'login',
              remember: data.remember === 'on',
            });
            form.reset();
            setUser(result.user);
            notify();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : '계정 요청에 실패했어요.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {register ? (
          <>
            <label>
              이름
              <input name="name" autoComplete="name" maxLength={60} required />
            </label>
            <label>
              이메일
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              휴대전화번호
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="010-1234-5678"
                maxLength={20}
                required
              />
            </label>
          </>
        ) : (
          <label>
            이메일 또는 전화번호
            <input
              name="identifier"
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
        )}
        <label>
          비밀번호
          <input
            name="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={12}
            maxLength={72}
            required
          />
        </label>
        {register && (
          <>
            <small>
              12자 이상으로 다른 서비스와 겹치지 않는 비밀번호를 사용해주세요.
              한글 포함 시 최대 72바이트예요.
            </small>
            <label>
              비밀번호 확인
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </label>
          </>
        )}
        <label className="check-label">
          <input name="remember" type="checkbox" />
          자동 로그인 <small>개인 기기에서 30일 유지</small>
        </label>
        {register && (
          <p className="footnote">
            이름·이메일·전화번호는 계정 관리에 사용되며 다른 회원에게 공개되지
            않습니다. 현재 이메일·전화번호 소유 인증과 비밀번호 찾기는 제공하지
            않습니다.
          </p>
        )}
        <button className="primary wide" disabled={busy}>
          {busy ? '처리 중…' : register ? '회원가입' : '로그인'}
        </button>
      </form>
    </main>
  );
}
