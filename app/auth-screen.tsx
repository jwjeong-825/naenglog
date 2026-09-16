'use client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

export type Account = { id: string; name: string; email: string; phone: string };
export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const savedEmail = () => typeof window === 'undefined' ? '' : localStorage.getItem('naenglog_saved_email') ?? '';
  const [name, setName] = useState(''), [email, setEmail] = useState(savedEmail), [phone, setPhone] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() => !!savedEmail()), [autoLogin, setAutoLogin] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'signup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, password, passwordConfirmation: confirmation, autoLogin }) });
      const body = await res.json() as { user?: Account; error?: string };
      if (!res.ok || !body.user) throw new Error(body.error ?? '요청을 처리하지 못했어요.');
      if (rememberEmail) localStorage.setItem('naenglog_saved_email', email.trim().toLowerCase()); else localStorage.removeItem('naenglog_saved_email');
      onAuthenticated(body.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span>냉</span><div><strong>냉로그</strong><p>나만의 냉장고 기록</p></div></div>
    <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
    {error && <div className="alert" role="alert">{error}</div>}
    <form onSubmit={submit}>
      {mode === 'signup' && <><label>이름<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} /></label></>}
      <label>이메일<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      {mode === 'signup' && <label>전화번호<input type="tel" autoComplete="tel" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>}
      <label>비밀번호<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {mode === 'signup' && <><label>비밀번호 확인<input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label><p className="footnote">10자 이상, 영문·숫자·특수문자를 포함해주세요.</p></>}
      <div className="auth-options">
        <label className="check-row" htmlFor="remember-email"><Checkbox id="remember-email" checked={rememberEmail} onCheckedChange={(v) => setRememberEmail(Boolean(v))} /> 아이디 저장하기</label>
        <label className="check-row" htmlFor="auto-login"><Checkbox id="auto-login" checked={autoLogin} onCheckedChange={(v) => setAutoLogin(Boolean(v))} /> 자동 로그인</label>
      </div>
      <button className="primary wide" disabled={busy}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}</button>
    </form>
    <p className="auth-switch">{mode === 'login' ? '회원이 아니신가요?' : '이미 계정이 있으신가요?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? '회원가입' : '로그인'}</button></p>
  </section></main>;
}
