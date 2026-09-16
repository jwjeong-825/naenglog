import { db, json, sameOrigin } from '../../../../src/server/auth-response';
import { clearLoginFailures, clientKey, createSession, loginBlocked, normalizeEmail, recordLoginFailure, verifyPassword } from '../../../../src/server/auth';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: '입력 내용을 확인해주세요.' }, 400); }
  const email = normalizeEmail(typeof body.email === 'string' ? body.email : ''), key = clientKey(request, email), database = db();
  if (await loginBlocked(database, key)) return json({ error: '로그인 시도가 많아요. 15분 후 다시 시도해주세요.' }, 429);
  const user = await database.prepare('SELECT id, name, email, phone, password_hash FROM users WHERE email = ?').bind(email).first<{ id: string; name: string; email: string; phone: string; password_hash: string }>();
  if (!user || !(await verifyPassword(typeof body.password === 'string' ? body.password : '', user.password_hash))) { await recordLoginFailure(database, key); return json({ error: '이메일 또는 비밀번호를 확인해주세요.' }, 401); }
  await clearLoginFailures(database, key);
  return json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } }, 200, await createSession(database, user.id, Boolean(body.autoLogin), new URL(request.url).protocol === 'https:'));
}
