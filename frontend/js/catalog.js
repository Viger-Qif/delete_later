/* ============================================================
   Страница 2: каталог сценариев (catalog.html).
   Данные — только из js/data.js (заглушка БД).
   ============================================================ */
(function () {
  'use strict';

  const listEl   = document.getElementById('scenario-list');
  const metaEl   = document.getElementById('list-meta');
  const searchEl = document.getElementById('scenario-search');
  const resetBtn = document.getElementById('filters-reset');

  const state = { query: '', difficulty: new Set(), topic: new Set() };
  let ALL = [];

  /* --- Фильтрация: поиск + чекбоксы --- */
  function filtered() {
    const q = state.query.trim().toLowerCase();
    return ALL.filter((s) => {
      const okQ = !q || (s.title + ' ' + s.desc).toLowerCase().includes(q);
      const okD = !state.difficulty.size || state.difficulty.has(s.difficulty);
      const okT = !state.topic.size || state.topic.has(s.topic);
      return okQ && okD && okT;
    });
  }

  /* --- Карточка: «Выбрать» теперь ссылка на страницу сценария --- */
  function cardTemplate(s) {
    return `
      <article class="scenario" role="listitem" data-id="${s.id}">
        <span class="scenario__icon" aria-hidden="true">${NTData.topicIcon(s.topic)}</span>
        <div class="scenario__body">
          <div class="scenario__head">
            <h3 class="scenario__title">${s.title}</h3>
            <span class="pill pill--${s.difficulty}">${NTData.labels.difficulty[s.difficulty]}</span>
          </div>
          <p class="scenario__desc">${s.desc}</p>
          <p class="scenario__meta">${NTData.labels.topics[s.topic]} · ~${s.minutes} мин</p>
        </div>
        <a class="btn btn--secondary scenario__btn" href="scenario.html?scenario=${s.id}">Выбрать</a>
      </article>`;
  }

  function render() {
    const items = filtered();
    metaEl.textContent = `Показано: ${items.length} из ${ALL.length}`;

    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty">
          <p class="empty__title">Ничего не найдено</p>
          <p>Измените запрос или сбросьте фильтры.</p>
          <button class="btn btn--secondary" type="button" data-reset-empty>Сбросить фильтры</button>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map(cardTemplate).join('');
  }

  /* --- Сброс фильтров и поиска --- */
  function resetFilters() {
    state.query = '';
    searchEl.value = '';
    state.difficulty.clear();
    state.topic.clear();
    document.querySelectorAll('.filters input:checked')
      .forEach((cb) => { cb.checked = false; });
    render();
  }

  /* --- События --- */
  searchEl.addEventListener('input', () => {
    state.query = searchEl.value;
    render();
  });

  document.querySelectorAll('.filters input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const group = cb.closest('.filters__group').dataset.group;
      cb.checked ? state[group].add(cb.value) : state[group].delete(cb.value);
      render();
    });
  });

  resetBtn.addEventListener('click', resetFilters);

  listEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset-empty]')) resetFilters();
  });

  /* --- Старт: загрузка «из БД» и первая отрисовка --- */
  NTData.listScenarios().then((rows) => {
    ALL = rows;
    render();
  });

  App.initReveal();
})();