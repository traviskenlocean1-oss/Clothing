// worker/handlers.js
import { hashPassword, verifyPassword, generateOtp, generateTicket, normalizePhone } from './crypto.js';
import { getMemberByPhone, getMemberByUsername, getMemberByTicket, isUsernameTaken, saveMember, isCodeRedeemed, markCodeRedeemed } from './store.js';
import { sendOtp } from './sms.js';
import { findAdminRole } from './admin.js';
import { sessionCookieHeader, clearSessionCookieHeader, isAuthenticated } from './gate.js';
import { PRODUCT_PRICES } from './products.js';

// 200 unique single-batch codes, 15% off each -- this is the sole source of
// truth (assets/js/cart.js has no copy of its own anymore; the "Apply"
// button on checkout calls handleValidateCode below instead). Whether a
// given code has already been redeemed lives separately in the
// DISCOUNT_REDEMPTIONS KV namespace, checked by validateDiscountCode.
const DISCOUNT_CODES = {
    'BROKENHEARTJE37': 15,
    'CHAOS6RPZ': 15,
    'CHAOSBV27': 15,
    'BROKENHEART8TWS': 15,
    'PSYCHOTICG22J': 15,
    'PSYCHOPMU7': 15,
    'PSYCHOTICKFKK': 15,
    'FOREVERFGEV': 15,
    'PSYCHOTICAJS7': 15,
    'CHAOSGTJV': 15,
    'BROKENHEARTK6CY': 15,
    'FOREVER7MPZ': 15,
    'FOREVERN6H6': 15,
    'LOVEHURTSWFJ9': 15,
    'BROKENHEARTUTHW': 15,
    'FOREVER6P2H': 15,
    'PSYCHONGBD': 15,
    'FOREVERPTEQ': 15,
    'PSYCHOTICN5NB': 15,
    'BROKENHEARTAQ4E': 15,
    'PSYCHOTICXDVA': 15,
    'CHAOSXTHE': 15,
    'FOREVEREG4Y': 15,
    'PSYCHO7F29': 15,
    'FOREVEREPXA': 15,
    'BROKENHEARTNWQV': 15,
    'FOREVERD9WS': 15,
    'PSYCHOTICXJD4': 15,
    'FOREVERG45A': 15,
    'BROKENHEARTCYEU': 15,
    'PSYCHOTICGNXD': 15,
    'PSYCHOMQUD': 15,
    'FOREVERARG9': 15,
    'CHAOSM63F': 15,
    'FOREVER73H6': 15,
    'PSYCHO87GJ': 15,
    'CHAOSZTDH': 15,
    'PSYCHOFGEK': 15,
    'PSYCHOTICV6PW': 15,
    'FOREVERHGPT': 15,
    'PSYCHOTICA3T7': 15,
    'FOREVER3C38': 15,
    'LOVEHURTS53C7': 15,
    'LOVEHURTSMPY3': 15,
    'LOVEHURTSQYEF': 15,
    'LOVEHURTS9FPD': 15,
    'FOREVERWCQG': 15,
    'PSYCHOTICKXW4': 15,
    'BROKENHEARTFKTK': 15,
    'BROKENHEARTMM5C': 15,
    'PSYCHOTICYT4M': 15,
    'FOREVERN5B4': 15,
    'FOREVER88JD': 15,
    'PSYCHO23DY': 15,
    'PSYCHOTJQ4': 15,
    'FOREVER8HYC': 15,
    'CHAOS64QG': 15,
    'LOVEHURTSNMWM': 15,
    'PSYCHOTICHX35': 15,
    'LOVEHURTSWYU2': 15,
    'CHAOSVM8G': 15,
    'CHAOS7D4V': 15,
    'FOREVERJYDE': 15,
    'FOREVERDDSP': 15,
    'LOVEHURTSKACF': 15,
    'FOREVERG472': 15,
    'BROKENHEARTEU9N': 15,
    'PSYCHOUVKH': 15,
    'PSYCHOEQ2C': 15,
    'BROKENHEARTN4JP': 15,
    'LOVEHURTSYRCB': 15,
    'CHAOS5U4E': 15,
    'FOREVER6FQA': 15,
    'CHAOSCXAZ': 15,
    'FOREVERKTSM': 15,
    'FOREVER3DG7': 15,
    'FOREVERRDQF': 15,
    'PSYCHOTICBAB5': 15,
    'LOVEHURTS5SXQ': 15,
    'PSYCHOUYYS': 15,
    'LOVEHURTSZF8G': 15,
    'PSYCHOTICE84K': 15,
    'FOREVERKFV5': 15,
    'PSYCHOH7GR': 15,
    'CHAOSX9RQ': 15,
    'PSYCHOTICUMNG': 15,
    'BROKENHEART4HV2': 15,
    'PSYCHOTIC5VVC': 15,
    'PSYCHOTICB387': 15,
    'PSYCHOGESU': 15,
    'BROKENHEARTV4KS': 15,
    'LOVEHURTSMDRG': 15,
    'CHAOS65CK': 15,
    'LOVEHURTSR5SE': 15,
    'FOREVERM36E': 15,
    'PSYCHOTICYYW2': 15,
    'BROKENHEARTZJR7': 15,
    'PSYCHOFUSN': 15,
    'BROKENHEARTUTN6': 15,
    'PSYCHOTICY2CJ': 15,
    'LOVEHURTS68NB': 15,
    'LOVEHURTSUTQ9': 15,
    'PSYCHOTICVWCC': 15,
    'FOREVERKGGY': 15,
    'CHAOSP4C8': 15,
    'PSYCHOTICR5MN': 15,
    'LOVEHURTSWE9Q': 15,
    'LOVEHURTSC7D9': 15,
    'PSYCHOTIC8JVJ': 15,
    'FOREVERJKXW': 15,
    'BROKENHEARTBCSJ': 15,
    'BROKENHEARTYUW6': 15,
    'PSYCHOW8ZU': 15,
    'PSYCHOTICXJJ4': 15,
    'CHAOSYSMH': 15,
    'BROKENHEART6XXD': 15,
    'BROKENHEARTCA9N': 15,
    'PSYCHOTICAEXK': 15,
    'CHAOSG4YM': 15,
    'CHAOSUEPK': 15,
    'BROKENHEARTCVZQ': 15,
    'BROKENHEARTXWAJ': 15,
    'BROKENHEARTXEKJ': 15,
    'LOVEHURTSNSNS': 15,
    'BROKENHEART4GKT': 15,
    'LOVEHURTSCJF7': 15,
    'FOREVERHWK3': 15,
    'LOVEHURTSHSC5': 15,
    'PSYCHOTICYK7T': 15,
    'PSYCHOPQNK': 15,
    'CHAOSME8F': 15,
    'CHAOSZNAJ': 15,
    'LOVEHURTS7P95': 15,
    'CHAOSJJNG': 15,
    'FOREVERZAVR': 15,
    'PSYCHOTICBA96': 15,
    'FOREVEREJ2U': 15,
    'PSYCHOTIC9AVC': 15,
    'FOREVERCZQY': 15,
    'PSYCHOVNYX': 15,
    'LOVEHURTSNHHU': 15,
    'FOREVERR3SD': 15,
    'BROKENHEARTXB8P': 15,
    'PSYCHOTIC2XAS': 15,
    'LOVEHURTSYMJD': 15,
    'CHAOSN26R': 15,
    'BROKENHEART8WBQ': 15,
    'CHAOS95U9': 15,
    'PSYCHOSG3D': 15,
    'BROKENHEARTU3M6': 15,
    'LOVEHURTST3RZ': 15,
    'BROKENHEART3N9U': 15,
    'CHAOS77D5': 15,
    'PSYCHOYW2A': 15,
    'LOVEHURTSMJ3K': 15,
    'LOVEHURTSJ4FT': 15,
    'PSYCHOSNPQ': 15,
    'PSYCHOB2TQ': 15,
    'CHAOSWBVP': 15,
    'CHAOSP7YU': 15,
    'LOVEHURTSDASZ': 15,
    'LOVEHURTSEM9T': 15,
    'FOREVERMSG6': 15,
    'FOREVERMJGG': 15,
    'PSYCHORHFB': 15,
    'PSYCHO8KSH': 15,
    'BROKENHEARTAKJV': 15,
    'CHAOSASEC': 15,
    'CHAOS48KU': 15,
    'CHAOSESWK': 15,
    'CHAOS8YEC': 15,
    'BROKENHEARTT6Q4': 15,
    'BROKENHEARTXQGR': 15,
    'CHAOSFVB6': 15,
    'BROKENHEARTJS5M': 15,
    'PSYCHOMYFE': 15,
    'PSYCHOTICQPRB': 15,
    'CHAOSSPPC': 15,
    'PSYCHOJNCZ': 15,
    'CHAOSC55V': 15,
    'PSYCHOTICPTQD': 15,
    'CHAOSEBQH': 15,
    'BROKENHEARTJD4N': 15,
    'FOREVERQ8R8': 15,
    'LOVEHURTSNG4D': 15,
    'LOVEHURTSY62U': 15,
    'CHAOS7ZC2': 15,
    'BROKENHEARTP4MR': 15,
    'LOVEHURTSTFDG': 15,
    'LOVEHURTSQ6HG': 15,
    'PSYCHOTIC5TEM': 15,
    'PSYCHOTIC8DZ3': 15,
    'PSYCHOTICBG2W': 15,
    'LOVEHURTSPEY4': 15,
    'FOREVERK273': 15,
    'FOREVERFSPB': 15,
    'PSYCHOTICQYQ4': 15,
    'CHAOSYHW7': 15,
    'PSYCHOTICZ6RR': 15,
    'PSYCHOTICPMW5': 15,
};

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

// Looks up a code and confirms it hasn't already been redeemed (KV-backed --
// see worker/store.js). Used both for the checkout page's "Apply" button
// (a courtesy check) and, more importantly, inside handleCharge right
// before a real charge is made, which is the check that actually matters.
async function validateDiscountCode(env, rawCode) {
  const code = String(rawCode).toUpperCase();
  const percent = DISCOUNT_CODES[code];
  if (!percent) return { valid: false, error: "That code doesn't look right." };
  if (await isCodeRedeemed(env, code)) {
    return { valid: false, error: 'That code has already been used.' };
  }
  return { valid: true, code, percent };
}

export async function handleValidateCode(request, env) {
  const { code } = await request.json();
  if (!code) return json({ valid: false, error: 'No code given.' }, { status: 400 });
  const result = await validateDiscountCode(env, code);
  return json(result);
}

// Recomputes the charge amount server-side from item ids/qtys against
// PRODUCT_PRICES -- never trusts a dollar amount sent by the browser, since
// the cart itself lives in unauthenticated client-side localStorage. Mirrors
// assets/js/cart.js's renderCheckout() math exactly (free shipping at/above
// $100 subtotal, otherwise a flat $8). `percent` is a discount already
// resolved (and redemption-checked) by the caller -- this function just does
// the arithmetic, it doesn't look anything up itself.
function computeTotalCents(items, percent) {
  let subtotal = 0;
  for (const item of items) {
    const product = PRODUCT_PRICES[item.id];
    if (!product) throw new Error(`Unknown product: ${item.id}`);
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    subtotal += product.price * qty;
  }
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

  // Resolved once, up front -- reused for both the amount calculation and,
  // after a successful charge, marking the code dead. A code sent by the
  // browser that's unknown or already redeemed blocks the order outright
  // rather than silently charging full price, since the customer believes
  // they're getting a discount.
  let discount = null;
  if (discountCode) {
    const result = await validateDiscountCode(env, discountCode);
    if (!result.valid) {
      return json({ error: result.error }, { status: 400 });
    }
    discount = result;
  }

  let amount;
  try {
    amount = computeTotalCents(items, discount ? discount.percent : null);
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

  const orderNumber = generateOrderNumber();
  if (discount) {
    // Only ever marked dead once the charge has actually succeeded -- a
    // declined card or a network failure above must not burn the code.
    await markCodeRedeemed(env, discount.code, orderNumber);
  }

  return json({
    ok: true,
    orderNumber,
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
