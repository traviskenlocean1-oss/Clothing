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

  /* ---------- discount codes ---------- */
  // No local code list anymore -- the "Apply" button calls the server
  // (POST /api/checkout/validate-code), which is also the sole source of
  // truth checked again at charge time. Keeping codes/redemption state only
  // server-side avoids exactly the kind of drift the old two-copy setup
  // risked, and lets redemption actually be enforced (see worker/store.js's
  // DISCOUNT_REDEMPTIONS KV).
  let appliedDiscount = null; // { code, percent } | null
  function discountAmount(sub){ return appliedDiscount ? sub * (appliedDiscount.percent / 100) : 0; }
  function appliedDiscountCode(){ return appliedDiscount ? appliedDiscount.code : null; }

  // Called by checkout-payment.js after a real charge succeeds -- clears the
  // cart and any applied discount together so neither leaks into the next
  // order (mirrors what the old fake-instant-confirm handler used to do).
  function completeOrder(){
    localStorage.removeItem(KEY);
    appliedDiscount = null;
    render();
  }

  function open(){
    document.querySelector('.cart-drawer')?.classList.add('is-open');
    document.querySelector('.cart-overlay')?.classList.add('is-open');
  }
  function close(){
    document.querySelector('.cart-drawer')?.classList.remove('is-open');
    document.querySelector('.cart-overlay')?.classList.remove('is-open');
  }

  function teeMediaMarkup(i){
    return i.image ? `<img src="${i.image}" alt="" style="width:100%;height:100%;object-fit:contain">` : '';
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
    const discount = discountAmount(sub);
    // Free-shipping threshold checks the pre-discount subtotal -- otherwise
    // stacking a big discount could flip already-qualified free shipping
    // back to paid.
    const shipping = sub === 0 ? 0 : (sub >= 100 ? 0 : 7);
    const total = Math.max(0, sub - discount) + shipping;
    const subEl = document.querySelector('.checkout-subtotal .amount');
    const discountRow = document.querySelector('.checkout-discount');
    const shipEl = document.querySelector('.checkout-shipping .amount');
    const totalEl = document.querySelector('.checkout-total .amount');
    if(subEl) subEl.textContent = `$${sub.toFixed(2)}`;
    if(discountRow){
      discountRow.hidden = !appliedDiscount;
      if(appliedDiscount){
        discountRow.querySelector('.discount-label').textContent = `Discount (${appliedDiscount.code})`;
        discountRow.querySelector('.amount').textContent = `−$${discount.toFixed(2)}`;
      }
    }
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

    const discountInput = document.getElementById('discount-code');
    const discountApplyBtn = document.getElementById('discount-apply');
    const discountMessage = document.getElementById('discount-message');
    discountApplyBtn?.addEventListener('click', async () => {
      const code = discountInput.value.trim().toUpperCase();
      if(!code) return;
      discountApplyBtn.disabled = true;
      try {
        const res = await fetch('/api/checkout/validate-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const result = await res.json();
        if(result.valid){
          appliedDiscount = { code: result.code, percent: result.percent };
          discountMessage.textContent = `"${result.code}" applied — ${result.percent}% off.`;
          discountMessage.classList.remove('is-error');
          discountInput.value = '';
        } else {
          discountMessage.textContent = result.error || "That code doesn't look right.";
          discountMessage.classList.add('is-error');
        }
      } catch(e) {
        discountMessage.textContent = "Couldn't check that code right now. Try again.";
        discountMessage.classList.add('is-error');
      }
      discountApplyBtn.disabled = false;
      renderCheckout();
    });

    revealPaymentBtn?.addEventListener('click', () => {
      if(!read().length) return;
      if(!checkoutForm.checkValidity()){ checkoutForm.reportValidity(); return; }
      paymentSection.querySelectorAll('input').forEach(el => el.disabled = false);
      revealPaymentBtn.hidden = true;
      paymentSection.hidden = false;
      paymentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Real submit handling (tokenize card, charge server-side) lives in
    // assets/js/checkout-payment.js, loaded only on checkout.html -- card
    // number/expiry/cvv are Clover's own hosted iframe fields now, not
    // plain inputs this file can read.
  });

  window.PLCart = { add, remove, setQty, count, subtotal, open, close, read, appliedDiscountCode, completeOrder };
})();
