import { db, json } from '../../../../src/server/auth-response';
import { requireUser } from '../../../../src/server/auth';
export async function GET(request: Request) { const user = await requireUser(request, db()); return user ? json({ user }) : json({ error: '로그인이 필요해요.' }, 401); }
