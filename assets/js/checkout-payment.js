/* Psychotic Love — Clover Ecommerce payment integration (checkout.html only).
   Card number/expiry/cvv/postal are Clover's own hosted iframe fields, not
   plain <input> elements -- raw card data goes straight from the customer's
   browser into Clover's iframe and never touches this page's JS or our
   server, only a one-time token does. The actual charge happens server-side
   in worker/handlers.js (handleCharge), which is the only place the private
   key is ever used. */
(function () {
  // TODO: fill in the real Merchant ID from the Clover dashboard (the
  // public key alone isn't enough to initialize the SDK). Everything below
  // is wired and ready -- this is the one placeholder left before checkout
  // can actually take a real card.
  const CLOVER_PUBLIC_KEY = 'da2e75fcbc1a7c4c9991fb9217f5762f';
  const CLOVER_MERCHANT_ID = 'PASTE_MERCHANT_ID_HERE';

  const form = document.getElementById('checkout-form');
  const finishBtn = document.getElementById('finish-checkout-btn');
  const errorEl = document.getElementById('checkout-payment-error');
  if (!form || typeof Clover === 'undefined') return;

  const clover = new Clover(CLOVER_PUBLIC_KEY, { merchantId: CLOVER_MERCHANT_ID });
  const elements = clover.elements();
  const fieldStyle = {
    input: { 'font-family': 'Archivo, sans-serif', 'font-size': '14px', color: '#111' },
    '::placeholder': { color: '#8a8478' }
  };
  const cardNumber = elements.create('CARD_NUMBER', fieldStyle);
  const cardDate = elements.create('CARD_DATE', fieldStyle);
  const cardCvv = elements.create('CARD_CVV', fieldStyle);
  const cardPostal = elements.create('CARD_POSTAL_CODE', fieldStyle);
  cardNumber.mount('#clover-card-number');
  cardDate.mount('#clover-card-date');
  cardCvv.mount('#clover-card-cvv');
  cardPostal.mount('#clover-card-postal');

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function readCartItems() {
    // window.PLCart.read() gives [{id, size, qty, price, name, image}, ...]
    // -- only id/size/qty go to the server, which looks up its own prices
    // rather than trusting whatever's in this client-side cart.
    return (window.PLCart ? window.PLCart.read() : []).map(i => ({ id: i.id, size: i.size, qty: i.qty }));
  }

  form.addEventListener('submit', async (e) => {
    const paymentSection = document.getElementById('checkout-payment');
    if (paymentSection.hidden) return; // still on the shipping step, not payment yet
    e.preventDefault();
    clearError();

    const items = readCartItems();
    if (!items.length) { showError('Your bag is empty.'); return; }

    finishBtn.disabled = true;
    finishBtn.querySelector('span').textContent = 'Processing…';

    let tokenResult;
    try {
      tokenResult = await clover.createToken();
    } catch (err) {
      finishBtn.disabled = false;
      finishBtn.querySelector('span').textContent = 'Finish Checkout';
      showError('Could not read your card details. Check them and try again.');
      return;
    }
    if (tokenResult.errors) {
      finishBtn.disabled = false;
      finishBtn.querySelector('span').textContent = 'Finish Checkout';
      const firstError = Object.values(tokenResult.errors)[0];
      showError(firstError || 'Check your card details and try again.');
      return;
    }

    try {
      const res = await fetch('/api/checkout/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenResult.token,
          items,
          discountCode: window.PLCart ? window.PLCart.appliedDiscountCode() : null
        })
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Your card was declined. Try a different card.');
      }

      const confirm = document.querySelector('.checkout-confirm');
      confirm.querySelector('[data-order-number]').textContent = `#${result.orderNumber}`;
      form.closest('section').hidden = true;
      confirm.hidden = false;
      window.PLCart && window.PLCart.completeOrder();
    } catch (err) {
      showError(err.message || 'Something went wrong processing your payment. Try again.');
    } finally {
      finishBtn.disabled = false;
      finishBtn.querySelector('span').textContent = 'Finish Checkout';
    }
  });
})();
