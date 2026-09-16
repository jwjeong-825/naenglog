import { AuthStore, tokenHash, memberToken, type Member } from './auth';
import type { Database } from './repository';
export const authCookie='naenglog_auth';
export type AuthUser=Member;
export const sha256=tokenHash;
export const readAuthToken=memberToken;
export const requireUser=(request:Request,db:Database)=>new AuthStore(db).member(request);
