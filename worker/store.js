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
  const phone = await env.VIP_MEMBERS.get(`ticket:${ticket.toUpperCase()}`);
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

// Discount-code redemption tracking -- a code's presence as a key means it's
// already been used (dead), regardless of how many of the 200 batch codes
// exist. Checked before every charge and written immediately after a
// successful one (see worker/handlers.js's handleCharge).
export async function isCodeRedeemed(env, code) {
  const raw = await env.DISCOUNT_REDEMPTIONS.get(code.toUpperCase());
  return raw !== null;
}

export async function markCodeRedeemed(env, code, orderNumber) {
  await env.DISCOUNT_REDEMPTIONS.put(
    code.toUpperCase(),
    JSON.stringify({ orderNumber, redeemedAt: new Date().toISOString() })
  );
}

// Launch discount: automatic 15% off the first 80 real paid orders, no code
// needed -- replaces the old 200-single-use-code system (2026-09-05). Reuses
// the DISCOUNT_REDEMPTIONS namespace with one reserved counter key. KV has
// no atomic increment, so two charges completing in the same instant could
// both read the same count and both qualify -- an acceptable risk at this
// store's order volume, not worth a Durable Object for.
const EARLY_ORDER_COUNTER_KEY = '__early_order_count__';

export async function getEarlyOrderCount(env) {
  const raw = await env.DISCOUNT_REDEMPTIONS.get(EARLY_ORDER_COUNTER_KEY);
  return raw ? Number(raw) : 0;
}

export async function incrementEarlyOrderCount(env) {
  const count = await getEarlyOrderCount(env);
  await env.DISCOUNT_REDEMPTIONS.put(EARLY_ORDER_COUNTER_KEY, String(count + 1));
}
