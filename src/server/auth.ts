import bcrypt from 'bcryptjs';
import type { Database } from './repository';
export { authCookie, readAuthToken, requireUser, sha256, type AuthUser } from './auth-session';
import { authCookie, sha256 } from './auth-session';

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizePhone = (value: string) => value.replace(/\D/g, '');
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
export const validPhone = (value: string) => /^01[016789]\d{7,8}$/.test(normalizePhone(value));
export const validPassword = (value: string) => value.length >= 10 && value.length <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z\d]/.test(value);

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function createSession(db: Database, userId: string, remember: boolean, secure: boolean) {
  const raw = token();
  const now = new Date();
  const days = remember ? 30 : 1;
  const expires = new Date(now.getTime() + days * 86400000);
  await db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, await sha256(raw), expires.toISOString(), now.toISOString(), now.toISOString()).run();
  return `${authCookie}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure ? '; Secure' : ''}`;
}
export const clearSessionCookie = (secure: boolean) => `${authCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
export async function hashPassword(password: string) { return bcrypt.hash(password, 10); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }

export function clientKey(request: Request, email: string) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return `${ip}|${normalizeEmail(email)}`;
}
export async function loginBlocked(db: Database, key: string) {
  const row = await db.prepare('SELECT blocked_until FROM login_attempts WHERE key_hash = ?').bind(await sha256(key)).first<{ blocked_until: string | null }>();
  return !!row?.blocked_until && row.blocked_until > new Date().toISOString();
}
export async function recordLoginFailure(db: Database, key: string) {
  const hash = await sha256(key), now = new Date(), row = await db.prepare('SELECT failures FROM login_attempts WHERE key_hash = ?').bind(hash).first<{ failures: number }>();
  const failures = (row?.failures ?? 0) + 1;
  const blocked = failures >= 5 ? new Date(now.getTime() + 15 * 60000).toISOString() : null;
  await db.prepare(`INSERT INTO login_attempts (key_hash, failures, blocked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at`).bind(hash, failures, blocked, now.toISOString()).run();
}
export async function clearLoginFailures(db: Database, key: string) { await db.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(await sha256(key)).run(); }
