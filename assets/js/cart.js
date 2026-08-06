/* Psychotic Love — front-end demo cart (localStorage, no payment processing) */
(function(){
  const KEY = 'pl_cart_v1';

  function read(){
    try{ return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch(e){ return []; }
  }
  function write(items){
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
  }

  function add(item){
    const items = read();
    const match = items.find(i => i.id === item.id && i.size === item.size);
    if(match){ match.qty += item.qty || 1; }
    else { items.push({ ...item, qty: item.qty || 1 }); }
    write(items);
    open();
  }
  function remove(id, size){
    write(read().filter(i => !(i.id === id && i.size === size)));
  }
  function setQty(id, size, qty){
    const items = read();
    const match = items.find(i => i.id === id && i.size === size);
    if(!match) return;
    match.qty = Math.max(1, qty);
    write(items);
  }
  function count(){ return read().reduce((n,i)=>n+i.qty,0); }
  function subtotal(){ return read().reduce((n,i)=>n+i.qty*i.price,0); }

  function open(){
    document.querySelector('.cart-drawer')?.classList.add('is-open');
    document.querySelector('.cart-overlay')?.classList.add('is-open');
  }
  function close(){
    document.querySelector('.cart-drawer')?.classList.remove('is-open');
    document.querySelector('.cart-overlay')?.classList.remove('is-open');
  }

  function teeMediaMarkup(i){
    if(typeof window.renderTee === 'function'){
      return window.renderTee({ shirt: i.color || '#111111', heart: i.heart, size: 100 });
    }
    return '';
  }

  function render(){
    document.querySelectorAll('.nav__cart-count').forEach(el => el.textContent = count());

    const list = document.querySelector('.cart-items');
    const sub = document.querySelector('.cart-subtotal .amount');
    if(list){
      const items = read();
      list.innerHTML = '';
      if(!items.length){
        list.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
      } else {
        items.forEach(i => {
          const row = document.createElement('div');
          row.className = 'cart-item';
          row.innerHTML = `
            <div class="cart-item__media">${teeMediaMarkup(i)}</div>
            <div class="cart-item__meta">
              <div class="name">${i.name}</div>
              <div class="opts">Size ${i.size} &middot; Qty ${i.qty}</div>
            </div>
            <div class="cart-item__price">$${(i.price * i.qty).toFixed(0)}</div>
            <button class="cart-item__remove" aria-label="Remove" data-id="${i.id}" data-size="${i.size}">&times;</button>
          `;
          list.appendChild(row);
        });
      }
      if(sub) sub.textContent = `$${subtotal().toFixed(0)}`;
      list.querySelectorAll('.cart-item__remove').forEach(btn => {
        btn.addEventListener('click', () => remove(btn.dataset.id, btn.dataset.size));
      });
    }

    renderCheckout();
  }

  /* ---------- checkout page: order summary ---------- */
  function renderCheckout(){
    const list = document.querySelector('.checkout-items');
    if(!list) return;

    const items = read();
    const placeOrderBtn = document.getElementById('reveal-payment-btn');
    list.innerHTML = '';
    if(!items.length){
      list.innerHTML = '<p class="cart-empty">Your bag is empty. <a href="shop.html">Continue shopping</a>.</p>';
      if(placeOrderBtn) placeOrderBtn.disabled = true;
    } else {
      items.forEach(i => {
        const row = document.createElement('div');
        row.className = 'order-item';
        row.innerHTML = `
          <div class="order-item__media">${teeMediaMarkup(i)}</div>
          <div class="order-item__meta">
            <div class="name">${i.name}</div>
            <div class="opts">Size ${i.size} &middot; Qty ${i.qty}</div>
          </div>
          <div class="order-item__price">$${(i.price * i.qty).toFixed(2)}</div>
        `;
        list.appendChild(row);
      });
      if(placeOrderBtn) placeOrderBtn.disabled = false;
    }

    const sub = subtotal();
    const shipping = sub === 0 ? 0 : (sub >= 100 ? 0 : 8);
    const total = sub + shipping;
    const subEl = document.querySelector('.checkout-subtotal .amount');
    const shipEl = document.querySelector('.checkout-shipping .amount');
    const totalEl = document.querySelector('.checkout-total .amount');
    if(subEl) subEl.textContent = `$${sub.toFixed(2)}`;
    if(shipEl) shipEl.textContent = shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}`;
    if(totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    document.querySelectorAll('[data-cart-open]').forEach(el => el.addEventListener('click', open));
    document.querySelectorAll('[data-cart-close]').forEach(el => el.addEventListener('click', close));
    document.querySelector('.cart-overlay')?.addEventListener('click', close);

    const checkoutForm = document.getElementById('checkout-form');
    const revealPaymentBtn = document.getElementById('reveal-payment-btn');
    const paymentSection = document.getElementById('checkout-payment');

    revealPaymentBtn?.addEventListener('click', () => {
      if(!read().length) return;
      if(!checkoutForm.checkValidity()){ checkoutForm.reportValidity(); return; }
      paymentSection.querySelectorAll('input').forEach(el => el.disabled = false);
      revealPaymentBtn.hidden = true;
      paymentSection.hidden = false;
      paymentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /* ---------- card brand detection ---------- */
    const CARD_BRAND_HTML = {
      visa: '<span class="payment-badge payment-badge--visa">VISA</span>',
      mastercard: '<span class="payment-badge payment-badge--mastercard"><span class="mc-circle red"></span><span class="mc-circle orange"></span></span>',
      amex: '<span class="payment-badge payment-badge--amex">AMEX</span>',
      discover: '<span class="payment-badge payment-badge--discover">DISCOVER</span>'
    };
    function detectCardBrand(digits){
      if(/^4/.test(digits)) return 'visa';
      if(/^(5[1-5]|2(2[2-9]\d|[3-6]\d\d|7[01]\d|720))/.test(digits)) return 'mastercard';
      if(/^3[47]/.test(digits)) return 'amex';
      if(/^(6011|65|64[4-9]|622(1[2-9]\d|[2-8]\d\d|9([01]\d|2[0-5])))/.test(digits)) return 'discover';
      return null;
    }
    const cardNumberInput = document.getElementById('card-number');
    const cardBrandIcon = document.getElementById('card-brand-icon');
    cardNumberInput?.addEventListener('input', () => {
      const digits = cardNumberInput.value.replace(/\D/g, '');
      const brand = detectCardBrand(digits);
      cardBrandIcon.innerHTML = brand ? CARD_BRAND_HTML[brand] : '';
    });

    checkoutForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      if(!read().length) return;
      const orderNumber = 'PL-' + Math.floor(100000 + Math.random() * 900000);
      const confirm = document.querySelector('.checkout-confirm');
      confirm.querySelector('[data-order-number]').textContent = `#${orderNumber}`;
      checkoutForm.closest('section').hidden = true;
      confirm.hidden = false;
      localStorage.removeItem(KEY);
      render();
    });
  });

  window.PLCart = { add, remove, setQty, count, subtotal, open, close, read };
})();
