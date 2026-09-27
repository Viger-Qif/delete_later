/* ============================================================
   Экран сравнительного анализа «Два стула» (two-chairs-compare.html).
   ЕДИНЫЙ источник данных — merged-запись пары (NTData.findTwoChairsRecord):
   и карточки раундов, и сравнительный анализ читают только firstRound/
   secondRound этой записи. Сценарии (роли) подтягиваются с бэкенда только
   для подписей ролей; при недоступности — имена ролей из самой записи.
   Пока умная модель не подключена — текст анализа формируется локально
   из разницы оценок и интереса (мок помечен в UI).
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  /* Оценка хранится на сервере в шкале 0–100; в UI везде показываем /10. */
  function fmtScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const tens = n > 10 ? n / 10 : n;
    return (Math.round(tens * 10) / 10).toString().replace('.', ',');
  }

  function verdict(interest, ended) {
    if (ended === 'exit') return { icon: '✗', cls: 'tc-verdict--muted', text: 'Прерван' };
    if (interest >= 70) return { icon: '✓', cls: 'tc-verdict--success', text: 'Договорённость близка' };
    if (interest >= 45) return { icon: '⚠', cls: 'tc-verdict--warning', text: 'Собеседник настороже' };
    return { icon: '✗', cls: 'tc-verdict--muted', text: 'Не сложилось' };
  }

  /* r — слот merged-записи (уже нормализован NTData.pairRounds), sc — сценарий или null */
  function roundCard(n, r, sc) {
    if (!r) {
      return `<article class="tc-round-card"><h3>Диалог ${n}</h3><p class="tc-muted">Раунд ещё не сыгран.</p></article>`;
    }
    const v = verdict(r.interest ?? 0, r.ended);
    const score = fmtScore(r.score);
    return `<article class="tc-round-card">
      <h3>Диалог ${n} · ${esc(r.title || (sc && sc.title) || 'Сценарий')}</h3>
      <p class="tc-muted">Ваша роль: <b>${esc((sc && sc.userRole) || r.role || '—')}</b><br>Собеседник: ${esc(r.counterpart || (sc && sc.counterpart) || ((n === 1 ? scB : scA) && (n === 1 ? scB : scA).userRole) || 'Собеседник по ситуации')}</p>
      <p class="tc-verdict ${v.cls}" style="font-size:15px"><span aria-hidden="true">${v.icon}</span> ${esc(v.text)}</p>
      <div class="tc-score-line"><span>Оценка разбора</span><span>${score != null ? score + '/10' : 'без оценки'}</span></div>
      <div class="tc-score-line"><span>Интерес</span><span>${Number(r.interest) || 0}%</span></div>
      <a class="btn btn--secondary" href="results.html?id=${encodeURIComponent(r.sessionId)}">Полный разбор</a>
    </article>`;
  }

  function bar(label, value, second) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="tc-bar${second ? ' tc-bar--second' : ''}">
      <div class="tc-bar__label"><span>${esc(label)}</span><b>${pct}%</b></div>
      <div class="tc-bar__track"><div class="tc-bar__fill" style="width:${Math.max(3, pct)}%"></div></div>
    </div>`;
  }

  /* Анализ читает ТОЛЬКО слоты merged-записи (r1/r2).
     Формула: interest + score/2. При одинаковых оценках разбора
     (локальный emergency-fallback часто даёт равные баллы) разница
     определяется заинтересованностью — бары и вывод не противоречат друг другу. */
  function analysisText(r1, r2, roleA, roleB) {
    const i1 = Number(r1.interest) || 0;
    const i2 = Number(r2.interest) || 0;
    const s1 = Number(r1.score) || 0;
    const s2 = Number(r2.score) || 0;
    const diff = (i2 + s2 / 2) - (i1 + s1 / 2);
    const sameScore = s1 > 0 && s1 === s2;
    const confident = Math.abs(diff) < 8 ? 'В обеих ролях вы держались примерно одинаково уверенно.'
      : diff > 0 ? `Во второй роли (${roleB}) вы держались увереннее${sameScore ? ' — при той же оценке разбора шкала заинтересованности выше' : ''}.`
      : `В первой роли (${roleA}) вы держались увереннее${sameScore ? ' — при той же оценке разбора шкала заинтересованности выше' : ''}.`;
    const recs = [];
    if (diff > 0) recs.push(`Перенесите приёмы из роли «${roleB}» (давление сроками, встречные предложения) в позицию «${roleA}».`);
    else if (diff < 0) recs.push(`Приёмы, которые сработали в роли «${roleA}», стоит применить зеркально, когда вы в позиции «${roleB}».`);
    else recs.push('Сильных перекосов нет — попробуйте в следующий раз усложнить задачу: меньше ходов, режим «хард».');
    if (Math.min(i1, i2) < 45) recs.push('В слабом раунде интерес упал ниже 45% — начните с вопроса о потребностях собеседника, а не с ультиматума.');
    if (Math.max(i1, i2) >= 70) recs.push('Сильный раунд: зафиксируйте, какие конкретно аргументы сдвинули шкалу, и используйте их как шаблон.');
    return { confident, recs, mock: true };
  }

  function hideLoading() { $('tc-loading').hidden = true; }

  function renderIncomplete(record, rounds, scA, scB) {
    hideLoading();
    $('tc-compare-title').textContent = (record.title || 'Сценарий') + ' — диалог 2 ещё не завершён';
    $('tc-rounds').hidden = false;
    $('tc-rounds').innerHTML = roundCard(1, rounds.r1, scA) + roundCard(2, rounds.r2, scB);
    $('tc-analysis').hidden = false;
    $('tc-analysis-body').innerHTML = '<p class="tc-muted">Полный сравнительный анализ появится после второго раунда. ' +
      '<a href="two-chairs-pause.html?pair=' + encodeURIComponent(record.pairId || '') + '">Вернуться к паузе</a>.</p>';
    $('tc-final-actions').hidden = false;
    bindActions(record, scA);
  }

  function renderComplete(record, rounds, scA, scB) {
    hideLoading();
    $('tc-compare-title').textContent = (record.title || 'Сценарий') + ' — две стороны сыграны';
    $('tc-rounds').hidden = false;
    $('tc-rounds').innerHTML = roundCard(1, rounds.r1, scA) + roundCard(2, rounds.r2, scB);

    const roleA = (scA && scA.userRole) || rounds.r1.role || 'роль А';
    const roleB = (scB && scB.userRole) || rounds.r2.role || 'роль Б';
    const a = analysisText(rounds.r1, rounds.r2, roleA, roleB);
    const i1 = Number(rounds.r1.interest) || 0;
    const i2 = Number(rounds.r2.interest) || 0;
    $('tc-analysis').hidden = false;
    $('tc-analysis-body').innerHTML = `
      <div class="tc-bars">
        ${bar('Заинтересованность собеседника — диалог 1 (' + roleA + ')', i1, false)}
        ${bar('Заинтересованность собеседника — диалог 2 (' + roleB + ')', i2, true)}
      </div>
      <p class="tc-analysis-text"><b>${esc(a.confident)}</b></p>
      <ul class="tc-recs">${a.recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="tc-muted">Черновик анализа собран локально из итогов двух раундов${a.mock ? ' (мок до подключения сравнительной модели)' : ''}. Работает без внешних сервисов и без API-ключа — в том числе в офлайн-режиме.</p>`;
    $('tc-final-actions').hidden = false;
    bindActions(record, scA);
  }

  function bindActions(record, scA) {
    $('tc-replay-btn').onclick = () => {
      NTData.clearTwoChairsPlan();
      location.href = 'two-chairs-prelaunch.html?scenario=' + encodeURIComponent((scA && scA.id) || record.pairId || '');
    };
    $('tc-other-btn').href = 'two-chairs.html';
  }

  function fail(message) {
    hideLoading();
    $('tc-analysis').hidden = false;
    $('tc-analysis-body').innerHTML = `<p class="tc-error">${esc(message)}</p>
      <p><a href="two-chairs.html">Вернуться к выбору сценария</a></p>`;
    $('tc-final-actions').hidden = false;
  }

  const plan = NTData.refreshTwoChairsPlan() || NTData.getTwoChairsPlan();
  const pairId = params.get('pair') || (plan && plan.pairId);
  const record = (pairId && NTData.findTwoChairsRecord(pairId)) || null;

  if (!record) {
    fail('Сравнительный анализ доступен после обоих диалогов. Запись пары не найдена в этом браузере.');
    return;
  }

  // Нормализованные слоты — единственный источник правды о сыгранных раундах.
  const rounds = NTData.pairRounds(record);
  const scenarioIds = [
    (plan && plan.scenarioId) || record.pairId,
    (plan && plan.invertedId) || null
  ];

  function loadScenarios() {
    return Promise.all(scenarioIds.map((id) => (id ? NTData.getScenario(id).catch(() => null) : null)));
  }

  if (!rounds.complete) {
    // Прерванный режим: без спиннера, без бара диалога 2, со ссылкой на паузу.
    loadScenarios().then(([scA, scB]) => renderIncomplete(record, rounds, scA, scB))
      .catch(() => renderIncomplete(record, rounds, null, null));
    return;
  }

  /* Состояние загрузки живёт ровно ~1.2с (мок-задержка), затем скрывается
     безусловно — обе ветки then/catch вызывают hideLoading через render*. */
  let settled = false;
  const done = (fn) => (args) => { if (settled) return; settled = true; fn(...args); };
  Promise.all([loadScenarios(), new Promise((resolve) => setTimeout(resolve, 1200))])
    .then(done(([pair, sc]) => renderComplete(record, rounds, pair[0], pair[1])))
    .catch(done(() => renderComplete(record, rounds, null, null)));
  // Страховка: если что-то зависло — спиннер всё равно исчезнет.
  setTimeout(() => { if (!settled) { settled = true; renderComplete(record, rounds, null, null); } }, 6000);
})();
