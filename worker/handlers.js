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
