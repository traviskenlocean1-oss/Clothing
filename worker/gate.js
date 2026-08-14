// worker/gate.js
import { signSession, verifySession } from './crypto.js';

const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days, in seconds

export function getCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export async function isAuthenticated(request, env) {
  const cookie = getCookie(request, 'vip_session');
  if (!cookie) return { authenticated: false };
  const payload = await verifySession(cookie, env.SESSION_SECRET);
  if (!payload) return { authenticated: false };
  return { authenticated: true, phone: payload.phone, role: payload.role };
}

const SESSION_ONLY_MAX_AGE = 60 * 60 * 24; // 24h internal cap for a non-persistent cookie

export async function sessionCookieHeader(payload, env, remember = true) {
  const exp = Date.now() + (remember ? SESSION_MAX_AGE : SESSION_ONLY_MAX_AGE) * 1000;
  const value = await signSession({ ...payload, exp }, env.SESSION_SECRET);
  // Omitting Max-Age when `remember` is false makes it a true session cookie
  // (dies when the browser closes) rather than a persistent one — the signed
  // payload's own 24h exp is a safety cap in case the browser restores tabs.
  const persistence = remember ? ` Max-Age=${SESSION_MAX_AGE};` : '';
  return `vip_session=${value}; HttpOnly; Secure; SameSite=Lax;${persistence} Path=/`;
}
