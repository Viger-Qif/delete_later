/* ============================================================
   Страница 4: сессия тренировки (session.html).
   Без заглушек: оппонент, интерес, этапы и разбор приходят
   с бэкенда. Советы коуча — через /hint.
   ============================================================ */
(function () {
  'use strict';

  /* Пользовательские настройки со страницы сценария (не данные!) */
  const CONFIG = JSON.parse(localStorage.getItem('nt_session_config') || 'null') || {};
  const scenarioId = new URLSearchParams(location.search).get('scenario') || CONFIG.scenario;
  const TARGET_TURNS = Math.max(4, Math.min(20, Number(CONFIG.targetTurns) || 10));
  const DIFFICULTY = CONFIG.difficultyMode || 'medium';
  const ENGINE_MODE=CONFIG.engineMode||'auto';

  /* --- Интеграция режима «Два стула»: план пары определяет поведение --- */
  function twoChairsPlan() {
    const plan = NTData.getTwoChairsPlan();
    if (!plan || plan.completed) return null;
    // План относится к текущему запуску, только если сценарий совпадает
    // с раундом плана и раунд ещё не сыгран.
    const matches = plan.round === 2
      ? (plan.invertedId && plan.invertedId === scenarioId)
      : (plan.scenarioId && plan.scenarioId === scenarioId);
    if (!matches) return null;
    if (plan.round === 1 && plan.round1Done) return null;
    if (plan.round === 2 && plan.round2Done) return null;
    return plan;
  }
  const TC_PLAN = twoChairsPlan();

  /* --- Индикация офлайн-режима (без API-ключа или при сбое облака) --- */
  let OFFLINE_MODE = false;
  function setOfflineMode(on, reason) {
    if (!on || OFFLINE_MODE) return;
    OFFLINE_MODE = true;
    try { localStorage.setItem('nt_last_offline', JSON.stringify({ at: Date.now(), reason: reason || '' })); } catch (_) {}
    if (runtimeStatus) {
      runtimeStatus.textContent = 'Офлайн-режим · экспертная система';
      runtimeStatus.dataset.responder = 'expert_system';
      runtimeStatus.classList.add('is-offline');
    }
    addMsg('Облачный ИИ недоступен — диалог продолжается в офлайн-режиме на экспертной системе. Записи сохранены полностью.', 'system');
  }
  NTData.health().then((h) => { if (h && h.llm_mode === 'expert-system') setOfflineMode(true, 'no-key'); }).catch(() => {});

  const progressFill = document.getElementById('progress-fill');
  const progressBar  = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const tutorialBtn = document.getElementById('tutorial-btn');
  const chatTitle    = document.getElementById('chat-title');
  const chatLog      = document.getElementById('chat-log');
  const chatForm     = document.getElementById('chat-form');
  const chatInput    = document.getElementById('chat-input');
  const chatCounter  = document.getElementById('chat-counter');
  const timerEl      = document.getElementById('chat-timer');
  const hintsBtn     = document.getElementById('hints-btn');
  const exitBtn      = document.getElementById('exit-btn');
  const voiceInputBtn = document.getElementById('voice-input-btn');
  const processingBanner = document.getElementById('processing-banner');
  const processingTitle = document.getElementById('processing-title');
  const processingText=document.getElementById('processing-text');
  const runtimeStatus=document.getElementById('runtime-status');
  const coachModal = document.getElementById('coach-modal');
  const coachModalBody = document.getElementById('coach-modal-body');
  const coachModalHistory = document.getElementById('coach-modal-history');
  const coachModalRefresh = document.getElementById('coach-modal-refresh');
  const coachModalClose = document.getElementById('coach-modal-close');
  const bodies = {
    topics: document.getElementById('topics-body'),
    stats:  document.getElementById('stats-body'),
    hints:  document.getElementById('hints-body'),
    info:   document.getElementById('info-body')
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  let scenario = null;  // view-модель сценария
  let session  = null;
  let sending = false;  // сырая серверная сессия
  let done = false;
  let timerId = null, timerLeft = 15;
  let processingTimer = null;
  const coachThread = [];
  let coachCards = [];

  function updateChatCounter() {
    if (!chatCounter) return;
    chatCounter.textContent = `${chatInput.value.length} / ${chatInput.maxLength}`;
    chatCounter.classList.toggle('is-near-limit', chatInput.value.length >= chatInput.maxLength * .75);
  }
  updateChatCounter();
  let coachModalOpen = false;

  /* --- Панели --- */
  function setPanel(name, open) {
    document.getElementById('panel-' + name).hidden = !open;
    const btn = document.querySelector(`.tool-btn[data-panel="${name}"]`);
    btn.classList.toggle('is-active', open);
    btn.setAttribute('aria-pressed', String(open));
  }

  document.querySelectorAll('.tool-btn[data-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn === hintsBtn) {
        openCoachModal();
        return;
      }
      const panel = document.getElementById('panel-' + btn.dataset.panel);
      setPanel(btn.dataset.panel, panel.hidden);
    });
  });

  document.querySelectorAll('.panel__x').forEach((x) => {
    x.addEventListener('click', () => setPanel(x.dataset.close, false));
  });
  document.addEventListener('nt:secretary-toggle', () => {
    if (DIFFICULTY !== 'hard' && scenario) openCoachModal();
  });

  function setCoachPause(paused) {
    coachModalOpen = paused;
    document.body.classList.toggle('coach-is-paused', paused);
    if (paused) {
      stopTimer();
    } else if (!done) {
      startTimer();
    }
    chatInput.disabled = paused || done;
    voiceInputBtn.disabled = paused || done || voiceInputBtn.dataset.unsupported === 'true';
    const sendButton = chatForm.querySelector('button[type="submit"]');
    if (sendButton) sendButton.disabled = paused || done;
  }

  function closeCoachModal() {
    if (!coachModal) return;
    coachModal.hidden = true;
    coachModal.setAttribute('aria-hidden', 'true');
    setCoachPause(false);
    hintsBtn.classList.remove('is-active');
    hintsBtn.setAttribute('aria-pressed', 'false');
  }

  function renderCoachHistory() {
    if (!coachModalHistory) return;
    if (!coachThread.length) {
      coachModalHistory.hidden = true;
      coachModalHistory.innerHTML = '';
      return;
    }
    coachModalHistory.hidden = false;
    coachModalHistory.innerHTML = `<details><summary>Полученные ранее советы (${coachThread.length})</summary><div class="coach-modal__history-list">${coachThread.map((text, index) => `<div><b>Совет ${index + 1}</b>${NTData.formatKnowledgeText(text, coachCards)}</div>`).join('')}</div></details>`;
  }

  function openCoachModal() {
    if (!coachModal || DIFFICULTY === 'hard' || !scenario || done) return;
    coachModal.hidden = false;
    coachModal.setAttribute('aria-hidden', 'false');
    setCoachPause(true);
    hintsBtn.classList.add('is-active');
    hintsBtn.setAttribute('aria-pressed', 'true');
    if (turnsCount() === 0) {
      coachModalBody.innerHTML = '<b>Сначала сделайте свой первый ход.</b><p>Фиделина разбирает именно вашу реплику, поэтому не выдаёт универсальный совет до начала разговора.</p>';
      coachModalRefresh.disabled = true;
      coachModalRefresh.textContent = 'Жду вашу первую реплику';
      setTimeout(() => coachModalClose?.focus(), 0);
      return;
    }
    coachModalRefresh.disabled = false;
    coachModalBody.textContent = 'Фиделина готовит короткий совет…';
    askCoach();
    setTimeout(() => coachModalClose?.focus(), 0);
  }

  coachModalClose?.addEventListener('click', closeCoachModal);
  coachModal?.querySelector('[data-coach-close]')?.addEventListener('click', closeCoachModal);
  coachModalRefresh?.addEventListener('click', askCoach);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && coachModalOpen) closeCoachModal();
  });

  /* --- Производные величины из серверных данных --- */
  function turnsCount() {
    return (session.messages || []).filter((m) => m.role === 'user').length;
  }

  function interestPct() {
    const range = scenario.interestRange || { min: 0, max: 100 };
    return Math.max(0, Math.min(100, Math.round(((session.interest - range.min) / Math.max(1, range.max - range.min)) * 100)));
  }

  function nodeLabel() {
    const nodes = (scenario.graph && scenario.graph.nodes) || [];
    const node = nodes.find((n) => n.id === session.current_node_id);
    return node ? node.label : '—';
  }

  /* --- Чат --- */
  function runtimeLabel(m){if(!m||!m.responder)return '';if(m.responder==='scripted')return '';const src=m.responder==='cloud_ai'?'Облачный ИИ':m.responder==='expert_system'?'Экспертная система':m.responder;return `${src}${m.model?' · '+m.model:''}${m.latency_ms?' · '+m.latency_ms+' мс':''}${m.fallback_used?' · резерв':''}`;}function updateRuntime(m){const label=runtimeLabel(m);if(!label)return;if(m.responder==='expert_system')setOfflineMode(true,'expert-answer');runtimeStatus.textContent=(m.responder==='expert_system'&&OFFLINE_MODE)?'Офлайн-режим · экспертная система':label;runtimeStatus.dataset.responder=m.responder||'';runtimeStatus.classList.toggle('is-fallback',Boolean(m.fallback_used));}
  function addMsg(text,who,runtime=null){const el=document.createElement('div');el.className='msg msg--'+who;const body=document.createElement('span');body.textContent=text;el.appendChild(body);chatLog.appendChild(el);chatLog.scrollTop=chatLog.scrollHeight;return el;}

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg--bot msg--typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  function renderMessages() {
    chatLog.innerHTML = '';
    (session.messages || []).forEach((m) => {
      if (m.role === 'assistant') return;
      addMsg(m.content,m.role==='user'?'user':'bot',m);
    });
  }

  function remainingTurns() { return Math.max(0, TARGET_TURNS - turnsCount()); }

  function updateProgress() {
    if (DIFFICULTY === 'hard') return;
    const pct = Math.min((turnsCount() / TARGET_TURNS) * 100, 100);
    progressFill.style.width = pct + '%';
    progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    const interestLabel = DIFFICULTY === 'easy' ? `Заинтересованность ${interestPct()}%` : `Заинтересованность: ${interestState(interestPct())[0]}`;
    progressLabel.textContent = remainingTurns() ? `${interestLabel} · примерно осталось ходов: ${remainingTurns()}` : `${interestLabel} · финальная часть`;
  }

  function interestState(pct) {
    if (pct < 20) return ['Почти потерян', 'Руководитель готов завершить разговор.'];
    if (pct < 40) return ['Скептически', 'Аргументы пока не убеждают руководителя.'];
    if (pct < 60) return ['Нейтрально', 'Руководитель ждёт конкретики.'];
    if (pct < 80) return ['Заинтересован', 'Руководитель видит основания для обсуждения.'];
    return ['Готов договариваться', 'Руководитель настроен искать решение.'];
  }
  function renderStatsPanel() {
    if (DIFFICULTY === 'hard') { bodies.stats.innerHTML = ''; return; }
    const pct = interestPct(), state = interestState(pct);
    const interest = DIFFICULTY === 'medium'
      ? `<div class="meter"><div class="meter__head"><span>Заинтересованность</span><b>${state[0]}</b></div><p class="panel__note">${state[1]}</p></div>`
      : `<div class="meter"><div class="meter__head"><span>Заинтересованность</span><b>${pct}%</b></div><div class="meter__track"><div class="meter__fill" style="width:${pct}%"></div></div><p class="panel__note">${state[1]}</p></div>`;
    bodies.stats.innerHTML = `${interest}<p class="panel__sub">До финальной части</p><ul class="log-list"><li><span>Примерно ходов</span><b>${remainingTurns()}</b></li>${DIFFICULTY === 'easy' ? `<li><span>Текущий этап</span><b>${esc(nodeLabel())}</b></li>` : ''}</ul>`;
  }

  function applyDifficultyUI() {
    document.body.dataset.difficulty = DIFFICULTY;
    if (DIFFICULTY !== 'hard') return;
    progressBar.hidden = true;
    ['topics', 'stats', 'hints'].forEach((name) => {
      const btn = document.querySelector(`.tool-btn[data-panel="${name}"]`);
      if (btn) btn.hidden = true;
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.hidden = true;
    });
  }

  const TOUR_STEPS = [
    { target: '#exit-btn', title: 'Завершение и выход', text: 'Сессию можно завершить в любой момент — даже до первой реплики. Также можно вернуться на главную и продолжить позже.' },
    { target: '#progress-bar', title: 'Ориентир по длине', text: 'Это примерный, а не обязательный прогресс: успешная договорённость может завершить разговор раньше.' },
    { target: '[data-panel="topics"]', title: 'Справочник', text: 'Кратко напоминает тему и навыки сценария.' },
    { target: '[data-panel="stats"]', title: 'Состояние переговоров', text: 'Содержимое зависит от сложности: точные числа доступны только в лёгком режиме.' },
    { target: '#hints-btn', title: 'Фиделина — переговорный коуч', text: 'После вашей первой реплики Фиделина разберёт текущий момент. Совет не отправляется собеседнику, а диалог ставится на паузу.' },
    { target: '[data-panel="info"]', title: 'Условия сценария', text: 'Здесь можно перечитать ситуацию, роль собеседника и вашу цель.' },
    { target: '.chat__form', title: 'Многострочная реплика', text: 'Enter отправляет сообщение, Shift+Enter добавляет строку. Текст сообщений можно выделять и копировать.' }
  ];
  function startTour(force) { NTTour.start(TOUR_STEPS, `nt_tour_text_${DIFFICULTY}_${scenarioId || 'default'}_v23`, force); }
  tutorialBtn.addEventListener('click', () => startTour(true));

  /* --- Таймер-напоминание из настроек сценария --- */
  function startTimer() {
    if (!CONFIG.timer || done) return;
    stopTimer();
    timerLeft = 15;
    timerEl.hidden = false;
    timerEl.textContent = 'Напоминание через 0:15 · время не ограничено';
    timerId = setInterval(() => {
      timerLeft -= 1;
      timerEl.textContent = 'Напоминание через 0:' + String(timerLeft).padStart(2, '0') + ' · время не ограничено';
      if (timerLeft <= 0) {
        clearInterval(timerId);
        timerId = null;
        timerEl.textContent = 'Собеседник ждёт · отвечайте без спешки';
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    timerEl.hidden = true;
  }

  /* --- Коуч в панели советов --- */
  function renderHintsPanel() {
    bodies.hints.innerHTML = `
      <div class="secretary-coach"><div class="secretary-coach__copy"><b>Фиделина</b><small>Советы не попадают в диалог и не влияют на оценку.</small></div></div><p class="panel__sub">Советы по сценарию</p>
      ${scenario.methods.map((m) => `<div class="tip-card">${esc(m)}</div>`).join('')}
      <p class="panel__sub">Советы Фиделины</p>
      ${coachThread.length
        ? coachThread.map((t) => `<div class="tip-card">${NTData.formatKnowledgeText(t, coachCards)}</div>`).join('')
        : '<p class="panel__note">После первой вашей реплики Фиделина сможет разобрать конкретный момент.</p>'}
      <button class="btn btn--secondary" type="button" id="coach-btn">Спросить Фиделину</button>`;
    document.getElementById('coach-btn').addEventListener('click', askCoach);
    NTSecretary.sync();
  }

  async function askCoach() {
    const btn = coachModalRefresh || document.getElementById('coach-btn');
    if (!session || turnsCount() === 0) {
      if (coachModalBody) coachModalBody.innerHTML = '<b>Пока разбирать нечего.</b><p>Ответьте собеседнику хотя бы один раз — после этого Фиделина даст совет по вашей реальной реплике.</p>';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Жду вашу первую реплику';
      }
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Фиделина думает…';
    }
    if (coachModalBody) coachModalBody.textContent = 'Фиделина готовит короткий совет…';
    NTSecretary.thinking('Анализирую текущую ситуацию и готовлю короткий совет…');
    try {
      const res = await NTData.askHint(session.id, '');
      coachCards = res.coach?.knowledge_cards || coachCards;
      coachThread.push(res.hint);updateRuntime(res);NTSecretary.say(NTData.formatKnowledgePlainText(res.hint, coachCards),{state:'talk',returnToIdleMs:5000,open:false});
      if (coachModalBody) coachModalBody.innerHTML = NTData.formatKnowledgeText(res.hint, coachCards);
      renderCoachHistory();
      renderHintsPanel();
    } catch (error) {
      if (coachModalBody) coachModalBody.textContent = error.message;
      NTSecretary.warning('Не удалось получить совет. Попробуйте ещё раз.');
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Получить ещё совет';
    }
  }

  function showProcessing() {
    clearTimeout(processingTimer);
    processingTitle.textContent = 'Обрабатываем реплику…';
    processingText.textContent = 'Собеседник сопоставляет аргументы с контекстом переговоров.';
    processingBanner.hidden = false;
    NTSecretary.thinking('Собеседник анализирует вашу реплику…');
    processingTimer = setTimeout(() => {
      processingTitle.textContent = 'Проверяем результат переговоров…';
      processingText.textContent = 'Если договорённость достигнута, сейчас формируется персональный разбор этой попытки.';
    }, 2500);
  }

  function hideProcessing() {
    clearTimeout(processingTimer);
    processingTimer = null;
    processingBanner.hidden = true;
  }

  /* --- Ход диалога: только сервер --- */
  async function sendTurn() {
    const text = chatInput.value.trim();
    if (!text || done || sending || !session) return;
    sending = true;
    chatInput.disabled = true;
    chatInput.value = '';
    updateChatCounter();
    stopTimer();

    session.messages.push({ role: 'user', content: text });
    renderMessages();
    const typing = showTyping();
    showProcessing();

    try {
      const requestId = crypto.randomUUID();
      const res = await NTData.playTurn(session.id, text, session.version || 0, requestId);
      session.version = res.version;
      typing.remove();
      session.current_node_id = res.node_id;
      session.interest = res.interest;
      session.status = res.status;
      session.end_reason = res.end_reason || session.end_reason;
      const pendingUser=[...session.messages].reverse().find((m)=>m.role==='user');if(pendingUser)pendingUser.violation=Boolean(res.violation);session.messages.push({role:'opponent',content:res.reply,interest_after:res.interest,responder:res.responder,model:res.model,latency_ms:res.latency_ms,fallback_used:res.fallback_used});updateRuntime(res);if(res.violation)NTSecretary.warning('Реплика вышла за границы профессионального сценария.');else NTSecretary.setState('idle');
      session.analysis = res.analysis || session.analysis;
      renderMessages();
      updateProgress();
      renderStatsPanel();
      if (res.ended || session.status !== 'active') { finishRedirect(); return; }
      hideProcessing();
      startTimer();
    } catch (error) {
      hideProcessing();
      typing.remove();
      const priorVersion = session.version || 0;
      try {
        session = await NTData.loadSession(session.id);
        renderMessages(); updateProgress(); renderStatsPanel();
        if (session.status !== 'active') { finishRedirect(); return; }
        if (session.version > priorVersion) { startTimer(); return; }
      } catch (_) {
        session.messages.pop();
        renderMessages();
      }
      chatInput.value = text;
      updateChatCounter();
      addMsg(error.message, 'system');
      setOfflineMode(true, 'turn-error');
      NTSecretary.warning('Не удалось получить ответ. Состояние диалога сверено с сервером.');
    } finally {
      sending = false;
      if (!done) chatInput.disabled = false;
    }
  }

  async function finishRedirect() {
    if (done) return;
    done = true;
    NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
    stopTimer();
    chatInput.disabled = true;
    voiceInputBtn.disabled = true;
    processingBanner.hidden = false;
    processingTitle.textContent = 'Готовим персональный разбор…';
    processingText.textContent = 'Полный диалог сохранён только в этом браузере. На сервере останутся балл, статус и агрегированные метрики.';
    addMsg('Сессия завершена. Формирую разбор и очищаю серверную копию диалога…', 'system');
    if(session.status==='success')NTSecretary.success('Договорённость достигнута. Готовлю итоговый разбор.');else NTSecretary.warning('Попытка завершена. В отчёте покажу, что можно улучшить.');
    if (session.status !== 'abandoned') {
      try {
        session.analysis = await NTData.analyzeResult(session.id);
        NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
      } catch (error) {
        console.warn('Не удалось сформировать разбор:', error);
      }
    }
    /* Режим «Два стула»: раунд 1 -> экран паузы, раунд 2 -> сравнительный анализ. */
    if (TC_PLAN) {
      const plan = NTData.getTwoChairsPlan();
      if (plan && plan.pairId) {
        plan['round' + TC_PLAN.round + 'Done'] = true;
        plan.lastSessionId = session.id;
        if (TC_PLAN.round === 2) plan.completed = true;
        NTData.saveTwoChairsPlan(plan);
      }
      location.href = TC_PLAN.round === 1
        ? 'two-chairs-pause.html?pair=' + encodeURIComponent(TC_PLAN.pairId)
        : 'two-chairs-compare.html?pair=' + encodeURIComponent(TC_PLAN.pairId);
      return;
    }
    location.href = `results.html?id=${encodeURIComponent(session.id)}`;
  }

  function openExitDialog() {
    if (!session || done) { location.href = 'index.html'; return; }
    let modal = document.getElementById('session-exit-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'session-exit-modal';
    modal.className = 'session-exit-modal';
    modal.innerHTML = `<div class="session-exit-modal__backdrop"></div>
      <section class="session-exit-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="session-exit-title">
        <h2 id="session-exit-title">Что сделать с тренировкой?</h2>
        <p>${turnsCount() ? 'Текущие реплики останутся только в этом браузере.' : 'Вы ещё не отправили ни одной реплики — попытку всё равно можно завершить.'}</p>
        <div class="session-exit-modal__actions">
          <button class="btn btn--primary" data-exit-action="results" type="button">Завершить и открыть результат</button>
          <button class="btn btn--secondary" data-exit-action="home" type="button">Завершить и на главную</button>
          <button class="btn btn--ghost" data-exit-action="resume" type="button">На главную, продолжить позже</button>
          <button class="btn btn--ghost" data-exit-action="cancel" type="button">Остаться в чате</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('[data-exit-action="cancel"]').onclick = close;
    modal.querySelector('.session-exit-modal__backdrop').onclick = close;
    modal.querySelector('[data-exit-action="resume"]').onclick = () => { location.href = 'index.html'; };
    modal.querySelectorAll('[data-exit-action="results"],[data-exit-action="home"]').forEach((button) => {
      button.onclick = async () => {
        if (sending) { alert('Дождитесь ответа собеседника и повторите завершение.'); return; }
        modal.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        try {
          const result = await NTData.abandonSession(session.id);
          session.status = result.status;
          session.end_reason = result.end_reason || 'abandoned';
          session.analysis = result.analysis || null;
          NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
          if (TC_PLAN) {
            const plan = NTData.getTwoChairsPlan();
            if (plan && plan.pairId) {
              plan['round' + TC_PLAN.round + 'Done'] = true;
              plan.lastSessionId = session.id;
              if (TC_PLAN.round === 2) plan.completed = true;
              NTData.saveTwoChairsPlan(plan);
            }
            location.href = button.dataset.exitAction === 'home'
              ? 'index.html'
              : (TC_PLAN.round === 1 ? 'two-chairs-pause.html?pair=' + encodeURIComponent(TC_PLAN.pairId) : 'two-chairs-compare.html?pair=' + encodeURIComponent(TC_PLAN.pairId));
            return;
          }
          location.href = button.dataset.exitAction === 'home'
            ? 'index.html'
            : `results.html?id=${encodeURIComponent(session.id)}`;
        } catch (error) {
          modal.querySelector('p').textContent = error.message;
          modal.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        }
      };
    });
    modal.querySelector('[data-exit-action="results"]').focus();
  }
  exitBtn.addEventListener('click', openExitDialog);

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendTurn();
  });
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
    updateChatCounter();
  });

  /* Голосовой ввод дополняет поле, но не отправляет сообщение без подтверждения. */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceInputBtn.dataset.unsupported = 'true';
    voiceInputBtn.disabled = true;
    voiceInputBtn.title = 'Голосовой ввод не поддерживается этим браузером';
  } else {
    const dictation = new SpeechRecognition();
    dictation.lang = 'ru-RU';
    dictation.interimResults = false;
    dictation.continuous = false;
    let listening = false;
    dictation.onstart = () => { listening = true; voiceInputBtn.classList.add('is-listening'); voiceInputBtn.title = 'Говорите… Нажмите ещё раз, чтобы остановить'; };
    dictation.onend = () => { listening = false; voiceInputBtn.classList.remove('is-listening'); voiceInputBtn.title = 'Ввести сообщение голосом'; };
    dictation.onerror = (event) => { addMsg(event.error === 'not-allowed' ? 'Нет доступа к микрофону.' : 'Не удалось распознать речь. Попробуйте ещё раз.', 'system'); };
    dictation.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
      if (!transcript) return;
      const prefix = chatInput.value.trim();
      chatInput.value = prefix ? `${prefix} ${transcript}` : transcript;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    };
    voiceInputBtn.addEventListener('click', () => {
      if (listening) { dictation.stop(); return; }
      try { dictation.start(); } catch (error) { /* browser is already starting */ }
    });
  }

  /* --- Старт: возобновляем активную сессию или создаём новую --- */
  function scenarioErrorState(message) {
    const wrap = document.querySelector('.chat') || document.body;
    const box = document.createElement('div');
    box.className = 'scenario-error';
    box.style.cssText = 'margin:auto;max-width:420px;text-align:center;padding:32px;display:flex;flex-direction:column;gap:16px;align-items:center';
    box.innerHTML = '<p class="scenario-error__title" style="font-size:18px;font-weight:700">Сценарий не удалось загрузить</p>' +
      `<p class="scenario-error__text">${esc(message || 'Сценарий не найден. Возможно, он был удалён или недоступен.')}</p>` +
      '<div class="scenario-error__actions" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">' +
      (TC_PLAN ? '<a class="btn btn--primary" style="min-height:44px" href="two-chairs-pause.html?pair=' + encodeURIComponent(TC_PLAN.pairId) + '">Вернуться к паузе</a>' : '') +
      '<a class="btn" style="min-height:44px" href="index.html">На главную</a></div>';
    if (wrap && wrap.parentNode) wrap.replaceWith(box); else document.body.appendChild(box);
  }
  NTData.getScenario(scenarioId).then((sc) => {
    if (!sc) throw Object.assign(new Error('Сценарий не найден. Он мог быть создан в другой сессии сервера — вернитесь к паузе режима «Два стула» и начните диалог заново.'), { scenarioMissing: true });
    return Promise.all([
      sc,
      NTData.resumeOrCreateSession(scenarioId,'text',DIFFICULTY,TARGET_TURNS,ENGINE_MODE),
      NTData.knowledgeStatus().catch(() => ({ enabled: false, chunks: 0 }))
    ]);
  }).then(([sc, sess, rag]) => {
    if (!sess) throw new Error('Не удалось начать сессию.');
    scenario = sc;
    session=sess;NTSecretary.idle();runtimeStatus.textContent=ENGINE_MODE==='expert'?'Экспертная система выбрана':ENGINE_MODE==='cloud'?'Только облачный ИИ':'Авто: ИИ → эксперт';

    document.title = sc.title + ' — тренировка';
    chatTitle.textContent = sc.title;
    if (TC_PLAN) {
      chatTitle.innerHTML = esc(sc.title) + ` <span class="tc-pill">2 стула · диалог ${TC_PLAN.round} из 2</span>`;
      document.title = sc.title + ` — два стула · диалог ${TC_PLAN.round}`;
    }

    bodies.topics.innerHTML = `
      <div class="chips">${sc.skills.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>
      <p class="panel__note">Тема: ${esc(NTData.labels.topics[sc.topic])} · ~${sc.minutes} мин</p>`;

    bodies.info.innerHTML = `
      <div><p class="panel__sub">Ситуация</p><p class="panel__note">${esc(sc.situation)}</p></div>
      <div><p class="panel__sub">Ваша роль</p><p class="panel__note">${esc(sc.userRole)}</p></div><div><p class="panel__sub">Собеседник</p><p class="panel__note">${esc(sc.counterpart)}</p></div>
      <div><p class="panel__sub">Ваша цель</p><p class="panel__note">${esc(sc.goal)}</p></div>
      <div class="rag-session-status"><b>${rag.enabled ? 'RAG активен' : 'RAG недоступен'}</b><span>${rag.enabled ? `${rag.chunks} фрагментов справочника участвуют в поиске контекста для оппонента, коуча и отчёта.` : 'Ответы работают без справочника.'}</span></div>`;

    applyDifficultyUI();
    if (DIFFICULTY === 'hard') { hintsBtn.disabled = true; hintsBtn.hidden = true; }
    if (DIFFICULTY !== 'hard') renderHintsPanel();
    renderMessages();
    updateProgress();
    renderStatsPanel();
    startTimer();
    setTimeout(() => startTour(false), 900);
  }).catch((error) => {
    if (error && error.scenarioMissing) scenarioErrorState(error.message);
    else addMsg(error.message, 'system');
  });
})();

/* v18 — Фиделина не перекрывает открытую панель, и статус моделей в шапке */
(function () {
  'use strict';
  function syncPanels() {
    const right = document.querySelector('.side--right .panel:not([hidden])');
    const left = document.querySelector('.side--left .panel:not([hidden])');
    document.body.classList.toggle('panel-right-open', Boolean(right));
    document.body.classList.toggle('panel-left-open', Boolean(left));
  }
  const scope = document.querySelector('.session-body') || document.body;
  new MutationObserver(syncPanels).observe(scope, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  syncPanels();

  const list = document.getElementById('session-model-list');
  const note = document.getElementById('session-model-note');
  if (!list || !window.NTData) return;
  const ROLE = { dialog: 'диалог', smart: 'анализ' };
  function row(item) {
    const cls = item.available === true ? 'is-up' : item.available === false ? 'is-down' : '';
    const state = item.available === true ? (item.latency_ms ? item.latency_ms + ' мс' : 'готова') : (item.error || 'не проверена');
    return `<li class="${cls}${item.active ? ' is-active' : ''}"><span class="model-chip__role">${ROLE[item.kind] || item.kind}</span>${item.model}<b>${state}</b></li>`;
  }
  NTData.modelsStatus(false).then((data) => {
    const c = (data && data.candidates) || {};
    const rows = [].concat(c.dialog || [], c.smart || []);
    list.innerHTML = rows.length ? rows.map(row).join('') : '<li>Список моделей пуст — работает экспертная система</li>';
    if (note) {
      const when = data && data.probe_checked_at ? new Date(data.probe_checked_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
      note.textContent = when ? `Проверено при запуске в ${when}. В диалоге повторные проверки не выполняются.` : 'Проверка выполняется один раз при запуске сервера.';
    }
  }).catch(() => { list.innerHTML = '<li class="is-down">Статус моделей недоступен</li>'; });
})();
