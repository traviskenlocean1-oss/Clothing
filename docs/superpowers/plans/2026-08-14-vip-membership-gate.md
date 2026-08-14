# VIP Membership Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, server-enforced login/signup gate to the VIP page — phone-verified signup, username/password + ticket-code login with a recovery chain, and an instant admin bypass for the site's developer and Branden (brand owner) — with the exclusive VIP content genuinely absent from the page until a visitor is authenticated.

**Architecture:** A new Cloudflare Worker script (`worker/index.js`) sits in front of the site's existing static assets. It intercepts `GET /vip` and `/vip.html` to decide which of two files to serve (the real `vip.html` for a valid session, a new `vip-locked.html` gate shell otherwise) and handles seven new `POST /api/vip/*` endpoints. Member records live in a new Cloudflare KV namespace. Sessions are signed HMAC cookies, 60-day expiry. Everything else on the site (every other page, every other route) falls through to the existing static-asset behavior completely unchanged.

**Tech Stack:** Cloudflare Workers (`nodejs_compat` already enabled), Cloudflare KV, Web Crypto API (`crypto.subtle` — PBKDF2 password hashing, HMAC session signing), vanilla JS on the frontend (no framework, matching the rest of the site), `vitest` for the pure-function unit tests, `wrangler dev` + `curl` for endpoint integration tests, Playwright for the UI walkthrough.

**Spec:** `docs/superpowers/specs/2026-08-14-vip-membership-gate-design.md`

## Global Constraints

- No admin dashboard/UI — out of scope per spec's Non-goals.
- No changes to the hero's existing scroll-scrub JS/canvas engine in `vip.html` — confirmed to keep exactly as built.
- Real phone numbers (developer's and Branden's) are never written to any file in this repo, ever — only entered directly into `wrangler secret put` at deploy time (Task 11) and into the developer's own local, gitignored `.dev.vars`.
- Password is stored (PBKDF2-hashed, never plaintext) and used for real return-login — it is not decorative.
- Session cookie: `HttpOnly; Secure; SameSite=Lax`, 60-day (`60*60*24*60` second) expiry, HMAC-signed with a `SESSION_SECRET` Worker secret.
- Twilio isn't set up yet — every OTP-sending code path must fall back to auto-verifying immediately when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` are absent, so the full flow is testable today.
- This site has no existing test framework or `package.json` — Task 1 introduces the minimal amount of both.

---

## Task 1: Project scaffolding — package.json, Worker entry point, wrangler config

**Files:**
- Create: `package.json`
- Create: `worker/index.js`
- Modify: `wrangler.jsonc`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a Worker `fetch(request, env, ctx)` handler in `worker/index.js` that, for now, does nothing but delegate every request to `env.ASSETS.fetch(request)` — later tasks add real routing inside this same file.

- [ ] **Step 1: Create `package.json` at the repo root**

```json
{
  "name": "psychotic-love-clothing",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^4.123.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, no errors.

- [ ] **Step 3: Create the pass-through Worker entry point**

```js
// worker/index.js
export default {
  async fetch(request, env, ctx) {
    return env.ASSETS.fetch(request);
  }
};
```

- [ ] **Step 4: Add the Worker entry + assets binding to `wrangler.jsonc`**

Replace the file's contents with:

```jsonc
{
  "name": "psychotic-love",
  "compatibility_date": "2026-08-05",
  "observability": { "enabled": true },
  "main": "worker/index.js",
  "assets": { "directory": ".", "binding": "ASSETS" },
  "compatibility_flags": ["nodejs_compat"]
}
```

(This adds `"main"` and the `"binding": "ASSETS"` key to the existing `assets` block — everything else is unchanged from what's there today.)

- [ ] **Step 5: Add `.dev.vars` to `.gitignore`**

Append to `.gitignore`:

```
.dev.vars
```

- [ ] **Step 6: Verify the site behaves identically to before**

Run: `npx wrangler dev --port 8787` (leave running in the background)
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/` and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/vip`
Expected: both return `200` (or the existing `307`/redirect behavior for `/vip.html` → `/vip` if that's what the site already does), and the homepage HTML in a plain `curl http://localhost:8787/` still contains `PSYCHOTIC` — confirming the new Worker script didn't break static serving.
Stop the dev server after confirming.

- [ ] **Step 7: Commit**

```bash
git add package.json wrangler.jsonc worker/index.js .gitignore
git commit -m "Add Worker entry point and package.json scaffolding for the VIP gate"
```

---

## Task 2: Crypto helpers with unit tests

**Files:**
- Create: `worker/crypto.js`
- Test: `worker/crypto.test.js`
- Create: `vitest.config.js`

**Interfaces:**
- Consumes: nothing (pure functions, only the global Web Crypto API).
- Produces (used by later tasks):
  - `async function hashPassword(password: string): Promise<string>`
  - `async function verifyPassword(password: string, storedHash: string): Promise<boolean>`
  - `function generateOtp(): string` — 6-digit numeric string
  - `function generateTicket(): string` — `"PL-XXXXXX"`
  - `function normalizePhone(raw: string): string | null` — E.164 or `null`
  - `async function signSession(payload: object, secret: string): Promise<string>`
  - `async function verifySession(cookieValue: string, secret: string): Promise<object | null>`

- [ ] **Step 1: Add a minimal vitest config**

```js
// vitest.config.js
export default {
  test: {
    include: ['worker/**/*.test.js']
  }
};
```

- [ ] **Step 2: Write the failing tests**

```js
// worker/crypto.test.js
import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, generateOtp, generateTicket,
  normalizePhone, signSession, verifySession
} from './crypto.js';

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('never stores the password in plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toContain('correct-horse-battery-staple');
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('generateOtp', () => {
  it('returns a 6-digit numeric string', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('generateTicket', () => {
  it('returns a PL-prefixed 6-character code', () => {
    const ticket = generateTicket();
    expect(ticket).toMatch(/^PL-[A-Z0-9]{6}$/);
  });

  it('excludes ambiguous characters 0/O/1/I', () => {
    for (let i = 0; i < 20; i++) {
      const ticket = generateTicket();
      expect(ticket).not.toMatch(/[0O1I]/);
    }
  });
});

describe('normalizePhone', () => {
  it('normalizes a plain 10-digit number', () => {
    expect(normalizePhone('5615550123')).toBe('+15615550123');
  });

  it('normalizes a formatted number', () => {
    expect(normalizePhone('(561) 555-0123')).toBe('+15615550123');
  });

  it('normalizes an 11-digit number with leading 1', () => {
    expect(normalizePhone('15615550123')).toBe('+15615550123');
  });

  it('returns null for an invalid number', () => {
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('signSession / verifySession', () => {
  it('round-trips a payload', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    const payload = await verifySession(cookie, 'test-secret');
    expect(payload.phone).toBe('+15615550123');
    expect(payload.role).toBe('member');
  });

  it('rejects a tampered cookie', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a');
    expect(await verifySession(tampered, 'test-secret')).toBeNull();
  });

  it('rejects a cookie signed with the wrong secret', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() + 10000 }, 'test-secret');
    expect(await verifySession(cookie, 'wrong-secret')).toBeNull();
  });

  it('rejects an expired session', async () => {
    const cookie = await signSession({ phone: '+15615550123', role: 'member', exp: Date.now() - 1000 }, 'test-secret');
    expect(await verifySession(cookie, 'test-secret')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run`
Expected: FAIL — `worker/crypto.js` does not exist yet.

- [ ] **Step 4: Implement `worker/crypto.js`**

```js
// worker/crypto.js
const PBKDF2_ITERATIONS = 100000;

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password, storedHash) {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return timingSafeEqual(toHex(bits), expectedHex);
}

export function generateOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

export function generateTicket() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return `PL-${code}`;
}

export function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toHex(sig);
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

export async function signSession(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const sig = await hmac(secret, encoded);
  return `${encoded}.${sig}`;
}

export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const [encoded, sig] = cookieValue.split('.');
  const expectedSig = await hmac(secret, encoded);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encoded));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all tests in `worker/crypto.test.js` green.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js worker/crypto.js worker/crypto.test.js
git commit -m "Add crypto helpers (password hashing, OTP/ticket generation, session signing)"
```

---

## Task 3: KV storage, session cookie helper, and admin allowlist

**Files:**
- Create: `worker/store.js`
- Create: `worker/gate.js`
- Create: `worker/admin.js`
- Create: `.dev.vars` (gitignored — local secrets for `wrangler dev`)
- Create: `.dev.vars.example` (committed — documents the shape, no real values)
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`/`signSession`/`verifySession` from `worker/crypto.js` (Task 2).
- Produces (used by Task 4 onward):
  - `async function getMemberByPhone(env, phone): Promise<object|null>`
  - `async function getMemberByUsername(env, username): Promise<object|null>`
  - `async function getMemberByTicket(env, ticket): Promise<object|null>`
  - `async function isUsernameTaken(env, username): Promise<boolean>`
  - `async function saveMember(env, member): Promise<void>`
  - `async function isAuthenticated(request, env): Promise<{authenticated: boolean, phone?: string, role?: string}>`
  - `async function sessionCookieHeader(payload, env): Promise<string>`
  - `function findAdminRole(env, phone): string|null`

- [ ] **Step 1: Create the local KV namespace for development**

Run: `npx wrangler kv namespace create VIP_MEMBERS --preview`
Expected: prints a namespace `id` and `preview_id` — copy both.

- [ ] **Step 2: Add the KV binding to `wrangler.jsonc`**

Add a `kv_namespaces` array (paste in the real `id`/`preview_id` from Step 1):

```jsonc
{
  "name": "psychotic-love",
  "compatibility_date": "2026-08-05",
  "observability": { "enabled": true },
  "main": "worker/index.js",
  "assets": { "directory": ".", "binding": "ASSETS" },
  "compatibility_flags": ["nodejs_compat"],
  "kv_namespaces": [
    { "binding": "VIP_MEMBERS", "id": "<id from Step 1>", "preview_id": "<preview_id from Step 1>" }
  ]
}
```

- [ ] **Step 3: Implement `worker/store.js`**

```js
// worker/store.js
export async function getMemberByPhone(env, phone) {
  const raw = await env.VIP_MEMBERS.get(`phone:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

export async function getMemberByUsername(env, username) {
  const phone = await env.VIP_MEMBERS.get(`username:${username.toLowerCase()}`);
  if (!phone) return null;
  return getMemberByPhone(env, phone);
}

export async function getMemberByTicket(env, ticket) {
  const phone = await env.VIP_MEMBERS.get(`ticket:${ticket}`);
  if (!phone) return null;
  return getMemberByPhone(env, phone);
}

export async function isUsernameTaken(env, username) {
  const phone = await env.VIP_MEMBERS.get(`username:${username.toLowerCase()}`);
  return phone !== null;
}

export async function saveMember(env, member) {
  await env.VIP_MEMBERS.put(`phone:${member.phone}`, JSON.stringify(member));
  await env.VIP_MEMBERS.put(`username:${member.username.toLowerCase()}`, member.phone);
  if (member.ticket) {
    await env.VIP_MEMBERS.put(`ticket:${member.ticket}`, member.phone);
  }
}
```

- [ ] **Step 4: Implement `worker/gate.js`**

```js
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
```

- [ ] **Step 5: Implement `worker/admin.js`**

```js
// worker/admin.js
export function findAdminRole(env, phone) {
  if (!env.ADMIN_PHONES) return null;
  let list;
  try {
    list = JSON.parse(env.ADMIN_PHONES);
  } catch {
    return null;
  }
  const match = list.find(([p]) => p === phone);
  return match ? match[1] : null;
}
```

- [ ] **Step 6: Create local dev secrets**

Create `.dev.vars.example` (committed):

```
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_PHONES=[["+15555550100","developer"],["+15555550199","owner"]]
```

Create `.dev.vars` (gitignored — copy the example, values below are safe fake test numbers for local development only, never real numbers):

```
SESSION_SECRET=local-dev-only-not-a-real-secret-value-123456
ADMIN_PHONES=[["+15555550100","developer"],["+15555550199","owner"]]
```

- [ ] **Step 7: Verify the dev server boots with the new binding**

Run: `npx wrangler dev --port 8787` (background)
Expected: startup log shows `Your Worker has access to the following bindings:` including `env.VIP_MEMBERS (VIP_MEMBERS)` and no binding-related errors. Stop the server after confirming.

- [ ] **Step 8: Commit**

```bash
git add worker/store.js worker/gate.js worker/admin.js .dev.vars.example wrangler.jsonc
git commit -m "Add KV storage, session cookie, and admin allowlist helpers"
```

---

## Task 4: SMS stub, admin login, signup, and OTP verification endpoints

**Files:**
- Create: `worker/sms.js`
- Create: `worker/handlers.js`
- Modify: `worker/index.js`

**Interfaces:**
- Consumes: everything from Tasks 2–3 (`crypto.js`, `store.js`, `gate.js`, `admin.js`).
- Produces (used by Tasks 5–6): `handleSignup`, `handleVerifyOtp`, `handleAdminLogin` — each `async function(request, env): Promise<Response>` — plus the shared `json(data, init)` response helper and `completeVerification(env, phone)` helper, both exported from `worker/handlers.js` for reuse.

- [ ] **Step 1: Implement `worker/sms.js`**

```js
// worker/sms.js
export async function sendOtp(env, phone, code) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    console.log(`[vip-auth] Twilio not configured — auto-verifying ${phone} with code ${code}`);
    return { sent: false, autoVerified: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({
    To: phone,
    From: env.TWILIO_FROM_NUMBER,
    Body: `Your Psychotic Love VIP code is ${code}`
  });
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    console.log(`[vip-auth] Twilio send failed for ${phone}: ${res.status}`);
    return { sent: false, autoVerified: false };
  }
  return { sent: true, autoVerified: false };
}
```

- [ ] **Step 2: Implement `worker/handlers.js` (signup, verify-otp, admin-login only — more handlers added in later tasks)**

```js
// worker/handlers.js
import { hashPassword, generateOtp, generateTicket, normalizePhone } from './crypto.js';
import { getMemberByPhone, isUsernameTaken, saveMember } from './store.js';
import { sendOtp } from './sms.js';
import { findAdminRole } from './admin.js';
import { sessionCookieHeader } from './gate.js';

const OTP_TTL_MS = 10 * 60 * 1000;

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

export async function completeVerification(env, phone) {
  const member = await getMemberByPhone(env, phone);
  member.verified = true;
  member.ticket = generateTicket();
  member.otp = null;
  member.otpExpiry = null;
  await saveMember(env, member);
  const cookie = await sessionCookieHeader({ phone, role: member.role }, env);
  return json(
    { verified: true, name: member.name, ticket: member.ticket, isNewMember: true },
    { headers: { 'Set-Cookie': cookie } }
  );
}

export async function handleSignup(request, env) {
  const body = await request.json();
  const { name, username, password, phone: rawPhone } = body;
  if (!name || !username || !password || !rawPhone) {
    return json({ error: 'Name, username, password, and phone are all required.' }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return json({ error: "That phone number doesn't look right — use a 10-digit US number." }, { status: 400 });
  }

  const adminRole = findAdminRole(env, phone);
  if (adminRole) {
    const cookie = await sessionCookieHeader({ phone, role: adminRole }, env);
    return json({ verified: true, admin: true, role: adminRole }, { headers: { 'Set-Cookie': cookie } });
  }

  if (await isUsernameTaken(env, username)) {
    return json({ error: 'That username is already taken.' }, { status: 409 });
  }

  const existing = await getMemberByPhone(env, phone);
  if (existing && existing.verified) {
    return json({ error: 'That phone number already has a VIP account. Try logging in instead.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const otp = generateOtp();
  const member = {
    name, username, passwordHash, phone,
    ticket: null, role: 'member', verified: false,
    createdAt: new Date().toISOString(),
    otp, otpExpiry: Date.now() + OTP_TTL_MS
  };
  await saveMember(env, member);

  const smsResult = await sendOtp(env, phone, otp);
  if (smsResult.autoVerified) {
    return await completeVerification(env, phone);
  }
  return json({ pending: true, phone });
}

export async function handleVerifyOtp(request, env) {
  const { phone: rawPhone, code } = await request.json();
  const phone = normalizePhone(rawPhone);
  if (!phone || !code) {
    return json({ error: 'Phone and code are required.' }, { status: 400 });
  }
  const member = await getMemberByPhone(env, phone);
  if (!member || !member.otp) {
    return json({ error: 'No pending verification for that number.' }, { status: 404 });
  }
  if (Date.now() > member.otpExpiry) {
    return json({ error: 'That code expired. Request a new one.' }, { status: 410 });
  }
  if (member.otp !== code) {
    return json({ error: "That code doesn't match." }, { status: 401 });
  }
  return await completeVerification(env, phone);
}

export async function handleAdminLogin(request, env) {
  const { phone: rawPhone } = await request.json();
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return json({ error: "That phone number doesn't look right." }, { status: 400 });
  }
  const role = findAdminRole(env, phone);
  if (!role) {
    return json({ error: 'Not recognized.' }, { status: 401 });
  }
  const cookie = await sessionCookieHeader({ phone, role }, env);
  return json({ verified: true, role }, { headers: { 'Set-Cookie': cookie } });
}
```

- [ ] **Step 3: Wire the routes into `worker/index.js`**

```js
// worker/index.js
import { handleSignup, handleVerifyOtp, handleAdminLogin } from './handlers.js';

const ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && ROUTES[url.pathname]) {
      try {
        return await ROUTES[url.pathname](request, env);
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
```

- [ ] **Step 4: Test signup + auto-verify end-to-end (no Twilio configured locally)**

Run: `npx wrangler dev --port 8787` (background), then:

```bash
curl -s -X POST http://localhost:8787/api/vip/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","username":"testuser1","password":"testpass123","phone":"5615550111"}' \
  -i
```

Expected: `HTTP/1.1 200`, a `Set-Cookie: vip_session=...` header, and a JSON body like `{"verified":true,"name":"Test User","ticket":"PL-XXXXXX","isNewMember":true}`.

- [ ] **Step 5: Test the admin bypass with the local test admin number**

```bash
curl -s -X POST http://localhost:8787/api/vip/admin-login \
  -H "Content-Type: application/json" \
  -d '{"phone":"5555550100"}' -i
```

Expected: `HTTP/1.1 200`, `Set-Cookie` header present, body `{"verified":true,"role":"developer"}`.

- [ ] **Step 6: Test a rejected admin number**

```bash
curl -s -X POST http://localhost:8787/api/vip/admin-login \
  -H "Content-Type: application/json" \
  -d '{"phone":"5615559999"}' -i
```

Expected: `HTTP/1.1 401`, body `{"error":"Not recognized."}`.

Stop the dev server after confirming all three.

- [ ] **Step 7: Commit**

```bash
git add worker/sms.js worker/handlers.js worker/index.js
git commit -m "Add signup, OTP verification, and admin-login endpoints"
```

---

## Task 5: Username/password login and ticket-code login endpoints

**Files:**
- Modify: `worker/handlers.js`
- Modify: `worker/index.js`

**Interfaces:**
- Consumes: `getMemberByUsername`, `getMemberByTicket` from `worker/store.js`; `verifyPassword` from `worker/crypto.js`; `json`, `sessionCookieHeader` already available in `worker/handlers.js`.
- Produces: `handleLogin`, `handleLoginTicket` — same `async function(request, env): Promise<Response>` shape as the rest of the handlers.

- [ ] **Step 1: Add the two handlers to `worker/handlers.js`**

Add these imports to the top of the file (merge with the existing import line from `./crypto.js` and `./store.js`):

```js
import { hashPassword, verifyPassword, generateOtp, generateTicket, normalizePhone } from './crypto.js';
import { getMemberByPhone, getMemberByUsername, getMemberByTicket, isUsernameTaken, saveMember } from './store.js';
```

Append to the bottom of the file:

```js
export async function handleLogin(request, env) {
  const { username, password, rememberMe } = await request.json();
  if (!username || !password) {
    return json({ error: 'Username and password are required.' }, { status: 400 });
  }
  const member = await getMemberByUsername(env, username);
  if (!member || !member.verified) {
    return json({ error: 'Username or password is incorrect.' }, { status: 401 });
  }
  const valid = await verifyPassword(password, member.passwordHash);
  if (!valid) {
    return json({ error: 'Username or password is incorrect.' }, { status: 401 });
  }
  const cookie = await sessionCookieHeader({ phone: member.phone, role: member.role }, env, rememberMe !== false);
  return json({ verified: true, name: member.name, isNewMember: false }, { headers: { 'Set-Cookie': cookie } });
}

export async function handleLoginTicket(request, env) {
  const { ticket } = await request.json();
  if (!ticket) {
    return json({ error: 'Ticket code is required.' }, { status: 400 });
  }
  const member = await getMemberByTicket(env, ticket);
  if (!member || !member.verified) {
    return json({ error: "That ticket code doesn't match a VIP account." }, { status: 401 });
  }
  const cookie = await sessionCookieHeader({ phone: member.phone, role: member.role }, env);
  return json({ verified: true, name: member.name, isNewMember: false }, { headers: { 'Set-Cookie': cookie } });
}
```

- [ ] **Step 2: Register the two new routes in `worker/index.js`**

```js
import { handleSignup, handleVerifyOtp, handleAdminLogin, handleLogin, handleLoginTicket } from './handlers.js';

const ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin,
  '/api/vip/login': handleLogin,
  '/api/vip/login-ticket': handleLoginTicket
};
```

- [ ] **Step 3: Test username/password login**

Run: `npx wrangler dev --port 8787` (background). First sign up a fresh test user, then log in with the same credentials:

```bash
curl -s -X POST http://localhost:8787/api/vip/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Login Test","username":"logintest1","password":"testpass123","phone":"5615550122"}' -i

curl -s -X POST http://localhost:8787/api/vip/login \
  -H "Content-Type: application/json" \
  -d '{"username":"logintest1","password":"testpass123"}' -i
```

Expected: the login call returns `HTTP/1.1 200`, a fresh `Set-Cookie`, body `{"verified":true,"name":"Login Test","isNewMember":false}`.

- [ ] **Step 4: Test wrong password is rejected**

```bash
curl -s -X POST http://localhost:8787/api/vip/login \
  -H "Content-Type: application/json" \
  -d '{"username":"logintest1","password":"wrong-password"}' -i
```

Expected: `HTTP/1.1 401`.

- [ ] **Step 5: Test ticket-code login**

Note the `ticket` value returned by the signup call in Step 3, then:

```bash
curl -s -X POST http://localhost:8787/api/vip/login-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket":"<paste the ticket code here>"}' -i
```

Expected: `HTTP/1.1 200`, `Set-Cookie` present, body includes `"verified":true`.

Stop the dev server after confirming.

- [ ] **Step 6: Commit**

```bash
git add worker/handlers.js worker/index.js
git commit -m "Add username/password and ticket-code login endpoints"
```

---

## Task 6: Ticket-recovery endpoints

**Files:**
- Modify: `worker/handlers.js`
- Modify: `worker/index.js`

**Interfaces:**
- Consumes: `getMemberByPhone`, `saveMember` from `worker/store.js`; `generateOtp`, `normalizePhone` from `worker/crypto.js`; `sendOtp` from `worker/sms.js`.
- Produces: `handleRecover`, `handleRecoverVerify`.

- [ ] **Step 1: Add a shared `completeRecovery` helper and the two handlers to `worker/handlers.js`**

Append to the bottom of the file:

```js
async function completeRecovery(env, phone) {
  const member = await getMemberByPhone(env, phone);
  member.otp = null;
  member.otpExpiry = null;
  await saveMember(env, member);
  const cookie = await sessionCookieHeader({ phone: member.phone, role: member.role }, env);
  return json(
    { verified: true, name: member.name, ticket: member.ticket, isNewMember: false },
    { headers: { 'Set-Cookie': cookie } }
  );
}

export async function handleRecover(request, env) {
  const { phone: rawPhone } = await request.json();
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return json({ error: "That phone number doesn't look right." }, { status: 400 });
  }
  const member = await getMemberByPhone(env, phone);
  if (!member || !member.verified) {
    return json({ error: 'No VIP account found for that number.' }, { status: 404 });
  }
  const otp = generateOtp();
  member.otp = otp;
  member.otpExpiry = Date.now() + OTP_TTL_MS;
  await saveMember(env, member);
  const smsResult = await sendOtp(env, phone, otp);
  if (smsResult.autoVerified) {
    return await completeRecovery(env, phone);
  }
  return json({ pending: true, phone });
}

export async function handleRecoverVerify(request, env) {
  const { phone: rawPhone, code } = await request.json();
  const phone = normalizePhone(rawPhone);
  if (!phone || !code) {
    return json({ error: 'Phone and code are required.' }, { status: 400 });
  }
  const member = await getMemberByPhone(env, phone);
  if (!member || !member.otp) {
    return json({ error: 'No pending recovery for that number.' }, { status: 404 });
  }
  if (Date.now() > member.otpExpiry) {
    return json({ error: 'That code expired. Request a new one.' }, { status: 410 });
  }
  if (member.otp !== code) {
    return json({ error: "That code doesn't match." }, { status: 401 });
  }
  return await completeRecovery(env, phone);
}
```

- [ ] **Step 2: Register the two new routes in `worker/index.js`**

```js
import {
  handleSignup, handleVerifyOtp, handleAdminLogin,
  handleLogin, handleLoginTicket, handleRecover, handleRecoverVerify
} from './handlers.js';

const ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin,
  '/api/vip/login': handleLogin,
  '/api/vip/login-ticket': handleLoginTicket,
  '/api/vip/recover': handleRecover,
  '/api/vip/recover-verify': handleRecoverVerify
};
```

- [ ] **Step 3: Test recovery returns the existing ticket without creating a duplicate**

Run: `npx wrangler dev --port 8787` (background). Sign up a fresh user, note their ticket, then recover by phone:

```bash
curl -s -X POST http://localhost:8787/api/vip/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Recover Test","username":"recovertest1","password":"testpass123","phone":"5615550133"}' -i

curl -s -X POST http://localhost:8787/api/vip/recover \
  -H "Content-Type: application/json" \
  -d '{"phone":"5615550133"}' -i
```

Expected: the recover call returns `HTTP/1.1 200`, body `{"verified":true,"name":"Recover Test","ticket":"<same ticket as signup>","isNewMember":false}` — the **same** ticket value from the signup response, confirming no duplicate account was created.

- [ ] **Step 4: Test recovery for an unknown number is rejected**

```bash
curl -s -X POST http://localhost:8787/api/vip/recover \
  -H "Content-Type: application/json" \
  -d '{"phone":"5619998888"}' -i
```

Expected: `HTTP/1.1 404`.

Stop the dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add worker/handlers.js worker/index.js
git commit -m "Add ticket-recovery endpoints"
```

---

## Task 7: Gate enforcement for /vip

**Files:**
- Modify: `worker/index.js`
- Create: `vip-locked.html` (minimal placeholder — full build-out is Task 8)

**Interfaces:**
- Consumes: `isAuthenticated` from `worker/gate.js`.
- Produces: `GET /vip` and `GET /vip.html` now resolve to one of two different files depending on session validity — this is the behavior Task 8's real `vip-locked.html` content will render.

- [ ] **Step 1: Create a minimal placeholder `vip-locked.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>VIP Access | Psychotic Love</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="vip-page">
<p style="color:#fff;text-align:center;margin-top:4rem;">VIP ACCESS LOCKED — placeholder, built out in Task 8.</p>
</body>
</html>
```

- [ ] **Step 2: Add gate enforcement to `worker/index.js`**

```js
import { isAuthenticated } from './gate.js';
import {
  handleSignup, handleVerifyOtp, handleAdminLogin,
  handleLogin, handleLoginTicket, handleRecover, handleRecoverVerify
} from './handlers.js';

const ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin,
  '/api/vip/login': handleLogin,
  '/api/vip/login-ticket': handleLoginTicket,
  '/api/vip/recover': handleRecover,
  '/api/vip/recover-verify': handleRecoverVerify
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && ROUTES[url.pathname]) {
      try {
        return await ROUTES[url.pathname](request, env);
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/vip' || url.pathname === '/vip.html') {
      const auth = await isAuthenticated(request, env);
      const target = auth.authenticated ? '/vip.html' : '/vip-locked.html';
      return env.ASSETS.fetch(new Request(new URL(target, url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
```

- [ ] **Step 3: Test the gate with and without a session**

Run: `npx wrangler dev --port 8787` (background).

```bash
curl -s http://localhost:8787/vip | grep -o "VIP ACCESS LOCKED"
```

Expected: prints `VIP ACCESS LOCKED` (no cookie sent → locked page served).

```bash
COOKIE=$(curl -s -X POST http://localhost:8787/api/vip/admin-login \
  -H "Content-Type: application/json" -d '{"phone":"5555550100"}' -D - -o /dev/null \
  | grep -i '^set-cookie' | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
curl -s -H "Cookie: $COOKIE" http://localhost:8787/vip | grep -o "New<br>Releases"
```

Expected: prints `New<br>Releases` (or similar real-content marker from `vip.html`) — a valid admin session now sees the full page.

Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add worker/index.js vip-locked.html
git commit -m "Enforce the VIP gate: serve vip-locked.html without a valid session"
```

---

## Task 8: Build the real `vip-locked.html` — blurred hero + auth modal markup

**Files:**
- Modify: `vip-locked.html`

**Interfaces:**
- Consumes: none (static markup only — no JS behavior in this task, that's Task 10).
- Produces: the DOM structure and `data-state`/`data-show` attributes that Task 9's CSS and Task 10's `vip-auth.js` both depend on.

- [ ] **Step 1: Replace `vip-locked.html` with the full gate shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIP Access | Psychotic Love</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Alex+Brush&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body class="vip-page">

<nav class="nav">
  <a href="index.html" class="nav__logo">PSYCHOTIC <span class="script" data-text="Love">Love</span></a>
  <ul class="nav__links">
    <li><a href="index.html">Home</a></li>
    <li><a href="shop.html">Shop</a></li>
    <li><a href="about.html">About</a></li>
    <li><a href="vip.html">VIP</a></li>
  </ul>
  <div class="nav__right">
    <button class="nav__burger" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</nav>

<div class="vip-locked-hero">
  <img class="gate-blur" src="assets/img/vip-hero-frames/frame-001.jpg" alt="">
</div>

<div class="vip-auth" id="vip-auth" aria-live="polite">
  <div class="vip-auth__panel">
    <div class="vip-auth__brand">Psychotic Love</div>
    <h1 class="vip-auth__title display">VIP Access</h1>

    <div class="vip-auth__state is-active" data-state="choice">
      <button type="button" class="btn btn-solid vip-auth__choice" data-show="signup"><span>Sign Up</span></button>
      <button type="button" class="btn vip-auth__choice" data-show="login"><span>Log In</span></button>
      <button type="button" class="vip-auth__admin-toggle" data-show="admin">Admin?</button>
    </div>

    <form class="vip-auth__state" data-state="signup">
      <label>Name<input type="text" name="name" required></label>
      <label>Username<input type="text" name="username" required></label>
      <label>Password<input type="password" name="password" required minlength="6"></label>
      <label>Phone Number<input type="tel" name="phone" required placeholder="(555) 555-0100"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Continue</span></button>
      <button type="button" class="vip-auth__back" data-show="choice">Back</button>
    </form>

    <form class="vip-auth__state" data-state="otp">
      <p class="vip-auth__hint">Enter the 6-digit code we texted you.</p>
      <label>Code<input type="text" name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Verify</span></button>
    </form>

    <form class="vip-auth__state" data-state="login">
      <label>Username<input type="text" name="username" required></label>
      <label>Password<input type="password" name="password" required></label>
      <label class="vip-auth__remember"><input type="checkbox" name="rememberMe" checked> Remember me</label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Log In</span></button>
      <button type="button" class="vip-auth__link" data-show="ticket">Forgot password?</button>
      <button type="button" class="vip-auth__back" data-show="choice">Back</button>
    </form>

    <form class="vip-auth__state" data-state="ticket">
      <p class="vip-auth__hint">Enter your VIP ticket code.</p>
      <label>Ticket Code<input type="text" name="ticket" required placeholder="PL-XXXXXX"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Log In</span></button>
      <button type="button" class="vip-auth__link" data-show="recover-phone">Forgot ticket too?</button>
      <button type="button" class="vip-auth__back" data-show="login">Back</button>
    </form>

    <form class="vip-auth__state" data-state="recover-phone">
      <p class="vip-auth__hint">Enter the phone number on your account — we'll text you a new code.</p>
      <label>Phone Number<input type="tel" name="phone" required placeholder="(555) 555-0100"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Send Code</span></button>
      <button type="button" class="vip-auth__back" data-show="ticket">Back</button>
    </form>

    <form class="vip-auth__state" data-state="recover-otp">
      <p class="vip-auth__hint">Enter the 6-digit code we texted you.</p>
      <label>Code<input type="text" name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Verify</span></button>
    </form>

    <form class="vip-auth__state" data-state="admin">
      <p class="vip-auth__hint vip-auth__hint--admin">Admin Only</p>
      <label>Phone Number<input type="tel" name="phone" required placeholder="(555) 555-0100"></label>
      <p class="vip-auth__error" role="alert"></p>
      <button type="submit" class="btn btn-solid"><span>Enter</span></button>
      <button type="button" class="vip-auth__back" data-show="choice">Back</button>
    </form>

    <div class="vip-auth__state" data-state="welcome">
      <img class="vip-auth__welcome-heart" src="assets/img/hearts/heart-white.png" alt="">
      <p class="vip-auth__welcome-msg"></p>
      <div class="vip-auth__ticket-display" hidden>
        <span class="vip-auth__ticket-label">Your Ticket</span>
        <span class="vip-auth__ticket-code"></span>
        <span class="vip-auth__ticket-note">Keep this somewhere safe — you'll need it if you ever lose access.</span>
      </div>
      <button type="button" class="btn btn-solid vip-auth__enter"><span>Enter VIP</span></button>
    </div>
  </div>
</div>

<script src="assets/js/vip-auth.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify it renders without console errors**

Run: `npx wrangler dev --port 8787` (background). Navigate a Playwright browser to `http://localhost:8787/vip-locked.html`, check console messages.
Expected: page loads; the only error is `Failed to load resource ... vip-auth.js` (404) — expected, since that file doesn't exist until Task 10. No other errors.
Stop the dev server after confirming.

- [ ] **Step 3: Commit**

```bash
git add vip-locked.html
git commit -m "Build the real vip-locked.html gate shell with the full auth modal markup"
```

---

## Task 9: Modal and blur CSS

**Files:**
- Modify: `assets/css/style.css`

**Interfaces:**
- Consumes: existing site tokens (`--white`, `--black`, `--gray`, `--pink`, `--font-display`, `--gutter`, `--ease`) already defined at `:root` in this file.
- Produces: `.gate-blur`, `.vip-locked-hero`, `.vip-auth*` classes that Task 8's markup and Task 10's JS both rely on for visibility/state toggling (`.vip-auth__state.is-active`).

- [ ] **Step 1: Append the gate + modal styles to `assets/css/style.css`**

```css
/* ---------- VIP auth gate ---------- */
.vip-locked-hero{ position:relative; height:100vh; overflow:hidden; background:#050505; }
.vip-locked-hero img{ width:100%; height:100%; object-fit:cover; display:block; }
.gate-blur{ filter:blur(32px) brightness(.55); transform:scale(1.06); }

.vip-auth{
  position:fixed; inset:0; z-index:50;
  display:flex; align-items:center; justify-content:center;
  padding:2rem var(--gutter);
  background:rgba(5,5,5,.35);
}
.vip-auth__panel{
  position:relative; width:100%; max-width:420px;
  background:#0c0c0c; border:1px solid rgba(255,255,255,.12);
  border-radius:14px; padding:2.2rem 2rem;
  box-shadow:0 30px 60px -20px rgba(0,0,0,.7);
}
.vip-auth__brand{ font-size:.7rem; letter-spacing:.18em; text-transform:uppercase; color:var(--gray); text-align:center; }
.vip-auth__title{
  font-size:1.9rem; text-align:center; color:var(--white);
  margin:.3rem 0 1.6rem;
}
.vip-auth__state{ display:none; flex-direction:column; gap:.9rem; }
.vip-auth__state.is-active{ display:flex; }
.vip-auth__state label{ display:flex; flex-direction:column; gap:.4rem; font-size:.82rem; color:var(--gray); }
.vip-auth__state input[type="text"],
.vip-auth__state input[type="password"],
.vip-auth__state input[type="tel"]{
  background:#151515; border:1px solid rgba(255,255,255,.14); border-radius:8px;
  color:var(--white); padding:.7rem .9rem; font-size:.95rem; font-family:var(--font-body);
}
.vip-auth__state input:focus-visible{ outline:2px solid var(--pink); outline-offset:1px; }
.vip-auth__remember{ flex-direction:row !important; align-items:center; gap:.5rem !important; }
.vip-auth__remember input{ width:auto; }
.vip-auth__error{ color:#ff6b6b; font-size:.82rem; min-height:1.2em; margin:0; }
.vip-auth__hint{ color:var(--gray); font-size:.85rem; margin:0 0 -.3rem; }
.vip-auth__hint--admin{ text-transform:uppercase; letter-spacing:.1em; font-size:.72rem; color:var(--pink); }
.vip-auth__link, .vip-auth__back, .vip-auth__admin-toggle{
  background:none; border:none; color:var(--gray); font-size:.8rem; text-decoration:underline;
  cursor:pointer; padding:0; text-align:center; font-family:var(--font-body);
}
.vip-auth__admin-toggle{ margin-top:.5rem; opacity:.5; }
.vip-auth__choice{ width:100%; }
.vip-auth__welcome-heart{ width:48px; margin:0 auto 1rem; display:block; }
.vip-auth__welcome-msg{ text-align:center; color:var(--white); font-size:1.05rem; margin:0 0 1.2rem; }
.vip-auth__ticket-display{
  background:#151515; border:1px dashed rgba(255,255,255,.25); border-radius:10px;
  padding:1rem; text-align:center; margin-bottom:1.4rem;
}
.vip-auth__ticket-label{ display:block; font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--gray); }
.vip-auth__ticket-code{
  display:block; font-family:"SF Mono","Consolas",monospace; font-size:1.4rem; color:var(--pink); margin:.3rem 0;
}
.vip-auth__ticket-note{ display:block; font-size:.76rem; color:var(--gray); }
@media (max-width:480px){ .vip-auth__panel{ padding:1.8rem 1.4rem; } }
```

- [ ] **Step 2: Verify each state renders correctly**

Run: `npx wrangler dev --port 8787` (background). With Playwright, navigate to `http://localhost:8787/vip-locked.html`, take a screenshot of the default `choice` state, then for each of `signup`, `login`, `ticket`, `admin`, `welcome` run:

```js
document.querySelectorAll('.vip-auth__state').forEach(el => el.classList.remove('is-active'));
document.querySelector('[data-state="STATE_NAME"]').classList.add('is-active');
```

and screenshot each. Expected: the blurred hero is visible behind a dark panel in every state; form fields, buttons, and the ticket-code display (unhide it manually for this check: `document.querySelector('.vip-auth__ticket-display').hidden = false`) are all legible with proper spacing, no overlapping elements. Stop the dev server after confirming.

- [ ] **Step 3: Commit**

```bash
git add assets/css/style.css
git commit -m "Add blur and auth-modal CSS for the VIP gate"
```

---

## Task 10: Frontend auth logic (`vip-auth.js`)

**Files:**
- Create: `assets/js/vip-auth.js`

**Interfaces:**
- Consumes: the `/api/vip/*` endpoints from Tasks 4–6; the `data-state`/`data-show`/`.vip-auth__*` DOM structure from Task 8; the `.is-active` visibility class from Task 9.
- Produces: a fully working modal — this is the last piece needed for the gate to function end-to-end through the real UI.

- [ ] **Step 1: Implement `assets/js/vip-auth.js`**

```js
// assets/js/vip-auth.js
(function () {
  const root = document.getElementById('vip-auth');
  if (!root) return;

  function showState(name) {
    root.querySelectorAll('.vip-auth__state').forEach(el => {
      el.classList.toggle('is-active', el.dataset.state === name);
    });
  }

  root.querySelectorAll('[data-show]').forEach(btn => {
    btn.addEventListener('click', () => showState(btn.dataset.show));
  });

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function showWelcome(data) {
    const msgEl = root.querySelector('.vip-auth__welcome-msg');
    const ticketWrap = root.querySelector('.vip-auth__ticket-display');
    msgEl.textContent = data.isNewMember
      ? `Thank you so much for becoming a VIP member, ${data.name}!`
      : `Welcome back, ${data.name}. Here's your ticket again:`;
    if (data.ticket) {
      ticketWrap.hidden = false;
      ticketWrap.querySelector('.vip-auth__ticket-code').textContent = data.ticket;
    } else {
      ticketWrap.hidden = true;
    }
    showState('welcome');
  }

  function bindForm(stateName, onSubmit) {
    const form = root.querySelector(`[data-state="${stateName}"]`);
    if (!form || form.tagName !== 'FORM') return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = form.querySelector('.vip-auth__error');
      errorEl.textContent = '';
      try {
        await onSubmit(form);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  let pendingPhone = null;
  let recoverPhone = null;

  bindForm('signup', async (form) => {
    const payload = {
      name: form.name.value.trim(),
      username: form.username.value.trim(),
      password: form.password.value,
      phone: form.phone.value.trim()
    };
    const data = await postJson('/api/vip/signup', payload);
    if (data.verified) {
      showWelcome(data);
    } else {
      pendingPhone = payload.phone;
      showState('otp');
    }
  });

  bindForm('otp', async (form) => {
    const data = await postJson('/api/vip/verify-otp', {
      phone: pendingPhone,
      code: form.code.value.trim()
    });
    showWelcome(data);
  });

  bindForm('login', async (form) => {
    await postJson('/api/vip/login', {
      username: form.username.value.trim(),
      password: form.password.value,
      rememberMe: form.rememberMe.checked
    });
    location.href = '/vip';
  });

  bindForm('ticket', async (form) => {
    await postJson('/api/vip/login-ticket', { ticket: form.ticket.value.trim() });
    location.href = '/vip';
  });

  bindForm('recover-phone', async (form) => {
    const phone = form.phone.value.trim();
    const data = await postJson('/api/vip/recover', { phone });
    if (data.verified) {
      showWelcome(data);
    } else {
      recoverPhone = phone;
      showState('recover-otp');
    }
  });

  bindForm('recover-otp', async (form) => {
    const data = await postJson('/api/vip/recover-verify', {
      phone: recoverPhone,
      code: form.code.value.trim()
    });
    showWelcome(data);
  });

  bindForm('admin', async (form) => {
    await postJson('/api/vip/admin-login', { phone: form.phone.value.trim() });
    location.href = '/vip';
  });

  root.querySelector('.vip-auth__enter').addEventListener('click', () => {
    location.href = '/vip';
  });
})();
```

- [ ] **Step 2: Full walkthrough — first-time signup with no Twilio configured**

Run: `npx wrangler dev --port 8787` (background). With Playwright: navigate to `http://localhost:8787/vip-locked.html`, click **Sign Up**, fill Name/Username/Password/Phone with fresh test values (use a phone number not used in any earlier task's curl tests, e.g. `561-555-0144`), submit.
Expected: since no Twilio secrets are set, the response auto-verifies immediately — the modal jumps straight to the `welcome` state showing "Thank you so much for becoming a VIP member, <name>!" and a visible ticket code. Click **Enter VIP** → confirm the browser navigates to `/vip` and the page now shows real content (assert the text `New` and `Releases` or the New Releases heading is present — the actual gated page, not the locked shell).

- [ ] **Step 3: Full walkthrough — returning login**

Open a fresh Playwright context (no cookies). Navigate to `/vip` → confirm the locked page renders. Click **Log In**, enter the username/password from Step 2, submit.
Expected: navigates straight to `/vip` with full content — no welcome/ticket message shown (confirms the `isNewMember:false` path skips it).

- [ ] **Step 4: Full walkthrough — ticket-code login**

Fresh context again. Navigate to `/vip` → **Log In** → **Forgot password?** → enter the ticket code from Step 2's welcome screen → submit.
Expected: navigates to `/vip` with full content.

- [ ] **Step 5: Full walkthrough — admin bypass**

Fresh context. Navigate to `/vip` → click **Admin?** → enter the local test admin number `5555550100` → submit.
Expected: navigates to `/vip` with full content, no ticket/welcome message.

Stop the dev server after confirming all four walkthroughs.

- [ ] **Step 6: Commit**

```bash
git add assets/js/vip-auth.js
git commit -m "Add frontend auth logic wiring the modal to the VIP gate endpoints"
```

---

## Task 11: Production deploy

**Files:**
- Modify: `wrangler.jsonc` (production KV `id`)

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: the feature live at `https://psychotic-love.traviskenlocean1.workers.dev/vip`.

- [ ] **Step 1: Create the production KV namespace**

Run: `npx wrangler kv namespace create VIP_MEMBERS`
Expected: prints a production `id` (different from the `--preview` one created in Task 3). Update the `id` field for the `VIP_MEMBERS` binding in `wrangler.jsonc` if it differs from the preview namespace — the `preview_id` stays as-is for local dev, `id` is what production uses.

- [ ] **Step 2: Generate and set the production session secret**

Run (generates a random 48-byte hex string and pipes it directly into the secret — never touches a file):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" | npx wrangler secret put SESSION_SECRET
```

Expected: `Success! Uploaded secret SESSION_SECRET`.

- [ ] **Step 3: Set the real admin phone allowlist**

Using the developer's and Branden's actual phone numbers (already known from this conversation — never write them to any file), run:

```bash
npx wrangler secret put ADMIN_PHONES
```

When prompted, paste a JSON array in the same shape as `.dev.vars.example`: `[["+1<developer's number, digits only, no formatting>","developer"],["+1<Branden's number>","owner"]]`.
Expected: `Success! Uploaded secret ADMIN_PHONES`.

- [ ] **Step 4: Push all committed work to GitHub**

```bash
git push
```

Expected: all commits from Tasks 1–10 land on `main`.

- [ ] **Step 5: Deploy**

Run: `npx wrangler deploy`
Expected: `Success!` with the deployed URL `https://psychotic-love.traviskenlocean1.workers.dev` and a new Version ID.

- [ ] **Step 6: Verify the live gate**

```bash
curl -sL https://psychotic-love.traviskenlocean1.workers.dev/vip | grep -o "VIP Access"
```

Expected: prints `VIP Access` (the locked page's title/heading) — confirms production correctly gates the page for an unauthenticated request.

- [ ] **Step 7: Verify the live admin bypass with the real developer number**

```bash
curl -s -X POST https://psychotic-love.traviskenlocean1.workers.dev/api/vip/admin-login \
  -H "Content-Type: application/json" \
  -d '{"phone":"<developer real number, digits only>"}' -i
```

Expected: `HTTP/1.1 200`, `Set-Cookie` present, `"role":"developer"` in the body.

- [ ] **Step 8: Manual browser check**

Open `https://psychotic-love.traviskenlocean1.workers.dev/vip` in a real browser. Confirm: blurred hero + modal render correctly; Sign Up with a real phone number (this is the first real end-to-end test with no auto-verify stub, if Twilio secrets were added before this step — otherwise it still auto-verifies, which is expected until Twilio is configured); confirm the ticket displays and Enter VIP leads into the real page.

