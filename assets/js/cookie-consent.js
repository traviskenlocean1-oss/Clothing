// assets/js/cookie-consent.js
// Site has no analytics/tracking scripts wired up yet -- this establishes
// the consent record and banner now, so anything added later (analytics is
// the next planned phase) has a real accept/reject choice to check against
// via window.PLConsent, instead of retrofitting consent after the fact.
(function () {
  const KEY = 'pl_cookie_consent';

  window.PLConsent = {
    get: () => localStorage.getItem(KEY),
    granted: () => localStorage.getItem(KEY) === 'accepted'
  };

  if (localStorage.getItem(KEY)) return;

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'cookie-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.innerHTML = `
      <p class="cookie-consent__text">We use cookies to keep you signed in and improve your experience on this site.</p>
      <div class="cookie-consent__actions">
        <button type="button" class="btn cookie-consent__reject"><span>Reject</span></button>
        <button type="button" class="btn btn-solid cookie-consent__accept"><span>Accept</span></button>
      </div>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('is-visible'));

    function dismiss(choice) {
      localStorage.setItem(KEY, choice);
      bar.classList.remove('is-visible');
      setTimeout(() => bar.remove(), 500);
    }
    bar.querySelector('.cookie-consent__accept').addEventListener('click', () => dismiss('accepted'));
    bar.querySelector('.cookie-consent__reject').addEventListener('click', () => dismiss('rejected'));
  });
})();
