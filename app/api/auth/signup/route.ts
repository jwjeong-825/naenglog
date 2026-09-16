import { db, json, sameOrigin } from '../../../../src/server/auth-response';
import { createSession, hashPassword, normalizeEmail, normalizePhone, validEmail, validPassword, validPhone } from '../../../../src/server/auth';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: '입력 내용을 확인해주세요.' }, 400); }
  const value = (key: string) => typeof body[key] === 'string' ? body[key] as string : '';
  const name = value('name').trim(), email = normalizeEmail(value('email')), phone = normalizePhone(value('phone')), password = value('password'), confirmation = value('passwordConfirmation');
  if (name.length < 2 || name.length > 40) return json({ error: '이름은 2~40자로 입력해주세요.' }, 400);
  if (!validEmail(email)) return json({ error: '올바른 이메일을 입력해주세요.' }, 400);
  if (!validPhone(phone)) return json({ error: '올바른 한국 휴대전화 번호를 입력해주세요.' }, 400);
  if (!validPassword(password)) return json({ error: '비밀번호는 10자 이상이며 영문, 숫자, 특수문자를 포함해야 해요.' }, 400);
  if (password !== confirmation) return json({ error: '비밀번호 확인이 일치하지 않아요.' }, 400);
  const database = db();
  const exists = await database.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').bind(email, phone).first<{ id: string }>();
  if (exists) return json({ error: '이미 가입된 이메일 또는 전화번호예요.' }, 409);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  try { await database.prepare('INSERT INTO users (id, name, email, phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, email, phone, await hashPassword(password), now, now).run(); }
  catch { return json({ error: '이미 가입된 이메일 또는 전화번호예요.' }, 409); }
  return json({ user: { id, name, email, phone } }, 201, await createSession(database, id, Boolean(body.autoLogin), new URL(request.url).protocol === 'https:'));
}
