(function () {
  'use strict';
  const form = document.querySelector('[data-auth-form]');
  if (!form) return;
  const error = document.querySelector('[data-auth-error]');
  const submit = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = ''; submit.disabled = true;
    const body = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.authMode === 'register' && body.password !== body.confirm_password) {
      error.textContent = 'Пароли не совпадают'; submit.disabled = false; return;
    }
    delete body.confirm_password;
    try {
      const response = await fetch(`/api/auth/${form.dataset.authMode}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Не удалось выполнить операцию');
      const next = new URLSearchParams(location.search).get('next') || 'profile.html';
      location.href = /^(?:[a-z]+:|\/\/)/i.test(next) ? 'profile.html' : next;
    } catch (err) {
      error.textContent = window.NTData ? NTData.errorMessage(err, err.status || 0) : (navigator.onLine ? 'Не удалось выполнить операцию.' : 'Нет подключения к интернету.');
      submit.disabled = false;
    }
  });
})();