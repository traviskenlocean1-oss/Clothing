# VIP Membership Gate — Design Spec

**Date:** 2026-08-14
**Status:** Approved pending final user review
**Site:** Psychotic Love (`traviskenlocean1-oss/Clothing`), deployed via `npx wrangler deploy` to `psychotic-love.traviskenlocean1.workers.dev`

## Purpose

The VIP page (`vip.html`) currently shows its full content (hero, New Releases, Early Arrivals, closing manifesto) to every visitor. This spec adds a real, server-enforced membership gate: visitors sign up or log in with phone verification before the exclusive content is ever sent to their browser, while the site's owner and its developer bypass the gate entirely.

This is a genuine architectural change — it's the first backend logic this project has had. Today `wrangler.jsonc` serves static assets only (`"assets": { "directory": "." }`, no `main` worker script). This spec adds a real Worker script alongside the existing static files.

## Non-goals

- No admin dashboard/UI for viewing or managing the member list (YAGNI — nothing in the conversation asked for this; can be a later addition).
- No real payment, e-commerce, or account-settings functionality tied to membership — this gate only controls access to `/vip`.
- No changes to the hero's scroll-scrubbed playback mechanism — confirmed to keep exactly as built.
- Username/password is not validated for strength or uniqueness beyond "does this username already exist" — this is a demo-weight signup, not a hardened auth product.

## User-facing flow

### First-time visitor (not yet a member)

1. Lands on `/vip` → served `vip-locked.html`: the hero renders blurred, with a signup/login modal on top. No New Releases / Early Arrivals / closing-manifesto markup exists anywhere in this page's HTML — it is genuinely absent, not hidden with CSS.
2. Chooses **Sign Up**: enters Name, Username, Password, Phone Number (no email field).
3. Submits → Worker checks the phone against the admin allowlist first (see Admin login below); if no match, generates a 6-digit code, texts it to the phone (or logs it if Twilio isn't configured yet — see Deferred: SMS sending), stores a pending record in KV.
4. Enters the 6-digit code → Worker verifies it against the stored code + expiry.
5. On success: record marked verified, a randomized ticket code is generated and stored, a signed session cookie is set (60 days), and the page shows "Thank you so much for becoming a VIP member!" plus the ticket code with a note to keep it somewhere safe.
6. After a short pause, the blur clears and the existing scroll-scrubbed hero is what's underneath — visitor scrolls through it exactly as already built, now continuing into the real New Releases / Early Arrivals / closing-manifesto content because they're now served the full `vip.html`.

### Returning member, cookie still valid (within 60 days, same browser)

- `/vip` resolves directly to the full `vip.html` — no modal, no re-verification.

### Returning member, cookie expired or different device — chooses Log In

1. Primary fields: **Username + Password + "Remember me" checkbox**.
2. Correct match → logged in; if "Remember me" is checked, a fresh 60-day session cookie is set. Skips the "thank you for becoming a member" message and ticket display (that's a first-time-only moment) — just clears the blur and lets the existing hero play from the top.
3. **"Forgot password?"** → reveals a ticket-code field instead of username/password.
4. Ticket code matches a record → logged in the same way as step 2.
5. **"Forgot ticket too?"** (nested under the forgot-password state) → reveals a phone-number field.
6. Submits phone → Worker sends a fresh 6-digit code → visitor enters it → Worker verifies, looks up the **existing** record by phone (never creates a duplicate), shows them their existing ticket code again, and logs them in.

### Admin login (developer + owner)

- The login modal has a separate, distinctly-labeled "Admin Only" phone-number field (not the same field as the recovery flow above — regular members never need to know this exists).
- Enter a phone number → checked against a short allowlist held in a Worker secret. On match: instant login, no code sent, no ticket shown, straight into the full `vip.html`.
- Two allowlisted numbers for this build: the site builder's number (role `developer`, ranks above owner) and Branden's number (role `owner`, brand owner). Both were provided directly in conversation, not written here or anywhere else in the repo.
- These numbers are set via `wrangler secret put ADMIN_PHONES` directly from the terminal at implementation time — they exist only in Cloudflare's encrypted secret store, never in a file, never in git history, never in this spec.

## Data model

**Cloudflare KV namespace: `VIP_MEMBERS`**

One record per phone number (E.164-normalized, e.g. `+15555550123`), stored under key `phone:<E.164>`:

```json
{
  "name": "string",
  "username": "string",
  "passwordHash": "string (PBKDF2, via Web Crypto SubtleCrypto — never plaintext)",
  "phone": "+1XXXXXXXXXX",
  "ticket": "PL-XXXXXX",
  "role": "member",
  "verified": true,
  "createdAt": "ISO 8601 timestamp",
  "otp": "123456 (present only while a verification is pending)",
  "otpExpiry": 1234567890
}
```

A second key per record, `ticket:<TICKET>` → `<phone>`, gives O(1) ticket-code lookup without a KV scan.

A second key per record, `username:<username lowercased>` → `<phone>`, gives O(1) username lookup for the primary login path.

Admin (developer/owner) numbers are **not** stored in KV — they're checked directly against the `ADMIN_PHONES` secret at request time and never go through the signup/ticket flow at all.

## Backend endpoints (new Worker)

All under `/api/vip/*`, added via a new `main` entry in `wrangler.jsonc` alongside the existing `assets` block (Workers support serving static assets *and* running custom fetch logic in the same deployment — the asset binding stays available to the Worker for the two-file gate decision below).

| Endpoint | Input | Behavior |
|---|---|---|
| `POST /api/vip/signup` | name, username, password, phone | Checks `ADMIN_PHONES` first. Otherwise validates username isn't taken, hashes password, stores a pending (unverified) record, sends/logs OTP. |
| `POST /api/vip/verify-otp` | phone, code | Checks code + expiry against KV. On match: marks verified, generates ticket, sets session cookie, clears the OTP fields. |
| `POST /api/vip/login` | username, password, rememberMe | Looks up by `username:*` key, verifies password hash, sets session cookie if `rememberMe`. |
| `POST /api/vip/login-ticket` | ticket | Looks up by `ticket:*` key, sets session cookie. |
| `POST /api/vip/recover` | phone | Sends a fresh OTP for an **existing** record found by `phone:*` key (404s if no account exists for that phone — doesn't silently create one). |
| `POST /api/vip/recover-verify` | phone, code | Verifies the recovery code, returns the existing ticket, sets session cookie. |
| `POST /api/vip/admin-login` | phone | Checked directly against `ADMIN_PHONES` secret. On match: sets session cookie with the matching role, no OTP. |

### Gate enforcement

The Worker's fetch handler intercepts `GET /vip` (and `/vip.html`) ahead of the static-asset fallback:

- Valid signed session cookie present → serve `vip.html` from the assets binding, unchanged.
- No/invalid/expired cookie → serve `vip-locked.html` from the assets binding instead.

All other routes fall through to the existing static-asset behavior untouched — this is additive, not a rewrite of the current site.

### Session cookie

`HttpOnly; Secure; SameSite=Lax`, signed with HMAC (Worker secret `SESSION_SECRET`) containing `{ phone, role, exp }`. 60-day expiry from the point it's set. The Worker validates the signature and expiry on every `/vip` request — an unsigned or tampered cookie is treated as "not logged in," not trusted.

## Frontend changes

- **New file `vip-locked.html`**: nav + the existing hero markup/CSS/JS (blurred via a wrapping class, e.g. `.gate-blur{ filter:blur(28px); }`) + footer + the new signup/login modal. No New Releases / Early Arrivals / closing-manifesto sections exist in this file at all.
- **`vip.html`**: unchanged content-wise; continues to be the full page, now only ever reachable through a valid session.
- **New modal component** (HTML structure + CSS + a new `assets/js/vip-auth.js`): handles the sign-up form, OTP entry, login form with the forgot-password → forgot-ticket → phone-recovery chain, the admin-only phone field, and the post-verification "welcome + ticket" message before the blur clears.
- Matches this site's existing convention of separate static HTML files per page (no shared templating system exists here — `vip-locked.html` duplicating the nav/hero/footer markup from `vip.html` is consistent with how every other page on this site already works, not a new pattern).

## Deferred: SMS sending

No Twilio (or equivalent) account exists yet — creating one requires real identity/payment info that only the user can provide. Until credentials are supplied:

- The Worker's "send OTP" step checks for `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` secrets. If absent, it **auto-verifies the signup immediately** (skips the code-entry step entirely) rather than silently failing or blocking testing — this keeps the full signup → welcome → ticket → hero-reveal flow testable end-to-end right now.
- Once Twilio secrets are added (`wrangler secret put TWILIO_ACCOUNT_SID`, etc.), the same code path automatically starts sending real texts and requiring real code entry — no code changes needed at that point, just adding the secrets.

## Open implementation details (not product decisions — left to the implementation plan)

- Exact PBKDF2 iteration count / salt handling for password hashing (Web Crypto `SubtleCrypto`, available in the Workers runtime).
- Ticket code format (proposed: `PL-` + 6 random uppercase alphanumeric characters, collision-checked against KV before assigning).
- Rate limiting on OTP requests/resends (proposed: max 3 sends per phone per 10 minutes, enforced via a short-lived KV key) — prevents SMS-cost abuse once Twilio is live.
