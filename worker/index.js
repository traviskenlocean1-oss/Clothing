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
