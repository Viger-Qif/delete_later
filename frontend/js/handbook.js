/* ============================================================
   СПРАВОЧНИК: каталог из 7 связных методик.
   Источник: /static/content/catalog.json + content/methods/<id>.json.
   Атомарные RAG-чанки (/api/knowledge/*) здесь больше НЕ показываются.
   ============================================================ */
(function () {
  'use strict';
  const CONTENT = '/static/content';
  const list = document.getElementById('handbook-list');
  const meta = document.getElementById('handbook-meta');
  const search = document.getElementById('handbook-search');
  const audience = document.getElementById('handbook-audience');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (value) => String(value ?? '').toLowerCase().replace(/ё/g, 'е');

  /* Старые ссылки handbook.html?entry=<chunk-id> ведут на страницу методики. */
  const legacyEntry = new URLSearchParams(location.search).get('entry');
  if (legacyEntry) {
    const method = window.NTData?.methodForRef(legacyEntry);
    if (method) { location.replace(`method.html?id=${encodeURIComponent(method)}`); return; }
    history.replaceState(null, '', 'handbook.html');
  }

  let all = [];
  const index = new Map(); // id -> полный текст методики для поиска

  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  const initial = (title) => esc(String(title).split(':')[0].trim().charAt(0).toUpperCase());

  function card(item) {
    const href = `method.html?id=${encodeURIComponent(item.id)}`;
    const sections = Number(item.section_count) || 0;
    return `<a class="method-card" href="${href}" data-reveal>
      <span class="method-card__head">
        <span class="method-card__icon" aria-hidden="true">${initial(item.title)}</span>
        <span class="method-card__meta">${esc(item.reading_minutes)} минут${sections ? ` · ${sections} ${plural(sections, 'раздел', 'раздела', 'разделов')} практики` : ''}</span>
      </span>
      <span class="method-card__title">${esc(item.title)}</span>
      <span class="method-card__lead">${esc(item.lead)}</span>
      <span class="chips method-card__chips">${(item.audiences || []).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</span>
      <span class="method-card__open">Открыть методику <span aria-hidden="true">→</span></span>
    </a>`;
  }

  function render() {
    const q = norm(search.value.trim());
    const who = audience.value;
    const rows = all.filter((item) => (!who || (item.audiences || []).includes(who))
      && (!q || (index.get(item.id) || norm(JSON.stringify(item))).includes(q)));
    meta.textContent = rows.length === all.length
      ? `${all.length} ${plural(all.length, 'методика', 'методики', 'методик')}`
      : `Найдено: ${rows.length} из ${all.length}`;
    list.innerHTML = rows.length
      ? rows.map(card).join('')
      : '<div class="handbook-empty"><p class="handbook-empty__title">Ничего не найдено</p><p>Попробуйте другой запрос или выберите «Все ситуации».</p></div>';
    App.initReveal('.method-card[data-reveal]');
  }

  function fillAudiences() {
    const values = [...new Set(all.flatMap((item) => item.audiences || []))];
    audience.insertAdjacentHTML('beforeend', values.map((v) => `<option value="${esc(v)}">${esc(v.charAt(0).toUpperCase() + v.slice(1))}</option>`).join(''));
  }

  fetch(`${CONTENT}/catalog.json`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((rows) => {
      all = Array.isArray(rows) ? rows : [];
      fillAudiences();
      render();
      // Полнотекстовый поиск по шагам и формулировкам: подгружаем статьи фоном.
      return Promise.all(all.map((item) => fetch(`${CONTENT}/methods/${encodeURIComponent(item.id)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((article) => { index.set(item.id, norm(JSON.stringify(article ? [item, article] : item))); })
        .catch(() => {})));
    })
    .then(() => { if (search.value) render(); })
    .catch(() => { meta.textContent = 'Не удалось загрузить справочник. Обновите страницу.'; });

  search.addEventListener('input', render);
  audience.addEventListener('change', render);

  App.initReveal();
})();
