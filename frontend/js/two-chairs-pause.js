/* ============================================================
   Экран паузы режима «Два стула» (two-chairs-pause.html).
   Показывает итог диалога 1, новую роль пользователя и запускает
   диалог 2 на ИНВЕРТИРОВАННОМ сценарии пары.
   Данные — из локальной записи пары (NTData.findTwoChairsRecord)
   и плана (NTData.getTwoChairsPlan); при необходимости подтягиваем
   оба сценария пары с бэкенда.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  function verdict(interest, ended) {
    if (ended === 'exit') return { icon: '✗', cls: 'tc-verdict--muted', text: 'Диалог прерван' };
    if (interest >= 70) return { icon: '✓', cls: 'tc-verdict--success', text: 'Договорённость близка' };
    if (interest >= 45) return { icon: '⚠', cls: 'tc-verdict--warning', text: 'Собеседник настороже' };
    return { icon: '✗', cls: 'tc-verdict--muted', text: 'Переговоры не сложились' };
  }

  let plan = NTData.refreshTwoChairsPlan() || NTData.getTwoChairsPlan();
  const pairId = params.get('pair') || (plan && plan.pairId);

  function recordOf() {
    return (pairId && NTData.findTwoChairsRecord(pairId)) || null;
  }

  /* Если раунд 1 ещё не сохранён, но план говорит об обратном — чистим флаг */
  function syncFlagsFromRecord() {
    plan = NTData.refreshTwoChairsPlan() || plan;
  }

  function render(record, baseSc, invSc) {
    const r1 = record && record.firstRound ? record.firstRound : (record || {});
    if (!r1 || !r1.sessionId) {
      $('tc-summary').innerHTML = '<p class="tc-error">Итог диалога 1 не найден в этом браузере. <a href="two-chairs-prelaunch.html?scenario=' +
        encodeURIComponent((plan && plan.scenarioId) || '') + '">Начать диалог 1 заново</a>.</p>';
      $('tc-start2-btn').disabled = true;
      return;
    }
    const v = verdict(r1.interest ?? 0, r1.ended);
    $('tc-summary').innerHTML = `
      <h2 class="tc-card__title">Итог диалога 1</h2>
      <p class="tc-verdict ${v.cls}"><span aria-hidden="true">${v.icon}</span> ${esc(v.text)}</p>
      <div class="tc-bar">
        <div class="tc-bar__label"><span>Финальная заинтересованность</span><b>${Number(r1.interest) || 0}%</b></div>
        <div class="tc-bar__track"><div class="tc-bar__fill" style="width:${Math.max(3, Number(r1.interest) || 0)}%"></div></div>
      </div>
      <p class="tc-muted">${Number.isFinite(Number(r1.score)) ? 'Оценка разборa: <b>' + r1.score + ' баллов</b> · ' : ''}Роль была: <b>${esc(baseSc ? baseSc.userRole : (r1.title || '—'))}</b></p>`;

    const yourNewRole = invSc ? invSc.userRole : 'Роль собеседника из диалога 1';
    const theirRole = invSc ? invSc.counterpart : (baseSc ? baseSc.userRole : '—');
    const goal2 = invSc ? invSc.goal : '';
    $('tc-swap-body').innerHTML = `
      <p class="tc-muted">Ваша новая роль в диалоге 2</p>
      <p class="tc-role-big">${esc(yourNewRole)}</p>
      <dl class="tc-kv">
        <dt>Роль собеседника</dt><dd>${esc(theirRole)}</dd>
        <dt>Ваша цель в диалоге 2</dt><dd>${esc(goal2 || 'Отстояте интересы этой стороны так же убедительно, как в первом диалоге.')}</dd>
      </dl>
      <p class="tc-muted">Граф переговоров тот же — меняются только стулья.</p>`;

    $('tc-review-btn').onclick = (event) => {
      event.preventDefault();
      location.href = 'results.html?id=' + encodeURIComponent(r1.sessionId) + '&from=two-chairs&pair=' + encodeURIComponent(pairId || '');
    };

    $('tc-start2-btn').onclick = async () => {
      const button = $('tc-start2-btn');
      if (!plan || !plan.invertedId) { button.disabled = true; button.textContent = 'Пара не найдена'; return; }
      button.disabled = true; button.textContent = 'Запускаю…';
      syncFlagsFromRecord();
      plan.round = 2;
      plan.round2Done = false;
      plan.completed = false;
      NTData.saveTwoChairsPlan(plan);
      localStorage.setItem('nt_session_config', JSON.stringify({
        scenario: plan.invertedId, mode: plan.mode, difficultyMode: plan.difficultyMode,
        engineMode: plan.engineMode, targetTurns: plan.targetTurns, twoChairsRound: 2
      }));
      location.href = (plan.mode === 'audio' ? 'session-audio.html' : 'session.html') + '?scenario=' + encodeURIComponent(plan.invertedId);
    };
    $('tc-start2-btn').textContent = 'Начать диалог 2';
  }

  syncFlagsFromRecord();
  const record = recordOf();
  const scenarioIds = [];
  if (plan) scenarioIds.push(plan.scenarioId, plan.invertedId);
  Promise.all(scenarioIds.map((id) => id ? NTData.getScenario(id).catch(() => null) : null))
    .then(([baseSc, invSc]) => {
      if (!plan && record && record.pairId) {
        // План мог быть потерян — восстанавливаем его из id пары (inverted_of)
        plan = { pairId: record.pairId, scenarioId: record.pairId, invertedId: invSc ? invSc.id : null,
          title: record.title, mode: record.mode || 'text', difficultyMode: 'easy', engineMode: 'auto',
          targetTurns: 10, round: 2, round1Done: true, round2Done: false };
        NTData.saveTwoChairsPlan(plan);
      }
      render(record, baseSc, invSc);
    })
    .catch(() => render(record, null, null));
})();
