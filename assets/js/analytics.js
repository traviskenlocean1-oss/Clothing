// assets/js/analytics.js
// Cloudflare Web Analytics -- picked because the site is already on
// Cloudflare (zero new account signup) and it's cookie-free/privacy-first,
// which pairs cleanly with the consent banner instead of fighting it.
//
// TOKEN NOT SET YET: replace CF_BEACON_TOKEN below with the real token from
// Cloudflare dashboard -> Analytics & Logs -> Web Analytics -> Add a site
// (or manage site) -> copy the token out of the generated snippet. Until a
// real token is set, this script intentionally does nothing.
(function () {
  const CF_BEACON_TOKEN = '';
  if (!CF_BEACON_TOKEN) return;

  function loadBeacon() {
    if (document.getElementById('cf-web-analytics')) return;
    const script = document.createElement('script');
    script.id = 'cf-web-analytics';
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: CF_BEACON_TOKEN }));
    document.body.appendChild(script);
  }

  if (window.PLConsent && window.PLConsent.granted()) {
    loadBeacon();
  }
  document.addEventListener('pl:consent', (e) => {
    if (e.detail.choice === 'accepted') loadBeacon();
  });
})();
