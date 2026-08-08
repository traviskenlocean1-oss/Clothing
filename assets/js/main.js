/* Psychotic Love — shared site behavior */

/* Scrolling is native (no Lenis smoothing) — smoothed/eased scroll reads as
   input lag with a physical mouse wheel's discrete notches. GSAP/ScrollTrigger
   were also loaded but never actually used for anything, so both are dropped. */

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

/* ---------- 3D tee mockup (real GLB models, lazy-mounted, hover-to-spin) ---------- */
function hexToRgba(hex){
  const n = parseInt(hex.replace('#',''), 16);
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255, 1];
}
window.hexToRgba = hexToRgba;
const GARMENT_CONFIG = {
  tshirt: { src: 'assets/models/tshirt-basic.glb', orbit: '0deg 78deg 100%', backOrbit: '180deg 78deg 100%', decalClass: '' },
  hoodie: { src: 'assets/models/hoodie-basic.glb', orbit: '90deg 78deg 100%', backOrbit: '270deg 78deg 100%', decalClass: 'tee-3d-decal--hoodie' }
};
window.GARMENT_CONFIG = GARMENT_CONFIG;
function mount3DTee(el){
  if (el.dataset.teeMounted) return;
  el.dataset.teeMounted = '1';
  const shirt = el.dataset.shirt || '#111111';
  const heart = el.dataset.heart;
  const garment = GARMENT_CONFIG[el.dataset.garment] ? el.dataset.garment : 'tshirt';
  const cfg = GARMENT_CONFIG[garment];
  // The auto-scrolling carousel's cards are decorative/non-interactive (they
  // fly past on their own), so skip the interaction and shadow-rendering
  // overhead that's only worth paying for on a card the user can actually
  // stop and orbit — smaller per-instance GPU cost with several of these
  // rendering at once.
  const lightweight = !!el.closest('.scroller');
  const extraAttrs = lightweight ? 'shadow-intensity="0"' : 'camera-controls shadow-intensity="1"';
  el.innerHTML = `
    <model-viewer class="tee-3d" src="${cfg.src}"
      camera-orbit="${cfg.orbit}" disable-zoom ${extraAttrs} exposure="1"
      rotation-per-second="28deg" interaction-prompt="none"></model-viewer>
    <img src="${heart}" alt="" class="tee-3d-decal ${cfg.decalClass}">
  `;
  const mv = el.querySelector('model-viewer');
  mv.addEventListener('load', () => {
    mv.model?.materials?.forEach(material => {
      material.pbrMetallicRoughness?.setBaseColorFactor(hexToRgba(shirt));
    });
    // Recover from WebGL context loss — can happen under GPU memory pressure
    // (more of a risk on mobile, with several <model-viewer> instances
    // rendering at once) and would otherwise show as this card silently
    // reverting to an unstyled/default model with no error. model-viewer
    // doesn't reliably restore scene/material state on every device after
    // contextrestored, so treat any loss as "rebuild this card from scratch."
    const glCanvas = mv.shadowRoot && mv.shadowRoot.querySelector('canvas');
    if (glCanvas && !glCanvas.dataset.contextLossWired) {
      glCanvas.dataset.contextLossWired = '1';
      glCanvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        console.warn('[tee] WebGL context lost — remounting', el);
        delete el.dataset.teeMounted;
        el.innerHTML = '';
        mount3DTee(el);
      });
    }
  });
  mv.addEventListener('pointerenter', () => mv.setAttribute('auto-rotate', ''));
  mv.addEventListener('pointerleave', () => mv.removeAttribute('auto-rotate'));
}
const teeObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      mount3DTee(e.target);
    } else if (e.target.dataset.teeMounted && !e.target.closest('.scroller')) {
      /* release the WebGL context once scrolled well out of view — grids with
         many products can otherwise exceed the browser's simultaneous-context limit.
         Skipped for the auto-scrolling carousel: its cards constantly cross in and
         out of the rootMargin on their own (no user scroll involved), so unmounting
         here raced with each model's load time — a card would get destroyed and
         re-mounted before its glb ever finished loading, which looked like it
         "glitching back" to the previous shirt. It's a small, fixed set of cards,
         so mounting them once and leaving them is cheap and glitch-free. */
      e.target.innerHTML = '';
      delete e.target.dataset.teeMounted;
    }
  });
}, { rootMargin: '250px' });
window.observeTee = (el) => teeObserver.observe(el);

document.querySelectorAll('[data-tee]').forEach(el => {
  if (el.closest('.scroller')) {
    /* IntersectionObserver checks are throttled to the browser's own pace,
       not every animation frame — fine for a page the user scrolls by hand,
       but this carousel's cards cross the whole viewport in ~2s on their
       own, fast enough that some entries/exits happen between checks and
       never fire at all (some cards just never got their model mounted).
       It's a small, fixed set, so load them all immediately instead of
       depending on visibility timing. */
    mount3DTee(el);
  } else {
    teeObserver.observe(el);
  }
});

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
