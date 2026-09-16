import type { Database } from './repository';
export const authCookie = 'naenglog_auth';
export type AuthUser = { id: string; name: string; email: string; phone: string };
export async function sha256(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join(''); }
export function readAuthToken(request: Request) { const value = request.headers.get('Cookie')?.split(';').map((x) => x.trim()).find((x) => x.startsWith(authCookie + '='))?.slice(authCookie.length + 1); return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null; }
export async function requireUser(request: Request, db: Database): Promise<AuthUser | null> { const token = readAuthToken(request); if (!token) return null; const user = await db.prepare(`SELECT u.id, u.name, u.email, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first<AuthUser>(); return user ?? null; }
