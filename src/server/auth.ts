import { hash, compare } from 'bcryptjs';
import type { Database } from './repository';
import { isRecord } from '../validation';

export type Member = { id: string; name: string; email: string; phone: string };
const cookieName = 'naenglog_auth';
const generic = '이메일/전화번호 또는 비밀번호가 올바르지 않아요.';
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const tokenHash = async (value: string) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  );
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export function memberToken(request: Request) {
  const value = request.headers
    .get('Cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  return value && /^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/.test(value)
    ? value
    : null;
}
const phone = (value: string) =>
  value.replace(/[\s()-]/g, '').replace(/^\+82/, '0');
const json = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      Vary: 'Cookie',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
function cookie(request: Request, token: string, maxAge?: number) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;
}
export class AuthStore {
  constructor(
    private db: Database,
    private now = () => Date.now(),
  ) {}
  async member(request: Request): Promise<Member | null> {
    const token = memberToken(request);
    if (!token) return null;
    return this.db
      .prepare(
        'SELECT u.id,u.name,u.email,u.phone FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
      )
      .bind(await tokenHash(token), new Date(this.now()).toISOString())
      .first<Member>();
  }
  private async throttle(
    request: Request,
    identifier: string,
    register: boolean,
  ) {
    const now = this.now(),
      end = Math.floor(now / 900000) * 900000 + 900000;
    // Only the platform-provided address is trusted, never X-Forwarded-For.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unavailable';
    const buckets: [string, number][] = [[`ip:${ip}`, register ? 5 : 40]];
    if (!register) buckets.push([`account:${identifier}`, 10]);
    for (const [key, limit] of buckets) {
      const bucket = await tokenHash(
        `${register ? 'register' : 'login'}:${end}:${key}`,
      );
      const row = await this.db
        .prepare(
          'INSERT INTO auth_attempts(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
        )
        .bind(bucket, end)
        .first<{ count: number }>();
      if (!row || row.count > limit) return false;
    }
    await this.db
      .prepare('DELETE FROM auth_attempts WHERE expires_at<?')
      .bind(now)
      .run();
    return true;
  }
  async GET(request: Request) {
    try {
      const user = await this.member(request);
      return user ? json({ user }) : json({ error: '로그인이 필요해요.' }, 401);
    } catch {
      return json({ error: '로그인 상태를 확인하지 못했어요.' }, 503);
    }
  }
  async POST(request: Request) {
    if (request.headers.get('Origin') !== new URL(request.url).origin)
      return json({ error: '이 사이트에서 다시 요청해주세요.' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return json({ error: 'JSON 요청이 필요해요.' }, 415);
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: '입력값을 확인해주세요.' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          return json({ error: '입력값이 너무 길어요.' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: '입력값을 확인해주세요.' }, 400);
      }
      if (!isRecord(body))
        return json({ error: '입력값을 확인해주세요.' }, 400);
      const legacyOperation: Record<string, string> = {
        signup: 'register',
        login: 'login',
        logout: 'logout',
        password: 'password',
      };
      body.operation ??=
        legacyOperation[new URL(request.url).pathname.split('/').at(-1) ?? ''];
      body.identifier ??= body.email;
      body.remember ??= body.autoLogin;
      body.confirmPassword ??= body.passwordConfirmation;
      if (body.operation === 'password') {
        const user = await this.member(request);
        if (!user) return json({ error: '로그인이 필요해요.' }, 401);
        if (!(await this.throttle(request, user.email, false)))
          return json(
            { error: '요청이 많아요. 15분 후 다시 시도해주세요.' },
            429,
          );
        const next = body.newPassword,
          current = body.currentPassword;
        if (
          typeof next !== 'string' ||
          next.length < 12 ||
          encoder.encode(next).length > 72 ||
          /^(.)\1+$/.test(next) ||
          typeof current !== 'string' ||
          encoder.encode(current).length > 72
        )
          return json(
            { error: '새 비밀번호는 12자 이상, UTF-8 72바이트 이하여야 해요.' },
            400,
          );
        if (body.confirmPassword !== undefined && body.confirmPassword !== next)
          return json({ error: '새 비밀번호 확인이 일치하지 않아요.' }, 400);
        const row = await this.db
          .prepare('SELECT password_hash FROM users WHERE id=?')
          .bind(user.id)
          .first<{ password_hash: string }>();
        if (!row || !(await compare(current, row.password_hash)))
          return json({ error: '현재 비밀번호를 확인해주세요.' }, 401);
        const result = await this.db
          .prepare(
            'UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?',
          )
          .bind(
            await hash(next, 12),
            new Date(this.now()).toISOString(),
            user.id,
            row.password_hash,
          )
          .run();
        if (result.meta.changes !== 1)
          return json(
            { error: '계정이 변경됐어요. 다시 로그인해주세요.' },
            409,
          );
        await this.db
          .prepare('DELETE FROM sessions WHERE user_id=?')
          .bind(user.id)
          .run();
        return json({ ok: true }, 200, cookie(request, '', 0));
      }
      if (body.operation === 'logout') {
        const token = memberToken(request);
        if (token)
          await this.db
            .prepare('DELETE FROM sessions WHERE token_hash=?')
            .bind(await tokenHash(token))
            .run();
        return json({ ok: true }, 200, cookie(request, '', 0));
      }
      if (!['register', 'login'].includes(String(body.operation)))
        return json({ error: '지원하지 않는 요청이에요.' }, 400);
      const register = body.operation === 'register';
      const identifier =
        typeof body.identifier === 'string'
          ? body.identifier.trim().toLowerCase()
          : '';
      const normalized = identifier.includes('@')
        ? identifier
        : phone(identifier);
      if (!(await this.throttle(request, normalized, register)))
        return json(
          { error: '요청이 많아요. 15분 후 다시 시도해주세요.' },
          429,
        );
      if (
        typeof body.password !== 'string' ||
        body.password.length < (register ? 12 : 1) ||
        encoder.encode(body.password).length > 72
      )
        return json(
          {
            error: register
              ? '비밀번호는 12자 이상, UTF-8 72바이트 이하여야 해요.'
              : generic,
          },
          400,
        );
      let user: Member;
      if (register) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const email =
          typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const mobile = typeof body.phone === 'string' ? phone(body.phone) : '';
        if (
          !name ||
          name.length > 60 ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !/^01[016789]\d{7,8}$/.test(mobile) ||
          body.password !== body.confirmPassword ||
          !/[^\s]/.test(body.password) ||
          /^(.)\1+$/.test(body.password)
        )
          return json(
            {
              error: '이름·이메일·휴대전화번호와 비밀번호 확인을 점검해주세요.',
            },
            400,
          );
        const passwordHash = await hash(body.password, 12);
        user = { id: crypto.randomUUID(), name, email, phone: mobile };
        const result = await this.db
          .prepare(
            'INSERT OR IGNORE INTO users(id,name,email,phone,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(
            user.id,
            name,
            email,
            mobile,
            passwordHash,
            new Date(this.now()).toISOString(),
            new Date(this.now()).toISOString(),
          )
          .run();
        if (result.meta.changes !== 1)
          return json(
            {
              error:
                '가입할 수 없는 정보예요. 기존 계정으로 로그인하거나 입력값을 확인해주세요.',
            },
            409,
          );
      } else {
        const found = await this.db
          .prepare(
            'SELECT id,name,email,phone,password_hash FROM users WHERE email=? OR phone=?',
          )
          .bind(normalized, normalized)
          .first<Member & { password_hash: string }>();
        // Same bcrypt cost for unknown accounts; no account-specific error response.
        const valid = await compare(
          body.password,
          found?.password_hash ??
            '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
        );
        if (!found || !valid) return json({ error: generic }, 401);
        user = {
          id: found.id,
          name: found.name,
          email: found.email,
          phone: found.phone,
        };
      }
      const persistent = body.remember === true,
        ttl = persistent ? 30 * 86400 : 12 * 3600,
        token = random();
      await this.db
        .prepare('DELETE FROM sessions WHERE expires_at<?')
        .bind(new Date(this.now()).toISOString())
        .run();
      await this.db
        .prepare(
          'INSERT INTO sessions(id,user_id,token_hash,expires_at,persistent,created_at,last_used_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          await tokenHash(token),
          new Date(this.now() + ttl * 1000).toISOString(),
          persistent ? 1 : 0,
          new Date(this.now()).toISOString(),
          new Date(this.now()).toISOString(),
        )
        .run();
      return json(
        { user },
        register ? 201 : 200,
        cookie(request, token, persistent ? ttl : undefined),
      );
    } catch {
      return json(
        { error: '계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.' },
        503,
      );
    }
  }
}
