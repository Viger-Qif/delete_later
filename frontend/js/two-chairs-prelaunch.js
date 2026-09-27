/* Предстартовый экран режима «Два стула»: брифинг + кнопка «Начать диалог 1». */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scenarioId = new URLSearchParams(location.search).get('scenario');
  const CONFIG = JSON.parse(localStorage.getItem('nt_session_config') || 'null') || {};
  const modeLabel = CONFIG.mode === 'audio' ? 'Голос' : 'Текст';

  if (!scenarioId) {
    $('tc-brief').innerHTML = '<p class="tc-error">Сценарий не выбран. <a href="two-chairs.html">Вернуться к выбору</a>.</p>';
    $('tc-start-btn').disabled = true;
    return;
  }

  let pair = null;
  $('tc-brief').innerHTML = '<p class="tc-muted">Готовим перевёрнутую пару сценария…</p>';
  NTData.createTwoChairsPair(scenarioId).then((data) => {
    pair = data;
    const sc = data.scenario, inv = data.inverted;
    $('tc-title').textContent = sc.title;
    document.title = sc.title + ' — два стула';
    $('tc-brief').innerHTML = `
      <dl class="tc-kv">
        <dt>Контекст</dt><dd>${esc(sc.situation)}</dd>
        <dt>Ваша роль в диалоге 1</dt><dd><b>${esc(sc.userRole)}</b></dd>
        <dt>Роль оппонента</dt><dd>${esc(sc.counterpart)}</dd>
        <dt>Ваша цель (диалог 1)</dt><dd>${esc(sc.goal)}</dd>
        <dt>После смены стульев</dt><dd>вы — <b>${esc(inv.userRole)}</b>, собеседник — <span class="tc-arrow">↔</span> ${esc(inv.counterpart)}</dd>
        <dt>Режим</dt><dd><span class="tc-pill">${esc(modeLabel)}</span> <span class="tc-pill">Два стула</span></dd>
      </dl>
      <p class="tc-muted">Диалог 2 пройдёт по тому же графу переговоров, но с переставленными ролями.</p>`;
  }).catch((error) => {
    $('tc-brief').innerHTML = `<p class="tc-error">${esc(error.message)}</p><p><a href="two-chairs.html">Выбрать другой сценарий</a></p>`;
    $('tc-start-btn').disabled = true;
  });

  $('tc-start-btn').addEventListener('click', async () => {
    if (!pair) return;
    const button = $('tc-start-btn');
    button.disabled = true; button.textContent = 'Запускаю…';
    const plan = {
      pairId: pair.scenario.twoChairsPair || pair.inverted.id,
      scenarioId: pair.scenario.id,
      invertedId: pair.inverted.id,
      title: pair.scenario.title,
      mode: CONFIG.mode || 'text',
      difficultyMode: CONFIG.difficultyMode || 'easy',
      engineMode: CONFIG.engineMode || 'auto',
      targetTurns: CONFIG.targetTurns || 10,
      round: 1, round1Done: false, round2Done: false
    };
    NTData.saveTwoChairsPlan(plan);
    localStorage.setItem('nt_session_config', JSON.stringify({
      scenario: plan.scenarioId, mode: plan.mode, difficultyMode: plan.difficultyMode,
      engineMode: plan.engineMode, targetTurns: plan.targetTurns, twoChairsRound: 1
    }));
    location.href = (plan.mode === 'audio' ? 'session-audio.html' : 'session.html') + '?scenario=' + encodeURIComponent(plan.scenarioId);
  });
})();
