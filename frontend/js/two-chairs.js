/* Экран входа в режим «Два стула»: выбор сценария + незавершённый план + история пар. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(NTData.HISTORY_KEY) || '[]'); } catch (_) { return []; }
  }

  Promise.all([NTData.listScenarios(), NTData.listEditableScenarios().catch(() => [])]).then(([catalog, editable]) => {
    const select = $('tc-scenario-select');
    const seen = new Set();
    const rows = [];
    catalog.forEach((s) => { if (!seen.has(s.id)) { seen.add(s.id); rows.push({ s, own: false }); } });
    editable.forEach((raw) => {
      if (seen.has(raw.id)) return;
      seen.add(raw.id);
      NTData.getScenario ? rows.push({ id: raw.id, title: raw.title, own: true }) : null;
    });
    select.innerHTML = '<option value="">— выберите сценарий —</option>'
      + rows.map(({ s, id, title, own }) => {
        const sid = s ? s.id : id;
        const name = s ? s.title : title;
        return `<option value="${esc(sid)}">${esc(name)}${own ? ' · ваш сценарий' : ''}</option>`;
      }).join('')
      + '<option value="__custom__">Свой пользовательский сценарий → откроется конструктор</option>';
    select.onchange = () => {
      if (select.value === '__custom__') location.href = 'scenario-studio.html?two-chairs=1';
    };
    $('tc-start-btn').onclick = (event) => {
      event.preventDefault();
      const value = select.value;
      if (!value || value === '__custom__') { select.focus(); return; }
      location.href = 'two-chairs-prelaunch.html?scenario=' + encodeURIComponent(value);
    };
  }).catch((error) => {
    document.querySelector('.tc-card').insertAdjacentHTML('afterbegin', `<p class="tc-error">${esc(error.message)}</p>`);
  });

  /* Незавершённый план — предложить продолжить */
  const plan = NTData.getTwoChairsPlan();
  if (plan && !plan.completed) {
    const card = $('tc-resume-card');
    card.hidden = false;
    const stageText = plan.round2Done ? 'режим завершён — откройте сравнительный анализ'
      : plan.round1Done ? 'диалог 1 сыгран — начните диалог 2' : 'готов к запуску — начните диалог 1';
    $('tc-resume-body').innerHTML = `
      <p><b>${esc(plan.title || 'Сценарий')}</b> — ${esc(stageText)}.</p>
      <div class="tc-actions">
        <a class="btn btn--primary" href="${plan.round1Done && !plan.round2Done ? 'two-chairs-pause.html' : plan.round2Done ? 'two-chairs-compare.html?pair=' + encodeURIComponent(plan.pairId) : 'two-chairs-prelaunch.html?scenario=' + encodeURIComponent(plan.scenarioId)}">Продолжить</a>
        <button class="btn btn--ghost" type="button" id="tc-forget">Забыть план</button>
      </div>`;
    $('tc-forget').onclick = () => { NTData.clearTwoChairsPlan(); card.hidden = true; };
  }

  /* Пройденные пары (записи истории с пометкой «2 стула») */
  const pairs = loadHistory().filter((item) => item.twoChairs);
  if (pairs.length) {
    $('tc-history').innerHTML = pairs.map((item) => `
      <a href="two-chairs-compare.html?pair=${encodeURIComponent(item.pairId || item.id)}">
        <span><b>${esc(item.title || 'Сценарий')}</b><br><small class="tc-muted">2 стула · ${item.complete ? 'анализ готов' : 'раунд ' + (item.round || 1) + ' из 2'}</small></span>
        <span aria-hidden="true">→</span>
      </a>`).join('');
  }
})();
