import { env } from 'cloudflare:workers';
import type { Database } from './repository';
export const db = () => (env as unknown as { DB: Database }).DB;
export const json = (body: unknown, status = 200, cookie?: string) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
export const sameOrigin = (request: Request) => request.headers.get('Origin') === new URL(request.url).origin;
