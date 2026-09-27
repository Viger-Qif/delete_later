/* First-visit tours for primary pages. */
(function () {
  'use strict';
  if (!window.NTTour) return;

  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const tours = {
    'catalog.html': {
      id: 'catalog',
      steps: [
        { target: '.header', title: 'Основные разделы', text: 'Здесь можно перейти к сценариям, справочнику, конструктору и профилю.' },
        { target: '.filters', title: 'Подберите ситуацию', text: 'Фильтры помогают быстро найти подходящую тему и уровень сложности.' },
        { target: '.catalog__main', title: 'Запустите тренировку', text: 'Выберите карточку сценария, изучите краткое описание и начните диалог.' }
      ]
    },
    'handbook.html': {
      id: 'handbook',
      steps: [
        { target: '.handbook__intro', title: 'Справочник переговорщика', text: 'Здесь собраны практические методики, формулировки и чек-листы.' },
        { target: '.handbook__toolbar', title: 'Поиск и фильтр', text: 'Ищите методику по названию, шагу или ситуации, в которой она нужна.' },
        { target: '#handbook-list', title: 'Карточки методик', text: 'Откройте карточку, чтобы увидеть шаги, примеры, ошибки и источники.' }
      ]
    },
    'scenario-studio.html': {
      id: 'studio',
      steps: [
        { target: '.studio__intro', title: 'Свой сценарий', text: 'Опишите реальный разговор обычными словами — без технических терминов.' },
        { target: '.studio-grid', title: 'Контекст и цель', text: 'Поля со звёздочкой обязательны. Счётчики показывают допустимый объём текста.' },
        { target: '.studio__build', title: 'Сборка и редактирование', text: 'Система построит граф на этой же странице. До сохранения можно изменить этапы, правила и переходы.' }
      ]
    },
    'profile.html': {
      id: 'profile',
      steps: [
        { target: '.profile-hero', title: 'Ваш профиль', text: 'Здесь отображается режим работы и доступ к аккаунту.' },
        { target: '.profile-stats', title: 'Короткая статистика', text: 'Количество попыток и средний балл остаются доступны без текста диалогов.' },
        { target: 'main .profile-section:last-of-type', title: 'Управление приватностью', text: 'Транскрипты хранятся только в этом браузере. Здесь их можно экспортировать или удалить.' }
      ]
    },
    'stats.html': {
      id: 'stats',
      steps: [
        { target: '.page-head', title: 'История и прогресс', text: 'Здесь собраны завершённые и активные попытки. Полные тексты доступны только в том браузере, где проходила тренировка.' },
        { target: '.stats-summary', title: 'Сводка результатов', text: 'Смотрите число попыток, средний балл, интерес собеседника и примерную длительность практики.' },
        { target: '.spark-wrap', title: 'Динамика интереса', text: 'Столбцы показывают, насколько заинтересованным оставался собеседник в последних сессиях.' },
        { target: '.stats-list', title: 'Откройте конкретную попытку', text: 'В локальной записи можно посмотреть ход диалога, график и доступный разбор.' }
      ]
    },
    'learning.html': {
      id: 'learning',
      steps: [
        { target: '.learning-hero', title: 'Один курс — одна методика', text: 'Сейчас учебный режим посвящён SPIN. Позже здесь появятся другие методики, но текущий путь полностью проводит от теории до повторения.' },
        { target: '.learning-guide', title: 'Один шаг за раз', text: 'Начните с предложенного упражнения. Теорию и полный маршрут можно раскрыть только тогда, когда они понадобятся.' },
        { target: '.learning-sidebar', title: 'Ваш маршрут', text: 'Здесь видно, какой блок вы проходите и что станет доступно дальше.' },
        { target: '.learning-main', title: 'Практика и обратная связь', text: 'Выберите упражнение, напишите одну реплику, получите критерии и улучшенный вариант. После этого переходите к мини-диалогу и повторению.' }
      ]
    }
  };

  const config = tours[page];
  if (!config) return;
  const key = `nt_page_tour_${config.id}_v3`;

  function launch(force = false, attempt = 0) {
    const opened = NTTour.start(config.steps, key, force);
    // Some page sections are rendered after API responses. Do not silently
    // lose a first-visit or button-triggered tour while those targets load.
    if (!opened && attempt < 12 && (force || !NTTour.isDone(key))) {
      window.setTimeout(() => launch(force, attempt + 1), 250);
    }
  }

  const head = document.querySelector('.page-head, .learning-hero');
  if (head && !document.getElementById('page-tour-replay')) {
    const button = document.createElement('button');
    button.id = 'page-tour-replay';
    button.className = 'btn btn--secondary page-tour-replay';
    button.type = 'button';
    button.textContent = 'Повторить знакомство';
    button.addEventListener('click', () => launch(true));
    head.appendChild(button);
  }

  window.setTimeout(() => launch(false), 850);
})();