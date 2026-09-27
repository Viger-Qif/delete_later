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
    sum.score.textContent = avg((s) => s.score) ?? '—';
    const averageInterest = avg((s) => s.interest);
    sum.interest.textContent = averageInterest == null ? '—' : averageInterest + '%';
    sum.time.textContent = fmtTime(sessions.reduce((acc, s) => acc + (s.minutes || 0), 0));

    /* --- Мини-график: интерес последних шести сессий в хронологии --- */
    const last = sessions.slice(0, 6).reverse();
    sparkEl.innerHTML = last.map((s) =>
      `<span class="spark__col" style="height:${Math.max(8, s.interest)}%" title="${fmtDate(s.date)} — ${s.interest}%"></span>`
    ).join('');

    /* --- Список записей --- */
    countEl.textContent = 'записей: ' + total;
    listEl.innerHTML = sessions.map((s) => `
      <a class="record" href="session-view.html?id=${encodeURIComponent(s.id)}">
        <span class="record__icon" aria-hidden="true">${MODE_ICON[s.mode] || MODE_ICON.text}</span>
        <span class="record__body">
          <span class="record__title">${s.title}</span>
          <span class="record__meta">${fmtDate(s.date)} · ${s.mode === 'audio' ? 'голос' : 'текст'} · ${s.turns} ходов</span>
        </span>
        <span class="record__stat">${Number.isFinite(Number(s.score)) ? s.score + ' балл.' : 'без оценки'}</span>
        <span class="record__stat record__stat--interest">${s.interest}%</span>
        <svg class="record__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>`).join('');
  }).catch((error) => {
    listEl.textContent = String(error.message || 'Не удалось загрузить статистику');
    const link = document.createElement('a'); link.href = 'login.html?next=stats.html'; link.textContent = 'Войти в аккаунт'; link.className = 'btn btn--secondary'; listEl.appendChild(link);
  });

  App.initReveal();
})();