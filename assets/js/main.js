/* Psychotic Love — shared site behavior */

/* Scrolling is native (no Lenis smoothing) — smoothed/eased scroll reads as
   input lag with a physical mouse wheel's discrete notches. GSAP/ScrollTrigger
   were also loaded but never actually used for anything, so both are dropped. */

/* ---------- newsletter phone input: auto-advance between the 3 segments ---------- */
document.querySelectorAll('.phone-input input').forEach((input, i, all) => {
  input.addEventListener('input', () => {
    if (input.value.length >= input.maxLength && all[i + 1]) all[i + 1].focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && all[i - 1]) all[i - 1].focus();
  });
});

/* ---------- hero entrance (staggered fade/rise on load) ---------- */
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('hero-loaded')));

/* ---------- brand-outro: stretch text to fill exactly edge-to-edge ---------- */
function stretchBrandOutro(){
  const el = document.querySelector('.brand-outro span');
  const container = document.querySelector('.brand-outro');
  if (!el || !container) return;
  el.style.transform = 'none';
  const naturalWidth = el.getBoundingClientRect().width;
  const targetWidth = container.getBoundingClientRect().width;
  if (naturalWidth > 0) el.style.transform = `scaleX(${targetWidth / naturalWidth})`;
}
window.addEventListener('load', stretchBrandOutro);
window.addEventListener('resize', stretchBrandOutro);

/* ---------- page transition (square wipe) ----------
   The covering overlay itself is injected synchronously in <head> (before
   paint, so there's no flash of the page underneath). This handles the
   reveal-on-load and the cover-then-navigate on internal link clicks. */
(function(){
  const overlay = document.getElementById('page-transition');
  if (!overlay) return;
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-revealing')));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.target === '_blank' || a.hasAttribute('data-cart-open')) return;
    if (a.origin && a.origin !== location.origin) return;
    e.preventDefault();
    overlay.classList.remove('is-revealing');
    overlay.classList.add('is-covering');
    setTimeout(() => { window.location.href = href; }, 680);
  });

  // Browser back/forward can restore this page from bfcache instead of doing
  // a fresh load — when that happens the page is restored exactly as it was
  // the instant we navigated away, mid-transition, with the overlay still
  // opaque (.is-covering) from the click handler above. A bfcache restore
  // doesn't re-run this IIFE, so nothing else would ever uncover it — this
  // was the "back button doesn't bring me back, have to refresh" bug.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      overlay.classList.remove('is-covering');
      overlay.classList.add('is-revealing');
    }
  });
})();

/* ---------- nav scroll state + mobile menu ---------- */
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

document.querySelector('.nav__burger')?.addEventListener('click', (e) => {
  const isOpen = document.querySelector('.nav__links')?.classList.toggle('is-open');
  e.currentTarget.classList.toggle('is-active', isOpen);
  document.body.classList.toggle('nav-open', isOpen);
});

/* ---------- reveal-on-scroll ---------- */
const revealItems = document.querySelectorAll('.reveal');
if (revealItems.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); });
  }, { threshold: 0.2 });
  revealItems.forEach(el => io.observe(el));
}

/* ---------- accordion (product page) ---------- */
document.querySelectorAll('.accordion-item > button').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('is-open');
  });
});

/* ---------- size + quantity selectors ---------- */
document.querySelectorAll('.size-swatch').forEach(el => {
  el.addEventListener('click', () => {
    el.parentElement.querySelectorAll('.size-swatch').forEach(s => s.classList.remove('is-active'));
    el.classList.add('is-active');
  });
});
document.querySelectorAll('.qty-row').forEach(row => {
  const input = row.querySelector('input');
  row.querySelector('[data-qty-minus]')?.addEventListener('click', () => {
    input.value = Math.max(1, parseInt(input.value || 1) - 1);
  });
  row.querySelector('[data-qty-plus]')?.addEventListener('click', () => {
    input.value = parseInt(input.value || 1) + 1;
  });
});

/* ---------- shop filters ---------- */
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('is-active'));
    pill.classList.add('is-active');
    const filter = pill.dataset.filter;
    document.querySelectorAll('.product-card').forEach(card => {
      const show = filter === 'all' || card.dataset.tags?.includes(filter);
      card.style.display = show ? '' : 'none';
    });
  });
});

/* ---------- add-to-cart / buy-now wiring ---------- */
function readCardItem(card){
  const sizeEl = card.querySelector('.size-swatch.is-active');
  const qtyEl = card.querySelector('.qty-row input');
  return {
    id: card.dataset.product,
    name: card.dataset.name,
    price: parseFloat(card.dataset.price),
    color: card.dataset.shirt || '#111111',
    heart: card.dataset.heart || '',
    garment: card.dataset.garment || 'tshirt',
    image: card.dataset.image || '',
    size: sizeEl ? sizeEl.textContent.trim() : 'M',
    qty: qtyEl ? parseInt(qtyEl.value) : 1
  };
}
document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('[data-product]');
    if (!card || !window.PLCart) return;
    window.PLCart.add(readCardItem(card));
  });
});
document.querySelectorAll('[data-buy-now]').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('[data-product]');
    if (!card || !window.PLCart) return;
    window.PLCart.add(readCardItem(card));
    window.PLCart.close();
    window.location.href = 'checkout.html';
  });
});

/* ---------- collection-preview carousel: swipe-controlled on mobile ----------
   Desktop keeps the original CSS auto-scroll (untouched). On mobile the CSS
   animation is turned off (see style.css) and this drives position by index
   instead — swipe left/right moves one card at a time, nothing runs on its
   own. The markup still has 12 cards (6 unique, duplicated for the old
   infinite-auto-scroll trick) but this only ever targets the first 6; the
   duplicates just sit unused past the last one, which is harmless. */
(function(){
  if (!window.matchMedia('(max-width:900px)').matches) return;
  const track = document.querySelector('.scroller__track');
  if (!track) return;
  const cards = Array.from(track.children);
  const uniqueCount = cards.length / 2;
  let index = 0;

  function cardStep(){
    const style = getComputedStyle(track);
    return cards[0].getBoundingClientRect().width + (parseFloat(style.gap) || 0);
  }
  function goTo(i){
    index = ((i % uniqueCount) + uniqueCount) % uniqueCount;
    track.style.transform = `translateX(${-index * cardStep()}px)`;
  }

  let startX = 0, dragging = false;
  track.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    dragging = true;
  }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    const delta = e.changedTouches[0].clientX - startX;
    if (Math.abs(delta) < 40) return; // too small to count as an intentional swipe
    goTo(index + (delta < 0 ? 1 : -1));
  }, { passive: true });

  goTo(0);
})();
