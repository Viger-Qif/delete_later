(function () {
  'use strict';
  App.initReveal();
  const $ = (id) => document.getElementById(id);
  NTData.authMe().then((auth) => {
    const link = $('profile-link');
    if (!link) return;
    if (auth.authenticated && auth.user) { link.textContent = auth.user.display_name || 'Профиль'; link.setAttribute('aria-label', 'Открыть профиль'); }
  }).catch(() => {});
  function showSecretary() {
    NTSecretary.setHidden(false);
    NTSecretary.say('Я здесь! Выберите «Начать тренировку» или повторите знакомство с приложением.', { returnToIdleMs: 0 });
  }
  $('show-secretary-btn').addEventListener('click', showSecretary);
  $('secretary-restore-btn').addEventListener('click', showSecretary);

  // Version this key whenever the first-run route materially changes.
  // Browser storage survives replacing the project folder, so reusing an old
  // key silently suppresses the welcome tour in a newly downloaded build.
  const HOME_TOUR_KEY = 'nt_home_tour_v6';
  const HOME_TOUR_STEPS = [
    { target: '.hero__title', title: 'Добро пожаловать в Negotiation Lab', text: 'Я Фиделина. Здесь вы тренируете переговоры, изучаете методики и разбираете собственные попытки. Сейчас покажу каждый раздел отдельно.' },
    { target: '.actions .action:nth-child(1)', title: 'Сценарии и тренировка', text: 'Выберите готовую ситуацию, роль и сложность, затем проведите переговоры с ИИ-собеседником. Внутри я снова встречу вас и подробно объясню интерфейс чата.' },
    { target: '.actions .action:nth-child(2)', title: 'Создать свой сценарий', text: 'Опишите реальный разговор — система соберёт роли, этапы и развилки. Внутри я объясню обязательные поля, редактор графа и сохранение.' },
    { target: '.actions .action:nth-child(3)', title: 'Статистика', text: 'Здесь собраны результаты и история попыток без серверных транскриптов. Внутри я покажу сводку, график интереса и локальные записи.' },
    { target: '.actions .action:nth-child(4)', title: 'Справочник методик', text: 'Здесь можно спокойно изучить SPIN, BATNA, активное слушание и другие подходы. Внутри я объясню поиск, карточки и чек-листы.' },
    { target: '.actions .action:nth-child(5)', title: 'Учебный режим', text: 'Сейчас доступен полноценный курс по одной методике — SPIN. Внутри я проведу по пути: теория, вводные уроки, практика, разбор ошибок и повторение.' },
    { target: '#profile-link', title: 'Профиль и приватность', text: 'В профиле видны агрегаты, ваши сценарии и управление локальными данными. Внутри я объясню, что хранится в браузере и что можно удалить.' }
  ];
  let introActive = !NTTour.isDone(HOME_TOUR_KEY);
  let pendingStatus = null;

  function speakStatus(message, state) {
    if (introActive) { pendingStatus = { message, state }; return; }
    if (state === 'success' || state === 'warning') NTSecretary.say(message, { state, open: false, returnToIdleMs: state === 'success' ? 3200 : 5200 });
    else NTSecretary.thinking(message);
  }

  function restartIntro() {
    introActive = true;
    NTSecretary.setHidden(false);
    NTTour.start(HOME_TOUR_STEPS, HOME_TOUR_KEY, true);
  }
  $('restart-intro-btn').addEventListener('click', restartIntro);
  $('restart-intro-visible').addEventListener('click', restartIntro);
  document.addEventListener('nt:tour-close', (event) => {
    if (event.detail && event.detail.key === HOME_TOUR_KEY) {
      introActive = false;
      if (pendingStatus) { const status = pendingStatus; pendingStatus = null; speakStatus(status.message, status.state); }
      else NTSecretary.idle();
    }
  });
  function launchIntro(attempt = 0) {
    if (!introActive) return;
    const opened = NTTour.start(HOME_TOUR_STEPS, HOME_TOUR_KEY, false);
    if (!opened && !NTTour.isDone(HOME_TOUR_KEY) && attempt < 12) {
      window.setTimeout(() => launchIntro(attempt + 1), 250);
    }
  }
  if (introActive) window.setTimeout(launchIntro, 350);
  else speakStatus('Готовлю тренажёр к работе…', 'thinking');

  const ROLE = { dialog: 'диалог', smart: 'анализ' };
  function renderCandidates(models) {
    const box = $('model-popover-list');
    if (!box) return;
    const c = (models && models.candidates) || {};
    const rows = [].concat(c.dialog || [], c.smart || []);
    if (!rows.length) { box.innerHTML = '<li>Облачные модели не настроены — работает экспертная система</li>'; return; }
    box.innerHTML = rows.map((item) => {
      const cls = item.available === true ? 'is-up' : item.available === false ? 'is-down' : '';
      const state = item.available === true ? (item.latency_ms ? item.latency_ms + ' мс' : 'готова') : (item.error || 'не проверена');
      return `<li class="${cls}${item.active ? ' is-active' : ''}"><span class="model-chip__role">${ROLE[item.kind] || item.kind}</span>${item.model}<b>${state}</b></li>`;
    }).join('');
  }

  Promise.all([NTData.health(), NTData.modelsStatus(false)]).then(([health, models]) => {
    const cloud = models.cloud || {};
    const expert = models.expert || {};
    const cloudReady = cloud.available === true;
    const cloudChecking = cloud.configured && cloud.available == null;
    $('model-name').textContent = cloudReady ? cloud.model : cloudChecking ? 'Проверяем модели' : 'Экспертная система';
    $('model-latency').textContent = cloudReady ? `${cloud.latency_ms || 0} мс` : cloudChecking ? 'запуск…' : `${expert.latency_ms || 0} мс`;
    $('model-popover-title').textContent = cloudReady ? 'Облачный ИИ доступен' : cloudChecking ? 'Проверяем доступность' : 'Работаем через эксперта';
    $('model-popover-mode').textContent = cloudReady
      ? `Проверено реальным запросом. Задержка: ${cloud.latency_ms || 0} мс.`
      : cloudChecking
        ? 'Проверка выполняется один раз при запуске сервера. Автоматический режим пока не объявляем экспертом.'
      : `${cloud.error || 'Облачный ИИ не ответил'}. Экспертная система готова.`;
    $('credit-status-dot').classList.add(cloudReady ? 'is-online' : cloudChecking ? 'is-checking' : 'is-offline');
    $('model-popover-stat').textContent = cloud.recent_success_rate == null
      ? 'История доступности появится после первых обращений.'
      : `Успешность облачного ИИ: ${cloud.recent_success_rate}% за ${cloud.recent_attempts} обращений.`;
    renderCandidates(models);
    if (cloudReady) {
      speakStatus('Всё готово. Можно начинать тренировку.', 'success');
    } else if (cloudChecking) {
      speakStatus('Готовлю систему к тренировке…', 'thinking');
    } else {
      speakStatus('Можно начинать тренировку — запасной режим готов.', 'success');
    }
  }).catch(() => {
    const box = $('model-popover-list');
    if (box) box.innerHTML = '<li class="is-down">Сервер не отвечает</li>';
    $('model-name').textContent = 'API недоступен';
    $('model-latency').textContent = 'ошибка';
    $('model-popover-title').textContent = 'Не удалось проверить системы';
    $('model-popover-mode').textContent = 'Проверьте, запущен ли локальный сервер.';
    $('credit-status-dot').classList.add('is-offline');
    speakStatus('Не удалось связаться с приложением. Попробуйте обновить страницу.', 'warning');
  });
})();
