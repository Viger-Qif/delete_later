/* ============================================================
   Страница 7: история переговоров (stats.html).
   Сводка за всё время + список сохранённых сессий.
   Данные — из NTData.listSessions() (заглушки + localStorage).
   ============================================================ */
(function () {
  'use strict';

  const listEl  = document.getElementById('sessions-list');
  const countEl = document.getElementById('list-count');
  const sparkEl = document.getElementById('spark');
  const sum = {
    total:    document.getElementById('sum-total'),
    score:    document.getElementById('sum-score'),
    interest: document.getElementById('sum-interest'),
    time:     document.getElementById('sum-time')
  };

  const MODE_ICON = {
    text: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    audio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'
  };

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function fmtTime(min) {
    if (min < 60) return min + ' мин';
    return Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин';
  }

  NTData.listSessions().then((sessions) => {
    if (!sessions.length) {
      listEl.innerHTML = '<div class="stats-empty">Пока нет ни одной сессии. Пройдите первую тренировку!</div>';
      return;
    }

    /* --- Сводка за всё время --- */
    const total = sessions.length;
    const avg = (fn) => {
      const values = sessions.map(fn).map(Number).filter(Number.isFinite);
      return values.length ? Math.round(values.reduce((acc, value) => acc + value, 0) / values.length) : null;
    };
    sum.total.textContent = total;
    { const a = avg((s) => s.score); sum.score.textContent = a == null ? '—' : (Math.round(a / 10 * 10) / 10).toString().replace('.', ','); }
    const averageInterest = avg((s) => s.interest);
    sum.interest.textContent = averageInterest == null ? '—' : averageInterest + '%';
    sum.time.textContent = fmtTime(sessions.reduce((acc, s) => acc + (s.minutes || 0), 0));

    /* --- Мини-график: интерес последних шести сессий в хронологии --- */
    const last = sessions.slice(0, 6).reverse();
    sparkEl.innerHTML = last.map((s) =>
      `<span class="spark__col" style="height:${Math.max(8, s.interest)}%" title="${fmtDate(s.date)} — ${s.interest}%"></span>`
    ).join('');

    /* --- Список записей: сначала локальные записи режима «Два стула» (одна
       строка на весь режим, с обеими оценками), затем обычные серверные --- */
    countEl.textContent = 'записей: ' + sessions.length;
    const pairIds = new Set();
    const tcRows = NTData.listLocalHistory().filter((item) => item.twoChairs && item.pairId);
    tcRows.forEach((item) => pairIds.add(item.pairId));
    const plainRows = sessions.filter((s) => !s.pairId || !pairIds.has(s.pairId));
    NTData.prunePairDuplicates();
    const rowsHtml = tcRows.map(tcRecord).join('') + plainRows.map(plainRecord).join('');
    listEl.innerHTML = rowsHtml || '<div class="stats-empty">Пока нет ни одной сессии. Пройдите первую тренировку!</div>';
  }).catch((error) => {
    listEl.textContent = String(error.message || 'Не удалось загрузить статистику');
    const link = document.createElement('a'); link.href = 'login.html?next=stats.html'; link.textContent = 'Войти в аккаунт'; link.className = 'btn btn--secondary'; listEl.appendChild(link);
  });

  function fmtScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const tens = n > 10 ? n / 10 : n;
    return (Math.round(tens * 10) / 10).toString().replace('.', ',');
  }

  /* Одна запись на весь режим «Два стула»: бейдж, две оценки, клик — на сравнение */
  function tcRecord(s) {
    const v1 = s.firstRound && s.firstRound.sessionId ? (s.firstRound.verdict || NTData.pairVerdict(s.firstRound)) : '·';
    const v2 = s.secondRound && s.secondRound.sessionId ? (s.secondRound.verdict || NTData.pairVerdict(s.secondRound)) : '·';
    const both = Boolean(s.complete || (s.firstRound && s.secondRound && s.firstRound.sessionId && s.secondRound.sessionId));
    const href = 'two-chairs-compare.html?pair=' + encodeURIComponent(s.pairId);
    const scores = `Раунд 1: ${fmtScore(s.firstRound && s.firstRound.score)}/10 · Раунд 2: ${both ? fmtScore(s.secondRound && s.secondRound.score) + '/10' : '—'}`;
    return `
      <a class="record record--two-chairs" href="${href}">
        <span class="record__icon" aria-hidden="true">🪑</span>
        <span class="record__body">
          <span class="record__title">${escText(s.title)} <span class="tc-badge">2 стула</span></span>
          <span class="record__meta">${fmtDate(s.date)} · ${v1} диалог 1 → ${v2} диалог 2${both ? '' : ' · режим не завершён'}</span>
        </span>
        <span class="record__stat record__stat--tc">${scores}</span>
        <svg class="record__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>`;
  }

  function plainRecord(s) {
    return `
      <a class="record" href="session-view.html?id=${encodeURIComponent(s.id)}">
        <span class="record__icon" aria-hidden="true">${MODE_ICON[s.mode] || MODE_ICON.text}</span>
        <span class="record__body">
          <span class="record__title">${s.title}${s.twoChairs ? ' <span class="tc-badge">2 стула</span>' : ''}</span>
          <span class="record__meta">${fmtDate(s.date)} · ${s.mode === 'audio' ? 'голос' : 'текст'} · ${s.turns} ходов</span>
        </span>
        <span class="record__stat">${Number.isFinite(Number(s.score)) ? fmtScore(s.score) + '/10' : 'без оценки'}</span>
        <span class="record__stat record__stat--interest">${s.interest}%</span>
        <svg class="record__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>`;
  }

  function escText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.initReveal();
})();