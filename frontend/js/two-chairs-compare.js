/* ============================================================
   Экран сравнительного анализа «Два стула» (two-chairs-compare.html).
   Две карточки раундов + блок сравнения по ролям. Пока умная
   модель не подключена для сквозного сравнения — текст формируется
   локально из разницы оценок и интереса (мок помечен в UI).
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  function verdict(interest, ended) {
    if (ended === 'exit') return { icon: '✗', cls: 'tc-verdict--muted', text: 'Прерван' };
    if (interest >= 70) return { icon: '✓', cls: 'tc-verdict--success', text: 'Договорённость близка' };
    if (interest >= 45) return { icon: '⚠', cls: 'tc-verdict--warning', text: 'Собеседник настороже' };
    return { icon: '✗', cls: 'tc-verdict--muted', text: 'Не сложилось' };
  }

  function roundCard(n, r, sc) {
    if (!r || !r.sessionId) {
      return `<article class="tc-round-card"><h3>Диалог ${n}</h3><p class="tc-muted">Раунд ещё не сыгран.</p></article>`;
    }
    const v = verdict(r.interest ?? 0, r.ended);
    return `<article class="tc-round-card">
      <h3>Диалог ${n} · ${esc(r.title || (sc && sc.title) || 'Сценарий')}</h3>
      <p class="tc-muted">Ваша роль: <b>${esc(sc ? sc.userRole : '—')}</b><br>Собеседник: ${esc(sc ? sc.counterpart : '—')}</p>
      <p class="tc-verdict ${v.cls}" style="font-size:15px"><span aria-hidden="true">${v.icon}</span> ${esc(v.text)}</p>
      <div class="tc-score-line"><span>Оценка разбора</span><span>${Number.isFinite(Number(r.score)) ? r.score + ' баллов' : 'без оценки'}</span></div>
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

  function analysisText(rec, scA, scB) {
    const i1 = Number(rec.firstRound && rec.firstRound.interest) || 0;
    const i2 = Number(rec.secondRound && rec.secondRound.interest) || 0;
    const s1 = Number(rec.firstRound && rec.firstRound.score) || 0;
    const s2 = Number(rec.secondRound && rec.secondRound.score) || 0;
    const roleA = scA ? scA.userRole : 'роль А';
    const roleB = scB ? scB.userRole : 'роль Б';
    const diff = (i2 + s2 / 2) - (i1 + s1 / 2);
    const confident = Math.abs(diff) < 8 ? 'В обеих ролях вы держались примерно одинаково уверенно.'
      : diff > 0 ? `Во второй роли (${roleB}) вы держались увереннее.`
      : `В первой роли (${roleA}) вы держались увереннее.`;
    const recs = [];
    if (diff > 0) recs.push(`Перенесите приёмы из роли «${roleB}» (давление сроками, встречные предложения) в позицию «${roleA}».`);
    else if (diff < 0) recs.push(`Приёмы, которые сработали в роли «${roleA}», стоит применить зеркально, когда вы в позиции «${roleB}».`);
    else recs.push('Сильных перекосов нет — попробуйте в следующий раз усложнить задачу: меньше ходов, режим «хард».');
    if (Math.min(i1, i2) < 45) recs.push('В слабом раунде интерес упал ниже 45% — начните с вопроса о потребностях собеседника, а не с ультиматума.');
    if (Math.max(i1, i2) >= 70) recs.push('Сильный раунд: зафиксируйте, какие конкретно аргументы сдвинули шкалу, и используйте их как шаблон.');
    return { confident, recs, mock: true };
  }

  function renderAnalysis(rec, scA, scB) {
    $('tc-loading').hidden = true;
    $('tc-rounds').hidden = false;
    $('tc-analysis').hidden = false;
    $('tc-final-actions').hidden = false;
    $('tc-compare-title').textContent = (rec.title || 'Сценарий') + ' — две стороны сыграны';
    $('tc-rounds').innerHTML = roundCard(1, rec.firstRound, scA) + roundCard(2, rec.secondRound, scB);

    const a = analysisText(rec, scA, scB);
    const i1 = Number(rec.firstRound && rec.firstRound.interest) || 0;
    const i2 = Number(rec.secondRound && rec.secondRound.interest) || 0;
    $('tc-analysis-body').innerHTML = `
      <div class="tc-bars">
        ${bar('Заинтересованность собеседника — диалог 1 (' + (scA ? scA.userRole : 'роль А') + ')', i1, false)}
        ${bar('Заинтересованность собеседника — диалог 2 (' + (scB ? scB.userRole : 'роль Б') + ')', i2, true)}
      </div>
      <p class="tc-analysis-text"><b>${esc(a.confident)}</b></p>
      <ul class="tc-recs">${a.recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="tc-muted">Черновик анализа собран локально из итогов двух раундов${a.mock ? ' (мок до подключения сравнительной модели)' : ''}.</p>`;

    $('tc-replay-btn').onclick = () => {
      NTData.clearTwoChairsPlan();
      location.href = 'two-chairs-prelaunch.html?scenario=' + encodeURIComponent((scA && scA.id) || rec.pairId || '');
    };
    $('tc-other-btn').href = 'two-chairs.html';
  }

  function fail(message) {
    $('tc-loading').hidden = true;
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
  if (!record.complete) {
    // Раунд 2 ещё не сыгран — показываем то, что есть, с подсказкой.
    Promise.all([NTData.getScenario(plan ? plan.scenarioId : pairId).catch(() => null),
                 NTData.getScenario(plan ? plan.invertedId : '').catch(() => null)])
      .then(([scA, scB]) => {
        $('tc-loading').hidden = true;
        $('tc-rounds').hidden = false;
        $('tc-rounds').innerHTML = roundCard(1, record.firstRound, scA) + roundCard(2, record.secondRound, scB);
        $('tc-analysis').hidden = false;
        $('tc-analysis-body').innerHTML = '<p class="tc-muted">Диалог 2 ещё не завершён — полный анализ появится после второго раунда. <a href="two-chairs-pause.html?pair=' +
          encodeURIComponent(record.pairId || '') + '">Вернуться к паузе</a>.</p>';
        $('tc-final-actions').hidden = false;
      });
    return;
  }

  /* Состояние загрузки живёт ~1.2с, затем данные из записи пары + сценарии */
  Promise.all([
    NTData.getScenario(plan ? plan.scenarioId : record.pairId).catch(() => null),
    NTData.getScenario(plan ? plan.invertedId : (plan && plan.pairId ? plan.pairId + '_tc' : '')).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 1200))
  ]).then(([scA, scB]) => renderAnalysis(record, scA, scB));
})();
