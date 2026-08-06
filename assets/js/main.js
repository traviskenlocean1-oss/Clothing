/* Psychotic Love — shared site behavior */

/* Scrolling is native (no Lenis smoothing) — smoothed/eased scroll reads as
   input lag with a physical mouse wheel's discrete notches. GSAP/ScrollTrigger
   were also loaded but never actually used for anything, so both are dropped. */

/* ---------- hero entrance (staggered fade/rise on load) ---------- */
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('hero-loaded')));

/* ---------- nav scroll state + mobile menu ---------- */
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

document.querySelector('.nav__burger')?.addEventListener('click', () => {
  document.querySelector('.nav__links')?.classList.toggle('is-open');
});

/* ---------- reveal-on-scroll ---------- */
const revealItems = document.querySelectorAll('.reveal');
if (revealItems.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); });
  }, { threshold: 0.2 });
  revealItems.forEach(el => io.observe(el));
}

/* ---------- hero: heart-drip + letter-glitch + cream/black bg shift on scroll ---------- */
const hero = document.querySelector('.hero');
if (hero) {
  const drips = hero.querySelectorAll('.drip');
  const glitchLetters = hero.querySelectorAll('.glitch');

  window.addEventListener('scroll', () => {
    const progress = Math.min(1, window.scrollY / (window.innerHeight * 0.9));
    drips.forEach((d, i) => {
      d.style.transform = `scaleY(${1 + progress * (0.6 + i * 0.15)})`;
    });
    hero.style.background = `linear-gradient(180deg,
      ${mixColor('#0c0c0c', '#F6F1E8', progress * 0.15)} 0%,
      ${mixColor('#1a1a1a', '#F6F1E8', progress * 0.25)} 55%,
      #0c0c0c 100%)`;
  }, { passive: true });

  let glitchTimer;
  function triggerGlitch(){
    glitchLetters.forEach(l => {
      l.style.transform = `translate(${(Math.random()-.5)*4}px, ${(Math.random()-.5)*4}px)`;
      l.style.opacity = .85;
    });
    setTimeout(() => glitchLetters.forEach(l => { l.style.transform = ''; l.style.opacity = 1; }), 120);
    glitchTimer = setTimeout(triggerGlitch, 2600 + Math.random() * 2200);
  }
  if (glitchLetters.length) triggerGlitch();
}

function mixColor(hexA, hexB, t){
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0]-a[0]) * t);
  const g = Math.round(a[1] + (b[1]-a[1]) * t);
  const bl = Math.round(a[2] + (b[2]-a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex){
  const n = parseInt(hex.replace('#',''), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}

/* ---------- tee mockup renderer (front / back, coded SVG, no photos) ---------- */
const TEE_FRONT_PATH = "M40,30 C40,15 60,5 80,10 L80,25 Q100,42 120,25 L120,10 C140,5 160,15 160,30 L188,58 L166,84 L150,68 L150,222 L50,222 L50,68 L34,84 L12,58 Z";
const TEE_BACK_PATH   = "M40,30 C40,12 60,4 100,4 C140,4 160,12 160,30 L188,58 L166,84 L150,68 L150,222 L50,222 L50,68 L34,84 L12,58 Z";

function renderTee({ face = 'front', shirt = '#111111', heart = 'assets/img/hearts/heart-pink.png', size = 100, back = false } = {}){
  const path = face === 'front' ? TEE_FRONT_PATH : TEE_BACK_PATH;
  const heartSize = face === 'front' ? 34 : 46;
  const heartX = 100 - heartSize/2;
  const heartY = face === 'front' ? 78 : 60;
  return `
    <svg class="tee-mock" viewBox="0 0 200 240" width="${size}%">
      <path d="${path}" fill="${shirt}" stroke="rgba(0,0,0,.15)" stroke-width="1.5"/>
      <image href="${heart}" x="${heartX}" y="${heartY}" width="${heartSize}" height="${heartSize}" />
    </svg>`;
}
window.renderTee = renderTee;

document.querySelectorAll('[data-tee]').forEach(el => {
  const shirt = el.dataset.shirt || '#111111';
  const heart = el.dataset.heart;
  el.innerHTML = `
    <div class="tee tee--front">${renderTee({ face:'front', shirt, heart })}</div>
    <div class="tee tee--back">${renderTee({ face:'back', shirt, heart })}</div>
  `;
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

/* ---------- add-to-cart wiring ---------- */
document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('[data-product]');
    if (!card || !window.PLCart) return;
    const sizeEl = card.querySelector('.size-swatch.is-active');
    const qtyEl = card.querySelector('.qty-row input');
    window.PLCart.add({
      id: card.dataset.product,
      name: card.dataset.name,
      price: parseFloat(card.dataset.price),
      color: card.dataset.shirt || '#111111',
      size: sizeEl ? sizeEl.textContent.trim() : 'M',
      qty: qtyEl ? parseInt(qtyEl.value) : 1
    });
  });
});
