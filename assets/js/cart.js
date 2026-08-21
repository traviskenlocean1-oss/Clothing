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
  // 200 unique single-batch codes, 15% off each -- generated 2026-08-21 for
  // the "Join The Family" popup incentive. Must mirror worker/handlers.js's
  // copy exactly (that copy is what the server actually trusts for the real
  // charge amount; this one only drives the checkout-page preview/UI).
  // NOTE: nothing currently stops a code from being reused indefinitely --
  // these values only control the *discount percentage*, there's no
  // redemption tracking yet.
  const DISCOUNT_CODES = {
    'BROKENHEARTJE37': 15,
    'CHAOS6RPZ': 15,
    'CHAOSBV27': 15,
    'BROKENHEART8TWS': 15,
    'PSYCHOTICG22J': 15,
    'PSYCHOPMU7': 15,
    'PSYCHOTICKFKK': 15,
    'FOREVERFGEV': 15,
    'PSYCHOTICAJS7': 15,
    'CHAOSGTJV': 15,
    'BROKENHEARTK6CY': 15,
    'FOREVER7MPZ': 15,
    'FOREVERN6H6': 15,
    'LOVEHURTSWFJ9': 15,
    'BROKENHEARTUTHW': 15,
    'FOREVER6P2H': 15,
    'PSYCHONGBD': 15,
    'FOREVERPTEQ': 15,
    'PSYCHOTICN5NB': 15,
    'BROKENHEARTAQ4E': 15,
    'PSYCHOTICXDVA': 15,
    'CHAOSXTHE': 15,
    'FOREVEREG4Y': 15,
    'PSYCHO7F29': 15,
    'FOREVEREPXA': 15,
    'BROKENHEARTNWQV': 15,
    'FOREVERD9WS': 15,
    'PSYCHOTICXJD4': 15,
    'FOREVERG45A': 15,
    'BROKENHEARTCYEU': 15,
    'PSYCHOTICGNXD': 15,
    'PSYCHOMQUD': 15,
    'FOREVERARG9': 15,
    'CHAOSM63F': 15,
    'FOREVER73H6': 15,
    'PSYCHO87GJ': 15,
    'CHAOSZTDH': 15,
    'PSYCHOFGEK': 15,
    'PSYCHOTICV6PW': 15,
    'FOREVERHGPT': 15,
    'PSYCHOTICA3T7': 15,
    'FOREVER3C38': 15,
    'LOVEHURTS53C7': 15,
    'LOVEHURTSMPY3': 15,
    'LOVEHURTSQYEF': 15,
    'LOVEHURTS9FPD': 15,
    'FOREVERWCQG': 15,
    'PSYCHOTICKXW4': 15,
    'BROKENHEARTFKTK': 15,
    'BROKENHEARTMM5C': 15,
    'PSYCHOTICYT4M': 15,
    'FOREVERN5B4': 15,
    'FOREVER88JD': 15,
    'PSYCHO23DY': 15,
    'PSYCHOTJQ4': 15,
    'FOREVER8HYC': 15,
    'CHAOS64QG': 15,
    'LOVEHURTSNMWM': 15,
    'PSYCHOTICHX35': 15,
    'LOVEHURTSWYU2': 15,
    'CHAOSVM8G': 15,
    'CHAOS7D4V': 15,
    'FOREVERJYDE': 15,
    'FOREVERDDSP': 15,
    'LOVEHURTSKACF': 15,
    'FOREVERG472': 15,
    'BROKENHEARTEU9N': 15,
    'PSYCHOUVKH': 15,
    'PSYCHOEQ2C': 15,
    'BROKENHEARTN4JP': 15,
    'LOVEHURTSYRCB': 15,
    'CHAOS5U4E': 15,
    'FOREVER6FQA': 15,
    'CHAOSCXAZ': 15,
    'FOREVERKTSM': 15,
    'FOREVER3DG7': 15,
    'FOREVERRDQF': 15,
    'PSYCHOTICBAB5': 15,
    'LOVEHURTS5SXQ': 15,
    'PSYCHOUYYS': 15,
    'LOVEHURTSZF8G': 15,
    'PSYCHOTICE84K': 15,
    'FOREVERKFV5': 15,
    'PSYCHOH7GR': 15,
    'CHAOSX9RQ': 15,
    'PSYCHOTICUMNG': 15,
    'BROKENHEART4HV2': 15,
    'PSYCHOTIC5VVC': 15,
    'PSYCHOTICB387': 15,
    'PSYCHOGESU': 15,
    'BROKENHEARTV4KS': 15,
    'LOVEHURTSMDRG': 15,
    'CHAOS65CK': 15,
    'LOVEHURTSR5SE': 15,
    'FOREVERM36E': 15,
    'PSYCHOTICYYW2': 15,
    'BROKENHEARTZJR7': 15,
    'PSYCHOFUSN': 15,
    'BROKENHEARTUTN6': 15,
    'PSYCHOTICY2CJ': 15,
    'LOVEHURTS68NB': 15,
    'LOVEHURTSUTQ9': 15,
    'PSYCHOTICVWCC': 15,
    'FOREVERKGGY': 15,
    'CHAOSP4C8': 15,
    'PSYCHOTICR5MN': 15,
    'LOVEHURTSWE9Q': 15,
    'LOVEHURTSC7D9': 15,
    'PSYCHOTIC8JVJ': 15,
    'FOREVERJKXW': 15,
    'BROKENHEARTBCSJ': 15,
    'BROKENHEARTYUW6': 15,
    'PSYCHOW8ZU': 15,
    'PSYCHOTICXJJ4': 15,
    'CHAOSYSMH': 15,
    'BROKENHEART6XXD': 15,
    'BROKENHEARTCA9N': 15,
    'PSYCHOTICAEXK': 15,
    'CHAOSG4YM': 15,
    'CHAOSUEPK': 15,
    'BROKENHEARTCVZQ': 15,
    'BROKENHEARTXWAJ': 15,
    'BROKENHEARTXEKJ': 15,
    'LOVEHURTSNSNS': 15,
    'BROKENHEART4GKT': 15,
    'LOVEHURTSCJF7': 15,
    'FOREVERHWK3': 15,
    'LOVEHURTSHSC5': 15,
    'PSYCHOTICYK7T': 15,
    'PSYCHOPQNK': 15,
    'CHAOSME8F': 15,
    'CHAOSZNAJ': 15,
    'LOVEHURTS7P95': 15,
    'CHAOSJJNG': 15,
    'FOREVERZAVR': 15,
    'PSYCHOTICBA96': 15,
    'FOREVEREJ2U': 15,
    'PSYCHOTIC9AVC': 15,
    'FOREVERCZQY': 15,
    'PSYCHOVNYX': 15,
    'LOVEHURTSNHHU': 15,
    'FOREVERR3SD': 15,
    'BROKENHEARTXB8P': 15,
    'PSYCHOTIC2XAS': 15,
    'LOVEHURTSYMJD': 15,
    'CHAOSN26R': 15,
    'BROKENHEART8WBQ': 15,
    'CHAOS95U9': 15,
    'PSYCHOSG3D': 15,
    'BROKENHEARTU3M6': 15,
    'LOVEHURTST3RZ': 15,
    'BROKENHEART3N9U': 15,
    'CHAOS77D5': 15,
    'PSYCHOYW2A': 15,
    'LOVEHURTSMJ3K': 15,
    'LOVEHURTSJ4FT': 15,
    'PSYCHOSNPQ': 15,
    'PSYCHOB2TQ': 15,
    'CHAOSWBVP': 15,
    'CHAOSP7YU': 15,
    'LOVEHURTSDASZ': 15,
    'LOVEHURTSEM9T': 15,
    'FOREVERMSG6': 15,
    'FOREVERMJGG': 15,
    'PSYCHORHFB': 15,
    'PSYCHO8KSH': 15,
    'BROKENHEARTAKJV': 15,
    'CHAOSASEC': 15,
    'CHAOS48KU': 15,
    'CHAOSESWK': 15,
    'CHAOS8YEC': 15,
    'BROKENHEARTT6Q4': 15,
    'BROKENHEARTXQGR': 15,
    'CHAOSFVB6': 15,
    'BROKENHEARTJS5M': 15,
    'PSYCHOMYFE': 15,
    'PSYCHOTICQPRB': 15,
    'CHAOSSPPC': 15,
    'PSYCHOJNCZ': 15,
    'CHAOSC55V': 15,
    'PSYCHOTICPTQD': 15,
    'CHAOSEBQH': 15,
    'BROKENHEARTJD4N': 15,
    'FOREVERQ8R8': 15,
    'LOVEHURTSNG4D': 15,
    'LOVEHURTSY62U': 15,
    'CHAOS7ZC2': 15,
    'BROKENHEARTP4MR': 15,
    'LOVEHURTSTFDG': 15,
    'LOVEHURTSQ6HG': 15,
    'PSYCHOTIC5TEM': 15,
    'PSYCHOTIC8DZ3': 15,
    'PSYCHOTICBG2W': 15,
    'LOVEHURTSPEY4': 15,
    'FOREVERK273': 15,
    'FOREVERFSPB': 15,
    'PSYCHOTICQYQ4': 15,
    'CHAOSYHW7': 15,
    'PSYCHOTICZ6RR': 15,
    'PSYCHOTICPMW5': 15,
  };
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
    const shipping = sub === 0 ? 0 : (sub >= 100 ? 0 : 8);
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
    discountApplyBtn?.addEventListener('click', () => {
      const code = discountInput.value.trim().toUpperCase();
      if(!code) return;
      const percent = DISCOUNT_CODES[code];
      if(percent){
        appliedDiscount = { code, percent };
        discountMessage.textContent = `"${code}" applied — ${percent}% off.`;
        discountMessage.classList.remove('is-error');
        discountInput.value = '';
      } else {
        discountMessage.textContent = "That code doesn't look right.";
        discountMessage.classList.add('is-error');
      }
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
