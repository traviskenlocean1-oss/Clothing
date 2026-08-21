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
