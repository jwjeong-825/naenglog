import { db, json, sameOrigin } from '../../../../src/server/auth-response';
import { clearSessionCookie, readAuthToken, sha256 } from '../../../../src/server/auth';
export async function POST(request: Request) { if (!sameOrigin(request)) return json({ error: '이 사이트에서 다시 요청해주세요.' }, 403); const raw = readAuthToken(request); if (raw) await db().prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(raw)).run(); return json({ ok: true }, 200, clearSessionCookie(new URL(request.url).protocol === 'https:')); }
