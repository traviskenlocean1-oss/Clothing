import { isAuthenticated } from './gate.js';
import {
  handleSignup, handleVerifyOtp, handleAdminLogin,
  handleLogin, handleLoginTicket, handleRecover, handleLogout, handleStatus
} from './handlers.js';

// VIP-exclusive product slugs (must mirror the `vip: true` entries in
// assets/js/products.js) -- kept as an explicit list here because the
// Worker can't import that browser-facing file (it assigns to `window`,
// not a module export), and the product page itself is a static asset
// served with no server-side check unless a path is listed in
// wrangler.jsonc's run_worker_first.
const VIP_PRODUCT_SLUGS = new Set(['stitched-heart-tee', 'ember-monogram-tee']);

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

    // A VIP-exclusive product's page/photos/description shouldn't be reachable
    // by anyone who hasn't signed up -- clicking the teaser on the homepage
    // (or just guessing/bookmarking the URL) must bounce to the same sign-up
    // gate as /vip, not quietly render the real page. Non-VIP products on
    // this same product.html template are unaffected.
    if (url.pathname === '/product' || url.pathname === '/product.html') {
      const slug = url.searchParams.get('p');
      if (slug && VIP_PRODUCT_SLUGS.has(slug)) {
        try {
          const auth = await isAuthenticated(request, env);
          if (!auth.authenticated) {
            return Response.redirect(new URL('/vip', url.origin), 307);
          }
        } catch (err) {
          console.error('[vip-auth]', url.pathname, err);
          return Response.redirect(new URL('/vip', url.origin), 307);
        }
      }
    }

    return env.ASSETS.fetch(request);
  }
};
