import { handleSignup, handleVerifyOtp, handleAdminLogin, handleLogin, handleLoginTicket } from './handlers.js';

const ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin,
  '/api/vip/login': handleLogin,
  '/api/vip/login-ticket': handleLoginTicket
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
