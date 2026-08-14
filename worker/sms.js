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
