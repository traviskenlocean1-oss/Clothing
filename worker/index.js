import { isAuthenticated } from './gate.js';
import {
  handleSignup, handleVerifyOtp, handleAdminLogin,
  handleLogin, handleLoginTicket, handleRecover, handleLogout, handleStatus
} from './handlers.js';

const POST_ROUTES = {
  '/api/vip/signup': handleSignup,
  '/api/vip/verify-otp': handleVerifyOtp,
  '/api/vip/admin-login': handleAdminLogin,
  '/api/vip/login': handleLogin,
  '/api/vip/login-ticket': handleLoginTicket,
  '/api/vip/recover': handleRecover,
  '/api/vip/logout': handleLogout
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

    if (request.method === 'GET' && url.pathname === '/api/vip/status') {
      try {
        return await handleStatus(request, env);
      } catch (err) {
        console.error('[vip-auth]', url.pathname, err);
        return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (request.method === 'POST' && POST_ROUTES[url.pathname]) {
      try {
        return await POST_ROUTES[url.pathname](request, env);
      } catch (err) {
        console.error('[vip-auth]', url.pathname, err);
        return new Response(JSON.stringify({ error: 'Something went wrong. Try again.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // /vip and /vip.html always show the gate shell -- never the real
    // content directly, even for an already-authenticated visitor. The gate
    // shell itself checks /api/vip/status client-side and shows a one-tap
    // "already signed in, continue" state instead of Sign Up/Log In when
    // appropriate, but the modal always appears first, per explicit request.
    if (url.pathname === '/vip' || url.pathname === '/vip.html') {
      // Extensionless target: requesting the ".html" filename directly from
      // env.ASSETS.fetch returns Cloudflare's default 307 redirect to the
      // extensionless URL instead of serving content, since that's this
      // site's normal html_handling behavior for every page.
      return env.ASSETS.fetch(new Request(new URL('/vip-locked', url.origin), request));
    }

    // The only path that ever serves the real VIP content -- reached by
    // clicking through the gate shell (either logging in, or tapping
    // "Continue to VIP" when already signed in). Still fully gated: a
    // direct or bookmarked hit without a valid session just bounces back
    // to the gate shell above.
    if (url.pathname === '/vip-enter') {
      try {
        const auth = await isAuthenticated(request, env);
        if (!auth.authenticated) {
          return Response.redirect(new URL('/vip', url.origin), 307);
        }
      } catch (err) {
        console.error('[vip-auth]', url.pathname, err);
        return Response.redirect(new URL('/vip', url.origin), 307);
      }
      return env.ASSETS.fetch(new Request(new URL('/vip', url.origin), request));
    }

    return env.ASSETS.fetch(request);
  }
};
