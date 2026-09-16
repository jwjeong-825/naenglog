import { env } from 'cloudflare:workers';
import { AuthStore } from '../../../src/server/auth';
const store = () => new AuthStore((env as unknown as { DB: D1Database }).DB);
export const GET = (request: Request) => store().GET(request);
export const POST = (request: Request) => store().POST(request);
