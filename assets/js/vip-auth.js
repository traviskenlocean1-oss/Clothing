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
  let recoverPhone = null;

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
      location.href = '/vip';
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
    location.href = '/vip';
  });

  bindForm('ticket', async (form) => {
    await postJson('/api/vip/login-ticket', { ticket: form.ticket.value.trim() });
    location.href = '/vip';
  });

  bindForm('recover-phone', async (form) => {
    const phone = form.phone.value.trim();
    const data = await postJson('/api/vip/recover', { phone });
    if (data.ticket) {
      showWelcome(data);
    } else if (data.verified) {
      location.href = '/vip';
    } else {
      recoverPhone = phone;
      showState('recover-otp');
    }
  });

  bindForm('recover-otp', async (form) => {
    const data = await postJson('/api/vip/recover-verify', {
      phone: recoverPhone,
      code: form.code.value.trim()
    });
    showWelcome(data);
  });

  bindForm('admin', async (form) => {
    await postJson('/api/vip/admin-login', { phone: form.phone.value.trim() });
    location.href = '/vip';
  });

  root.querySelector('.vip-auth__enter').addEventListener('click', () => {
    location.href = '/vip';
  });
})();
