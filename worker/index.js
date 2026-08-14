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
    if (!env.SESSION_SECRET) {
      return new Response('Server misconfigured', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && ROUTES[url.pathname]) {
      try {
        return await ROUTES[url.pathname](request, env);
      } catch (err) {
        console.error('[vip-auth]', url.pathname, err);
        return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/vip' || url.pathname === '/vip.html') {
      let target = '/vip-locked';
      try {
        const auth = await isAuthenticated(request, env);
        target = auth.authenticated ? '/vip' : '/vip-locked';
      } catch (err) {
        console.error('[vip-auth]', url.pathname, err);
        target = '/vip-locked';
      }
      // Extensionless targets: requesting the ".html" filename directly from
      // env.ASSETS.fetch returns Cloudflare's default 307 redirect to the
      // extensionless URL instead of serving content, since that's this
      // site's normal html_handling behavior for every page.
      return env.ASSETS.fetch(new Request(new URL(target, url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
