/* ============================================================
   Страница 8: разбор одной сессии (session-view.html).
   Без заглушек: чат и анализ — только серверные данные.
   График строится по истории интереса, если сервер её отдаёт,
   иначе по двум точкам (старт → текущий интерес).
   ============================================================ */
(function () {
  'use strict';

  const id = new URLSearchParams(location.search).get('id');

  const titleEl    = document.getElementById('view-title');
  const metaEl     = document.getElementById('view-meta');
  const toggleEl   = document.getElementById('view-toggle');
  const chatWrap   = document.getElementById('view-chat');
  const graphWrap  = document.getElementById('view-graph');
  const replayEl   = document.getElementById('replay-log');
  const graphEl    = document.getElementById('graph-box');
  const analysisEl = document.getElementById('view-analysis');
  const retryEl    = document.getElementById('view-retry');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const ENDED = {
    finished: { cls: 'pill--easy', text: 'завершена' },
    exit:     { cls: 'pill--hard', text: 'завершена досрочно' },
    active:   { cls: 'pill--hard', text: 'в процессе' }
  };

  function buildGraph(history) {
    const W = 640, H = 240, P = 40;
    const n = history.length;
    const x = (i) => P + (i * (W - P * 2)) / Math.max(1, n - 1);
    const y = (v) => H - P - (v / 100) * (H - P * 2);

    const pts = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${P},${H - P} ${pts} ${x(n - 1).toFixed(1)},${H - P}`;

    const grid = [0, 50, 100].map((v) => `
      <line x1="${P}" y1="${y(v)}" x2="${W - P}" y2="${y(v)}" stroke="#DCE4DF" stroke-width="1"/>
      <text x="${P - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#8CA398">${v}</text>
    `).join('');

    const dots = history.map((v, i) => `
      <circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="var(--accent)"/>
      <text x="${x(i).toFixed(1)}" y="${H - P + 16}" text-anchor="middle" font-size="10" fill="#8CA398">${i + 1}</text>
    `).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График интереса по ходам">
        ${grid}
        <polygon points="${area}" fill="rgba(35, 107, 86, .12)"/>
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>`;
  }

  function renderAnalysis(a) {
    const good      = a.good || a.praise || [];
    const bad       = a.bad || a.improvements || [];
    const moments   = a.moments || [];
    const recommend = a.recommend || a.summary || '';

    analysisEl.innerHTML = `
      <section class="breakdown">
        <div class="breakdown__block breakdown--good">
          <div class="breakdown__head">
            <span class="breakdown__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <h3 class="breakdown__title">Что получилось</h3>
          </div>
          <ul class="breakdown__list">${good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
        </div>
        <div class="breakdown__block breakdown--bad">
          <div class="breakdown__head">
            <span class="breakdown__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="12"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>
            </span>
            <h3 class="breakdown__title">Над чем работать</h3>
          </div>
          <ul class="breakdown__list">${bad.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>
      </section>

      ${a.skills && Object.keys(a.skills).length ? `
      <section class="skill-profile">
        <h3 class="moments__title">Профиль именно этой попытки</h3>
        ${Object.entries(a.skills).map(([key, value]) => { const labels={structure:'Структура разговора',evidence:'Аргументация фактами',questions:'Качество вопросов',listening:'Активное слушание',value:'Ценность для другой стороны',objections:'Работа с возражениями',composure:'Самообладание',closing:'Фиксация договорённости'}; return `<div class="skill-row"><div><span>${esc(labels[key] || key)}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`; }).join('')}
        ${a.id ? `<p class="panel__note">ID транскрипта: ${esc(a.id)} · проанализировано реплик: ${a.turnsAnalyzed || '—'}</p>` : ''}
      </section>` : ''}

      ${NTData.methodLinks(a.knowledge_refs).length ? `
      <section class="moments">
        <h3 class="moments__title">Методики из справочника</h3>
        <ul class="moments__list">${NTData.methodLinks(a.knowledge_refs).map((m) => `<li><a class="chip chip--link" href="${m.href}">${esc(m.title)}</a></li>`).join('')}</ul>
      </section>` : ''}

      ${moments.length ? `
      <section class="moments">
        <h3 class="moments__title">Ключевые моменты диалога</h3>
        <ul class="moments__list">
          ${moments.map((m) => `
            <li>
              <span class="moment__tag">${esc(m.tag)}</span>
              <span class="moment__text">${esc(m.text)}</span>
              <span class="moment__score">+${m.pts ?? 0}</span>
            </li>`).join('')}
        </ul>
      </section>` : ''}

      ${recommend ? `
      <section class="recommend">
        <h3 class="recommend__title">Рекомендация на следующую сессию</h3>
        <p class="recommend__text">${esc(recommend)}</p>
      </section>` : ''}`;
  }

  toggleEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.segmented__btn');
    if (!btn) return;
    toggleEl.querySelectorAll('.segmented__btn').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    chatWrap.hidden = btn.dataset.view !== 'chat';
    graphWrap.hidden = btn.dataset.view !== 'graph';
  });

  NTData.getSession(id).then((rec) => {
    if (!rec) {
      titleEl.textContent = 'Запись не найдена';
      document.getElementById('view-card').innerHTML = `
        <div class="view-empty">
          <p>Такой записи нет в истории.</p>
          <a class="btn btn--primary" href="stats.html">К истории</a>
        </div>`;
      return;
    }

    document.title = rec.title + ' — разбор сессии';
    titleEl.textContent = rec.title;

    const ended = ENDED[rec.ended] || ENDED.finished;
    const dateStr = rec.date
      ? new Date(rec.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';

    metaEl.innerHTML = `
      <span class="pill ${ended.cls}">${ended.text}</span>
      <span class="chip">${rec.mode === 'audio' ? 'Голос' : 'Текст'}</span>
      <span class="chip">${dateStr}</span>
      <span class="chip">${rec.turns ?? 0} ходов</span>
      <span class="chip">${rec.score ?? '—'} балл.</span>
      <span class="chip">интерес ${rec.interest ?? 0}%</span>`;

    replayEl.innerHTML = (rec.messages && rec.messages.length)
      ? rec.messages.map((m) => `<div class="msg msg--${m.who === 'user' ? 'user' : 'bot'}">${esc(m.text)}</div>`).join('')
      : '<div class="view-empty">Текст диалога не сохранился.</div>';

    graphEl.innerHTML = buildGraph(
      rec.interestHistory && rec.interestHistory.length > 1
        ? rec.interestHistory
        : [50, rec.interest ?? 50]
    );

    if (rec.analysis) {
      renderAnalysis(rec.analysis);
    } else if (rec.ended === 'active') {
      analysisEl.innerHTML = `
        <section class="recommend">
          <h3 class="recommend__title">Разбор ещё не готов</h3>
          <p class="recommend__text">Сессия в процессе: сервер пришлёт анализ после завершения диалога.</p>
        </section>`;
    } else {
      analysisEl.innerHTML = `
        <section class="recommend">
          <h3 class="recommend__title">Разбора нет</h3>
          <p class="recommend__text">Для этой сессии сервер не прислал анализ.</p>
        </section>`;
    }

    retryEl.href = 'scenario.html?scenario=' + encodeURIComponent(rec.scenario || '');
    App.initReveal();
  }).catch((error) => {
    titleEl.textContent = 'Ошибка загрузки';
    document.getElementById('view-card').innerHTML = `
      <div class="view-empty">
        <p>${esc(error.message)}</p>
        <a class="btn btn--primary" href="stats.html">К истории</a>
      </div>`;
  });
})();