// worker/handlers.js
import { hashPassword, verifyPassword, generateOtp, generateTicket, normalizePhone } from './crypto.js';
import { getMemberByPhone, getMemberByUsername, getMemberByTicket, isUsernameTaken, saveMember } from './store.js';
import { sendOtp } from './sms.js';
import { findAdminRole } from './admin.js';
import { sessionCookieHeader, clearSessionCookieHeader, isAuthenticated } from './gate.js';
import { PRODUCT_PRICES } from './products.js';

// Empty until the real 100-code list is ready (mirrors assets/js/cart.js's
// DISCOUNT_CODES) -- paste them in as "CODE": percentOff in both places.
const DISCOUNT_CODES = {};

const CLOVER_CHARGE_URL = 'https://scl.clover.com/v1/charges';

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

export async function handleLogout(request, env) {
  return json({ loggedOut: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}

export async function handleStatus(request, env) {
  const auth = await isAuthenticated(request, env);
  return json({ authenticated: auth.authenticated });
}

function generateOrderNumber() {
  return 'PL-' + Math.floor(100000 + Math.random() * 900000);
}

// Recomputes the charge amount server-side from item ids/qtys against
// PRODUCT_PRICES -- never trusts a dollar amount sent by the browser, since
// the cart itself lives in unauthenticated client-side localStorage. Mirrors
// assets/js/cart.js's renderCheckout() math exactly (free shipping at/above
// $100 subtotal, otherwise a flat $8).
function computeTotalCents(items, discountCode) {
  let subtotal = 0;
  for (const item of items) {
    const product = PRODUCT_PRICES[item.id];
    if (!product) throw new Error(`Unknown product: ${item.id}`);
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    subtotal += product.price * qty;
  }
  const percent = discountCode ? DISCOUNT_CODES[String(discountCode).toUpperCase()] : null;
  const discount = percent ? subtotal * (percent / 100) : 0;
  const shipping = subtotal === 0 ? 0 : (subtotal >= 100 ? 0 : 8);
  const total = Math.max(0, subtotal - discount) + shipping;
  return Math.round(total * 100);
}

export async function handleCharge(request, env) {
  if (!env.CLOVER_PRIVATE_KEY) {
    return json({ error: 'Payments are not configured yet.' }, { status: 503 });
  }
  const body = await request.json();
  const { token, items, discountCode } = body;
  if (!token || !Array.isArray(items) || !items.length) {
    return json({ error: 'Missing payment token or cart items.' }, { status: 400 });
  }

  let amount;
  try {
    amount = computeTotalCents(items, discountCode);
  } catch (err) {
    return json({ error: err.message }, { status: 400 });
  }
  if (amount <= 0) {
    return json({ error: 'Order total must be greater than zero.' }, { status: 400 });
  }

  let cloverRes;
  try {
    cloverRes = await fetch(CLOVER_CHARGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOVER_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-forwarded-for': request.headers.get('CF-Connecting-IP') || '0.0.0.0'
      },
      body: JSON.stringify({ amount, currency: 'usd', source: token })
    });
  } catch (err) {
    console.error('[clover-charge] network error', err);
    return json({ error: 'Could not reach the payment processor. Try again.' }, { status: 502 });
  }

  const result = await cloverRes.json().catch(() => null);
  if (!cloverRes.ok || !result || result.status !== 'succeeded') {
    console.error('[clover-charge] declined/failed', cloverRes.status, result);
    const message = result?.message || result?.error?.message || 'Your card was declined. Try a different card.';
    return json({ error: message }, { status: 402 });
  }

  return json({
    ok: true,
    orderNumber: generateOrderNumber(),
    chargeId: result.id,
    amount
  });
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
  const cookie = await sessionCookieHeader({ phone: member.phone, role: member.role }, env);
  return json(
    { verified: true, name: member.name, ticket: member.ticket, isNewMember: false },
    { headers: { 'Set-Cookie': cookie } }
  );
}
