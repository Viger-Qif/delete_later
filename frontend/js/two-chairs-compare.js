/* ============================================================
   Экран сравнительного анализа «Два стула» (two-chairs-compare.html).
   ЕДИНЫЙ источник данных — merged-запись пары (NTData.findTwoChairsRecord):
   и карточки раундов, и сравнительный анализ читают только firstRound/
   secondRound этой записи. Это статичные данные из записи пары — они
   рендерятся СРАЗУ при загрузке страницы, БЕЗ ожидания каких-либо промисов.

   Порядок работы (анти-регрессия «вечного спиннера»):
   1. Карточки раундов + анализ по мок-логике (разница оценок/интереса)
      рисуются синхронно — мок работает ВСЕГДА, даже без сервера и модели.
   2. Спиннер «Анализируем оба раунда…» остаётся в DOM только пока идёт
      попытка получить умный анализ с бэкенда (/api/chat/completions). Он
      удаляется через removeChild либо по завершению запроса, либо по
      жёсткому таймауту SPIN_TIMEOUT_MS (2 секунды) — что наступит раньше.
   3. Если модель недоступна (офлайн / нет ключа / таймаут / ошибка сети) —
      на экране остаются карточки + мок-анализ + плашка «Черновик анализа
      собран локально…». Ничего не блокирует отрисовку.
   Сценарии (роли) подтягиваются с бэкенда только для подписей ролей;
   при недоступности — имена ролей из самой записи.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  /* Жёсткий потолок жизни спиннера: дольше 2 секунд он не крутится НИКОГДА,
     даже если запрос к модели завис. */
  const SPIN_TIMEOUT_MS = 2000;
  /* Таймаут самого запроса к модели — чуть меньше потолка спиннера. */
  const MODEL_TIMEOUT_MS = 1900;

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

  /* Спиннер удаляется из DOM безусловно (removeChild, а не hidden/display),
     чтобы через фиксированное время узла #tc-loading на странице не было. */
  let spinnerRemoved = false;
  function hideLoading() {
    if (spinnerRemoved) return;
    const el = $('tc-loading');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    spinnerRemoved = true;
  }

  function renderAnalysis(html) {
    $('tc-analysis').hidden = false;
    $('tc-analysis-body').innerHTML = html;
  }

  /* Плашка «работает без API-ключа» — та же, что была на прошлом скрине. */
  const OFFLINE_NOTE = 'Черновик анализа собран локально из итогов двух раундов. ' +
    'Работает без внешних сервисов и без API-ключа — в том числе в офлайн-режиме.';

  function barsHtml(roleA, roleB) {
    const i1 = Number(rounds.r1.interest) || 0;
    const i2 = Number(rounds.r2.interest) || 0;
    return `<div class="tc-bars">
        ${bar('Заинтересованность собеседника — диалог 1 (' + roleA + ')', i1, false)}
        ${bar('Заинтересованность собеседника — диалог 2 (' + roleB + ')', i2, true)}
      </div>`;
  }

  function mockHtml(a, offlineOnly) {
    /* Плашка всегда видна в мок-ветке; в офлайне добавляем явную пометку. */
    return `<p class="tc-analysis-text"><b>${esc(a.confident)}</b></p>
      <ul class="tc-recs">${a.recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="tc-muted">${esc(OFFLINE_NOTE)}${offlineOnly ? ' Сейчас сервер/модель недоступны — анализ полностью локальный.' : ' (мок до подключения сравнительной модели)'}</p>`;
  }

  /* --- Прерванный режим: только раунд 1. Рендер СРАЗУ, спиннера нет. --- */
  function renderIncomplete(record, rounds, scA, scB) {
    hideLoading();
    $('tc-compare-title').textContent = (record.title || 'Сценарий') + ' — диалог 2 ещё не завершён';
    $('tc-rounds').hidden = false;
    $('tc-rounds').innerHTML = roundCard(1, rounds.r1, scA) + roundCard(2, rounds.r2, scB);
    renderAnalysis('<p class="tc-muted">Полный сравнительный анализ появится после второго раунда. ' +
      '<a href="two-chairs-pause.html?pair=' + encodeURIComponent(record.pairId || '') + '">Вернуться к паузе</a>.</p>');
    $('tc-final-actions').hidden = false;
    bindActions(record, scA);
  }

  /* --- Полный режим. Шаг 1: СИНХРОННЫЙ рендер карточек + мок-анализа. ---
     Никаких промисов до этого момента: пользователь видит контент сразу. */
  function renderStatic(record, rounds) {
    $('tc-compare-title').textContent = (record.title || 'Сценарий') + ' — две стороны сыграны';
    $('tc-rounds').hidden = false;
    $('tc-rounds').innerHTML = roundCard(1, rounds.r1, null) + roundCard(2, rounds.r2, null);
    const a = analysisText(rounds.r1, rounds.r2, rounds.r1.role || 'роль А', rounds.r2.role || 'роль Б');
    renderAnalysis(barsHtml(rounds.r1.role || 'роль А', rounds.r2.role || 'роль Б') + mockHtml(a, false));
    $('tc-final-actions').hidden = false;
    bindActions(record, null);
  }

  /* Шаг 2 (опциональный): попытка получить умный анализ с модели. Спиннер
     остаётся в DOM только на время этого запроса и снимается по завершении
     ИЛИ по таймауту SPIN_TIMEOUT_MS — что наступит раньше. При отказе
     модели на экране уже стоят карточки + мок + плашка. */
  let modelFailed = false;
  let modelSettled = false;

  function finishSpin(ok, payload) {
    if (modelSettled) return;
    modelSettled = true;
    hideLoading(); // спиннер уходит в любом случае
    if (!ok || !payload || !payload.confident) return; // оставляем мок
    const roleA = rounds.r1.role || 'роль А';
    const roleB = rounds.r2.role || 'роль Б';
    const recs = Array.isArray(payload.recs) && payload.recs.length
      ? payload.recs
      : analysisText(rounds.r1, rounds.r2, roleA, roleB).recs;
    renderAnalysis(`${barsHtml(roleA, roleB)}
        <p class="tc-analysis-text"><b>${esc(payload.confident)}</b></p>
        <ul class="tc-recs">${recs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  }

  function requestModelAnalysis() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    fetch('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        task: 'two_chairs_compare',
        messages: [{ role: 'user', content: 'Сравни два раунда: ' + JSON.stringify({ r1: rounds.r1, r2: rounds.r2 }) }],
        max_tokens: 400,
        temperature: 0.3
      })
    })
      .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then((data) => {
        clearTimeout(timer);
        let txt = '';
        try { txt = String(data.choices?.[0]?.message?.content || data.content || ''); } catch (_) {}
        if (!txt.trim()) throw new Error('empty model reply');
        finishSpin(true, { confident: txt.trim(), recs: null });
      })
      .catch(() => {
        clearTimeout(timer);
        modelFailed = true;
        finishSpin(false, null); // мок + плашка уже отрисованы
      });
    /* Жёсткая страховка: даже если fetch завис и ни then, ни catch не пришли —
       ровно через 2 секунды спиннер гарантированно удалён из DOM. */
    setTimeout(() => { modelFailed = true; finishSpin(false, null); }, SPIN_TIMEOUT_MS);
  }

  /* Подтягиваем подписи ролей с бэкенда — только для красоты подписей в
     УЖЕ отрисованных карточках. На видимость контента НЕ влияет: при
     недоступности сервера имена ролей остаются из записи пары. */
  function refineLabels(scA, scB) {
    if (!scA && !scB) return;
    const roleA = (scA && scA.userRole) || rounds.r1.role || 'роль А';
    const roleB = (scB && scB.userRole) || rounds.r2.role || 'роль Б';
    $('tc-rounds').innerHTML = roundCard(1, rounds.r1, scA) + roundCard(2, rounds.r2, scB);
    bindActions(record, scA);
    /* Бары пересобираем с новыми подписями, ТЕКСТ анализа не трогаем:
       если модель уже ответила — оставляем её вывод, иначе — мок. */
    const barsOld = document.querySelector('#tc-analysis-body .tc-bars');
    if (barsOld) barsOld.outerHTML = barsHtml(roleA, roleB);
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
  /* Базовый сценарий: id из плана, id пары или id первой записи сессии
     (старые записи могли сохранить пару под id базового сценария). */
  const scenarioIds = [
    (plan && plan.scenarioId) || record.pairId || record.id,
    (plan && plan.invertedId) || null
  ];

  /* Страховка от перезапуска сервера: если инвертированный сценарий пропал,
     GET /two-chairs молча воссоздаёт пару из базового. Используется ТОЛЬКО
     как фоновое уточнение подписей — никогда как блокировка рендера. */
  function loadScenarios() {
    return Promise.all(scenarioIds.map((id) => (id ? NTData.getScenario(id).catch(() => null) : Promise.resolve(null))));
  }

  function ensurePairThen(fn) {
    return loadScenarios().then(([scA, scB]) => {
      if (!scB && scA) {
        return NTData.fetchTwoChairsPair(scA.id)
          .then((pair) => fn(scA, pair.inverted))
          .catch(() => fn(scA, null));
      }
      return fn(scA, scB);
    }).catch(() => fn(null, null));
  }

  if (!rounds.complete) {
    /* Прерванный режим: карточки + текст со ссылкой «Вернуться к паузе»
       рисуются СРАЗУ (без промисов), спиннера нет. Подписи ролей
       подтягиваются фоном и только до того, как пользователь ушёл. */
    renderIncomplete(record, rounds, null, null);
    ensurePairThen((scA, scB) => {
      if (spinnerRemoved) {
        $('tc-rounds').innerHTML = roundCard(1, rounds.r1, scA) + roundCard(2, rounds.r2, scB);
        bindActions(record, scA);
      }
    });
    return;
  }

  /* Полный режим:
     1) СИНХРОННО рисуем карточки и мок-анализ (контент гарантирован всегда);
     2) запускаем запрос к модели — спиннер живёт не дольше SPIN_TIMEOUT_MS;
     3) параллельно фоном уточняем подписи ролей из сценариев. */
  renderStatic(record, rounds);
  requestModelAnalysis();
  ensurePairThen(refineLabels);
})();
