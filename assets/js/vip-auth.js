// assets/js/vip-auth.js
(function () {
  const root = document.getElementById('vip-auth');
  if (!root) return;

  function showState(name) {
    root.querySelectorAll('.vip-auth__state').forEach(el => {
      el.classList.toggle('is-active', el.dataset.state === name);
    });
  }

  root.querySelectorAll('[data-show]').forEach(btn => {
    btn.addEventListener('click', () => showState(btn.dataset.show));
  });

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function showWelcome(data) {
    const msgEl = root.querySelector('.vip-auth__welcome-msg');
    const ticketWrap = root.querySelector('.vip-auth__ticket-display');
    msgEl.textContent = data.isNewMember
      ? `Thank you so much for becoming a VIP member, ${data.name}!`
      : `Welcome back, ${data.name}. Here's your ticket again:`;
    if (data.ticket) {
      ticketWrap.hidden = false;
      ticketWrap.querySelector('.vip-auth__ticket-code').textContent = data.ticket;
    } else {
      ticketWrap.hidden = true;
    }
    showState('welcome');
  }

  function bindForm(stateName, onSubmit) {
    const form = root.querySelector(`[data-state="${stateName}"]`);
    if (!form || form.tagName !== 'FORM') return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = form.querySelector('.vip-auth__error');
      errorEl.textContent = '';
      try {
        await onSubmit(form);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  let pendingPhone = null;

  bindForm('signup', async (form) => {
    const payload = {
      name: form.name.value.trim(),
      username: form.username.value.trim(),
      password: form.password.value,
      phone: form.phone.value.trim()
    };
    const data = await postJson('/api/vip/signup', payload);
    if (data.ticket) {
      showWelcome(data);
    } else if (data.verified) {
      location.href = '/vip-enter';
    } else {
      pendingPhone = payload.phone;
      showState('otp');
    }
  });

  bindForm('otp', async (form) => {
    const data = await postJson('/api/vip/verify-otp', {
      phone: pendingPhone,
      code: form.code.value.trim()
    });
    showWelcome(data);
  });

  bindForm('login', async (form) => {
    await postJson('/api/vip/login', {
      username: form.username.value.trim(),
      password: form.password.value,
      rememberMe: form.rememberMe.checked
    });
    location.href = '/vip-enter';
  });

  bindForm('ticket', async (form) => {
    await postJson('/api/vip/login-ticket', { ticket: form.ticket.value.trim().toUpperCase() });
    location.href = '/vip-enter';
  });

  bindForm('recover-phone', async (form) => {
    const data = await postJson('/api/vip/recover', { phone: form.phone.value.trim() });
    showWelcome(data);
  });

  bindForm('admin', async (form) => {
    await postJson('/api/vip/admin-login', { phone: form.phone.value.trim() });
    location.href = '/vip-enter';
  });

  root.querySelector('.vip-auth__enter').addEventListener('click', () => {
    location.href = '/vip-enter';
  });

  root.querySelector('.vip-auth__continue').addEventListener('click', () => {
    location.href = '/vip-enter';
  });

  // The gate shell always shows first, even for an already-authenticated
  // visitor -- this check is what lets a remembered visitor skip straight
  // to a one-tap "Continue to VIP" instead of the Sign Up/Log In choice.
  fetch('/api/vip/status', { credentials: 'same-origin' })
    .then(res => res.json())
    .then(data => { if (data.authenticated) showState('welcome-back'); })
    .catch(() => {});
})();
