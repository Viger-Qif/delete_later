(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATUS_LABELS = {
    success: 'успешно',
    failure: 'неуспешно',
    abandoned: 'прервано',
    active: 'в процессе'
  };
  function renderResults(rows) {
    const host = $('profile-results');
    if (!rows.length) { host.innerHTML = '<p class="muted">Пока нет завершённых попыток. Начните тренировку в каталоге.</p>'; return; }
    host.innerHTML = rows.slice(0, 5).map((row) => `<div class="profile-row"><a href="results.html?id=${encodeURIComponent(row.id)}">${esc(row.scenario_title || row.scenario_id)}</a><small>${esc(row.score ?? '—')} баллов · ${esc(STATUS_LABELS[row.status] || 'завершено')}</small></div>`).join('');
  }
  function renderScenarios(rows) {
    const host = $('profile-scenarios-list');
    const own = rows.filter((row) => row.scenario_type === 'user' || row.owner_id === 'guest');
    if (!own.length) { host.innerHTML = '<p class="muted">Вы ещё не создали сценарий.</p>'; return; }
    host.innerHTML = own.slice(0, 8).map((row) => `<div class="profile-row"><a href="scenario.html?scenario=${encodeURIComponent(row.id)}">${esc(row.title)}</a><small>${row.published ? 'опубликован' : 'черновик'}</small></div>`).join('');
  }
  Promise.all([NTData.authMe(), NTData.listResults().catch(() => []), NTData.listEditableScenarios().catch(() => [])]).then(([auth, results, scenarios]) => {
    if (auth.user) {
      $('profile-name').textContent = auth.user.display_name || auth.user.email;
      $('profile-email').textContent = auth.user.email;
      $('profile-avatar').textContent = (auth.user.display_name || auth.user.email).slice(0, 2).toUpperCase();
      $('profile-auth-link').hidden = true; $('logout-btn').hidden = false;
    }
    const scores = results.map((x) => Number(x.score)).filter((x) => Number.isFinite(x));
    $('profile-attempts').textContent = results.length;
    $('profile-score').textContent = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—';
    $('profile-scenarios').textContent = scenarios.filter((x) => x.scenario_type === 'user').length;
    renderResults(results); renderScenarios(scenarios);
  }).catch((error) => { $('profile-results').innerHTML = `<p class="muted">${esc(error.message)}</p>`; });
  $('logout-btn').addEventListener('click', () => NTData.logout().then(() => location.href = 'index.html'));
  const privacyInfo = NTData.localPrivacyInfo();
  $('privacy-local-count').textContent = `${privacyInfo.count} записей · ${privacyInfo.retentionDays} дней`;
  $('privacy-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(NTData.exportLocalHistory(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `negotiation-lab-local-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $('privacy-status').textContent = 'Локальная история экспортирована.';
  });
  $('privacy-clear').addEventListener('click', () => {
    if (!confirm('Удалить локальные тексты диалогов и персональные разборы из этого браузера? Баллы и статусы на сервере останутся.')) return;
    NTData.clearLocalHistory();
    $('privacy-local-count').textContent = `0 записей · ${privacyInfo.retentionDays} дней`;
    $('privacy-status').textContent = 'Локальная история удалена.';
  });
  $('privacy-delete-account').addEventListener('click', async () => {
    if (!confirm('Безвозвратно удалить аккаунт, серверные агрегаты, активные сессии и черновики сценариев?')) return;
    try {
      await NTData.deleteAccount();
      NTData.clearLocalHistory();
      location.href = 'index.html';
    } catch (error) {
      $('privacy-status').textContent = error.message;
    }
  });
})();