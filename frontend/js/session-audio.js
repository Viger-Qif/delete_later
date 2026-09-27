/* ============================================================
   Страница 5: голосовая сессия (session-audio.html).
   Без заглушек: распознавание речи — Web Speech API, озвучка
   ответов — speechSynthesis, ходы и разбор — бэкенд /api.
   Через 10 секунд тишины показывается напоминание; попытка не завершается.
   ============================================================ */
(function () {
  'use strict';

  const CONFIG = JSON.parse(localStorage.getItem('nt_session_config') || 'null') || {};
  const scenarioId = new URLSearchParams(location.search).get('scenario') || CONFIG.scenario;
  const TARGET_TURNS = Math.max(4, Math.min(20, Number(CONFIG.targetTurns) || 10));
  const SILENCE_SECONDS = 10;
  const DIFFICULTY = CONFIG.difficultyMode || 'medium';
  const ENGINE_MODE=CONFIG.engineMode||'auto';
  let OFFLINE_MODE=false;

  /* --- Интеграция режима «Два стула» (голосовые сессии) --- */
  function twoChairsPlan() {
    if (!window.NTData || !NTData.getTwoChairsPlan) return null;
    const plan = NTData.getTwoChairsPlan();
    if (!plan || plan.completed) return null;
    const matches = plan.round === 2
      ? (plan.invertedId && plan.invertedId === scenarioId)
      : (plan.scenarioId && plan.scenarioId === scenarioId);
    if (!matches) return null;
    if (plan.round === 1 && plan.round1Done) return null;
    if (plan.round === 2 && plan.round2Done) return null;
    return plan;
  }
  const TC_PLAN = twoChairsPlan();
  function tcFinishUrl(sessionId) {
    if (!TC_PLAN) return `results.html?id=${encodeURIComponent(sessionId)}`;
    return TC_PLAN.round === 1
      ? 'two-chairs-pause.html?pair=' + encodeURIComponent(TC_PLAN.pairId)
      : 'two-chairs-compare.html?pair=' + encodeURIComponent(TC_PLAN.pairId);
  }
  function markRoundDone(sessionId) {
    if (!TC_PLAN) return;
    const plan = NTData.getTwoChairsPlan();
    if (plan && plan.pairId) {
      plan['round' + TC_PLAN.round + 'Done'] = true;
      plan.lastSessionId = sessionId;
      if (TC_PLAN.round === 2) plan.completed = true;
      NTData.saveTwoChairsPlan(plan);
    }
  }

  const progressFill = document.getElementById('progress-fill');
  const progressBar  = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const tutorialBtn = document.getElementById('tutorial-btn');
  const titleEl   = document.getElementById('call-title');
  const callerEl  = document.getElementById('caller');
  const captionEl = document.getElementById('call-caption');
  const timerEl   = document.getElementById('call-timer');
  const micBtn    = document.getElementById('mic-btn');
  const hintsBtn  = document.getElementById('hints-btn');
  const exitBtn   = document.getElementById('exit-btn');
  const processingBanner = document.getElementById('processing-banner');
  const processingTitle = document.getElementById('processing-title');
  const processingText=document.getElementById('processing-text');
  const runtimeStatus=document.getElementById('runtime-status');
  const bodies = {
    topics: document.getElementById('topics-body'),
    stats:  document.getElementById('stats-body'),
    hints:  document.getElementById('hints-body'),
    info:   document.getElementById('info-body')
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  let scenario = null;
  let session  = null;
  let sending = false;
  let phase = 'init'; // init | bot | wait | talk | done
  let done = false;
  let countdownId = null, countdownLeft = SILENCE_SECONDS;
  let processingTimer = null;
  const coachThread = [];
  let coachCards = [];
  const coachModal = document.getElementById('coach-modal');
  const coachModalBody = document.getElementById('coach-modal-body');
  const coachModalHistory = document.getElementById('coach-modal-history');
  const coachModalRefresh = document.getElementById('coach-modal-refresh');
  const coachModalClose = document.getElementById('coach-modal-close');
  let coachModalOpen = false;
  let coachPausedPhase = null;

  /* --- Распознавание и озвучка --- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let heardText = '';

  if (SR) {
    rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
      heardText = text;
      captionEl.textContent = text || 'Слушаю…';
    };
    rec.onerror = () => { captionEl.textContent = 'Не удалось распознать речь — попробуйте ещё раз.'; };
    rec.onend = () => {
      if (phase !== 'talk') return;
      micBtn.classList.remove('is-talking');
      const text = heardText.trim();
      heardText = '';
      if (!text) { userWait(); return; }
      sendTurn(text);
    };
  } else {
    done = true;
    phase = 'done';
    micBtn.disabled = true;
    captionEl.textContent = 'Голосовой режим не поддерживается этим браузером. Вернитесь и выберите текстовый режим.';
    NTSecretary.warning('В браузере нет распознавания речи. Используйте текстовую тренировку.');
  }

  function speak(text, onEnd) {
    captionEl.textContent = text;
    if (!('speechSynthesis' in window)) {
      setTimeout(onEnd, Math.min(2000 + text.length * 45, 9000));
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ru-RU';
    utter.onend = onEnd;
    utter.onerror = onEnd;
    speechSynthesis.speak(utter);
  }

  function setOfflineMode(on,reason){if(!on||OFFLINE_MODE)return;OFFLINE_MODE=true;try{localStorage.setItem('nt_last_offline',JSON.stringify({at:Date.now(),reason:reason||''}));}catch(_){} if(runtimeStatus){runtimeStatus.textContent='Офлайн-режим · экспертная система';runtimeStatus.dataset.responder='expert_system';runtimeStatus.classList.add('is-offline');}}
  NTData.health().then((h)=>{if(h&&h.llm_mode==='expert-system')setOfflineMode(true,'no-key');}).catch(()=>{});
  function updateRuntime(m){if(!m||!m.responder)return;if(m.responder==='expert_system')setOfflineMode(true,'expert-answer');const src=m.responder==='cloud_ai'?'Облачный ИИ':m.responder==='expert_system'?'Экспертная система':m.responder;runtimeStatus.textContent=(m.responder==='expert_system'&&OFFLINE_MODE)?'Офлайн-режим · экспертная система':`${src}${m.model?' · '+m.model:''}${m.latency_ms?' · '+m.latency_ms+' мс':''}${m.fallback_used?' · резерв':''}`;runtimeStatus.dataset.responder=m.responder;runtimeStatus.classList.toggle('is-fallback',Boolean(m.fallback_used));}

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
      coachPausedPhase = phase;
      phase = 'paused';
      pauseCountdown();
      if (rec && coachPausedPhase === 'talk') {
        try { rec.abort(); } catch (_) {}
      }
      if ('speechSynthesis' in window && speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.pause();
      micBtn.disabled = true;
    } else if (!done) {
      if ('speechSynthesis' in window && speechSynthesis.paused) speechSynthesis.resume();
      micBtn.disabled = false;
      const previousPhase = coachPausedPhase;
      phase = previousPhase;
      if (previousPhase === 'wait') startCountdown();
      if (previousPhase === 'talk') userWait();
      coachPausedPhase = null;
    }
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
      coachModalBody.innerHTML = '<b>Сначала ответьте собеседнику.</b><p>Фиделина даст совет по вашей реальной реплике, а не общую подсказку до начала разговора.</p>';
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

  /* --- Производные величины --- */
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

  function remainingTurns() { return Math.max(0, TARGET_TURNS - turnsCount()); }
  function updateProgress() {
    if (DIFFICULTY === 'hard') return;
    const pct = Math.min((turnsCount() / TARGET_TURNS) * 100, 100);
    progressFill.style.width = pct + '%';
    progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    const interestLabel = DIFFICULTY === 'easy' ? `Заинтересованность ${interestPct()}%` : `Заинтересованность: ${interestState(interestPct())[0]}`;
    progressLabel.textContent = remainingTurns() ? `${interestLabel} · примерно осталось ходов: ${remainingTurns()}` : `${interestLabel} · финальная часть`;
  }

  function interestState(pct) { if (pct < 20) return ['Почти потерян','Руководитель готов завершить разговор.']; if (pct < 40) return ['Скептически','Аргументы пока не убеждают.']; if (pct < 60) return ['Нейтрально','Руководитель ждёт конкретики.']; if (pct < 80) return ['Заинтересован','Руководитель видит основания для обсуждения.']; return ['Готов договариваться','Руководитель настроен искать решение.']; }
  function renderStatsPanel() {
    if (DIFFICULTY === 'hard') { bodies.stats.innerHTML = ''; return; }
    const pct=interestPct(),state=interestState(pct);
    const interest=DIFFICULTY==='medium'
      ? `<div class="meter"><div class="meter__head"><span>Заинтересованность</span><b>${state[0]}</b></div><p class="panel__note">${state[1]}</p></div>`
      : `<div class="meter"><div class="meter__head"><span>Заинтересованность</span><b>${pct}%</b></div><div class="meter__track"><div class="meter__fill" style="width:${pct}%"></div></div><p class="panel__note">${state[1]}</p></div>`;
    bodies.stats.innerHTML=`${interest}<p class="panel__sub">До финальной части</p><ul class="log-list"><li><span>Примерно ходов</span><b>${remainingTurns()}</b></li>${DIFFICULTY==='easy'?`<li><span>Текущий этап</span><b>${esc(nodeLabel())}</b></li>`:''}</ul>`;
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
    { target: '#exit-btn', title: 'Завершение и выход', text: 'Голосовую попытку можно завершить даже без ответа. Либо вернитесь на главную и продолжите позже.' },
    { target: '#progress-bar', title: 'Ориентир по длине', text: 'Разговор может успешно завершиться раньше, если договорённость уже достигнута.' },
    { target: '[data-panel="stats"]', title: 'Состояние переговоров', text: 'Объём информации зависит от выбранной сложности интерфейса.' },
    { target: '#hints-btn', title: 'Фиделина — коуч', text: 'Советы появляются только в этой панели и не слышны собеседнику.' },
    { target: '[data-panel="info"]', title: 'Условия сценария', text: 'Напоминает вашу цель и роль собеседника.' },
    { target: '#mic-btn', title: 'Голосовой ответ', text: 'Удерживайте кнопку и говорите. Через 10 секунд появится напоминание, но разговор не завершится автоматически.' }
  ];
  function startTour(force) { NTTour.start(TOUR_STEPS, `nt_tour_audio_${DIFFICULTY}_${scenarioId || 'default'}_v23`, force); }
  tutorialBtn.addEventListener('click', () => startTour(true));

  function renderHintsPanel() {
    bodies.hints.innerHTML = `
      <div class="secretary-coach"><div class="secretary-coach__copy"><b>Фиделина</b><small>Советы не слышны собеседнику и не влияют на оценку.</small></div></div>
      <p class="panel__sub">Советы по сценарию</p>
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
      if (coachModalBody) coachModalBody.innerHTML = '<b>Пока разбирать нечего.</b><p>Сначала ответьте собеседнику хотя бы один раз.</p>';
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
    NTSecretary.thinking('Готовлю короткий совет по текущей ситуации…');
    try {
      const res = await NTData.askHint(session.id, '');
      coachCards = res.coach?.knowledge_cards || coachCards;
      coachThread.push(res.hint);
      updateRuntime(res);
      NTSecretary.say(NTData.formatKnowledgePlainText(res.hint, coachCards),{state:'talk',returnToIdleMs:5000,open:false});
      if (coachModalBody) coachModalBody.innerHTML = NTData.formatKnowledgeText(res.hint, coachCards);
      renderCoachHistory();
    } catch (error) {
      if (coachModalBody) coachModalBody.textContent = error.message;
      NTSecretary.warning('Не удалось получить совет. Попробуйте ещё раз.');
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Получить ещё совет';
    }
  }

  /* --- Отсчёт тишины: это напоминание, а не лимит разговора. --- */
  function renderCountdown() {
    timerEl.textContent = countdownLeft > 0 ? `Напоминание через ${countdownLeft} сек` : 'Собеседник ждёт · отвечайте без спешки';
    timerEl.classList.toggle('is-low', phase === 'wait' && countdownLeft <= 4);
    timerEl.classList.toggle('is-paused', phase !== 'wait');
  }

  function startCountdown() {
    stopCountdown();
    countdownLeft = SILENCE_SECONDS;
    renderCountdown();
    countdownId = setInterval(() => {
      countdownLeft -= 1;
      renderCountdown();
      if (countdownLeft <= 0) {
        stopCountdown();
        countdownLeft = 0;
        renderCountdown();
        captionEl.textContent = 'Собеседник ждёт ответа. Нажмите и удерживайте микрофон, когда будете готовы.';
      }
    }, 1000);
  }

  function pauseCountdown() {
    stopCountdown();
    renderCountdown();
  }

  function stopCountdown() {
    clearInterval(countdownId);
    countdownId = null;
  }

  function showProcessing(title = 'Обрабатываем реплику…') {
    clearTimeout(processingTimer);
    processingBanner.hidden = false;
    NTSecretary.thinking('Собеседник анализирует вашу реплику…');
    processingTitle.textContent = title;
    processingText.textContent = 'Собеседник анализирует аргументы текущей попытки.';
    processingTimer = setTimeout(() => {
      processingTitle.textContent = 'Проверяем результат переговоров…';
      processingText.textContent = 'При финале формируется персональный разбор этого разговора.';
    }, 2500);
  }
  function hideProcessing() { clearTimeout(processingTimer); processingTimer = null; processingBanner.hidden = true; }

  /* --- Машина диалога на реальном API --- */
  function botSpeak(text) {
    if (done) return;
    phase = 'bot';
    countdownLeft = SILENCE_SECONDS;
    stopCountdown();
    renderCountdown();
    callerEl.classList.add('is-talking');
    speak(text, () => {
      callerEl.classList.remove('is-talking');
      userWait();
    });
  }

  function userWait() {
    if (done) return;
    phase = 'wait';
    captionEl.textContent = 'Ваша очередь — удерживайте кнопку микрофона и говорите.';
    startCountdown();
  }

  function micDown() {
    if (phase !== 'wait' || !rec) return;
    phase = 'talk';
    pauseCountdown();
    heardText = '';
    micBtn.classList.add('is-talking');
    captionEl.textContent = 'Слушаю…';
    try { rec.start(); } catch (e) { /* уже запущено */ }
  }

  function micUp() {
    if (phase !== 'talk' || !rec) return;
    try { rec.stop(); } catch (e) { /* уже остановлено */ }
    // дальнейшее произойдёт в rec.onend
  }

  async function sendTurn(text) {
    if (sending || done || !session) return;
    sending = true;
    phase = 'think';
    captionEl.textContent = 'Собеседник думает…';
    showProcessing();
    session.messages.push({ role: 'user', content: text });
    try {
      const res = await NTData.playTurn(session.id, text, session.version || 0, crypto.randomUUID());
      session.version = res.version;
      session.current_node_id = res.node_id;
      session.interest = res.interest;
      session.status = res.status;
      session.end_reason = res.end_reason || session.end_reason;
      const pendingUser=[...session.messages].reverse().find((m)=>m.role==='user');if(pendingUser)pendingUser.violation=Boolean(res.violation);session.messages.push({role:'opponent',content:res.reply,interest_after:res.interest,responder:res.responder,model:res.model,latency_ms:res.latency_ms,fallback_used:res.fallback_used});updateRuntime(res);if(res.violation)NTSecretary.warning('Реплика вышла за границы профессионального сценария.');else NTSecretary.idle();
      session.analysis = res.analysis || session.analysis;
      updateProgress();
      renderStatsPanel();
      if (res.ended || session.status !== 'active') { finishRedirect(); return; }
      hideProcessing();
      botSpeak(res.reply);
    } catch (error) {
      hideProcessing();
      const priorVersion = session.version || 0;
      try {
        session = await NTData.loadSession(session.id);
        if (session.status !== 'active') { finishRedirect(); return; }
        if (session.version > priorVersion) {
          updateProgress(); renderStatsPanel();
          const reply = [...session.messages].reverse().find((m) => m.role === 'opponent');
          if (reply) botSpeak(reply.content);
          return;
        }
      } catch (_) { session.messages.pop(); }
      captionEl.textContent = error.message;
      NTSecretary.warning('Не удалось получить ответ собеседника. Проверьте подключение.');
      userWait();
    } finally { sending = false; }
  }

  async function finishRedirect() {
    if (done) return;
    done = true;
    NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
    phase = 'done';
    stopCountdown();
    micBtn.disabled = true;
    processingBanner.hidden = false;
    processingTitle.textContent = 'Персональный разбор готов';
    processingText.textContent = 'Сохраняем результат именно этой попытки.';
    captionEl.textContent = 'Сессия завершена. Открываю персональный разбор…';
    if(session.status==='success')NTSecretary.success('Договорённость достигнута. Готовлю разбор.');else NTSecretary.warning('Попытка завершена. В отчёте покажу точки роста.');
    if (session.status !== 'abandoned') {
      try {
        session.analysis = await NTData.analyzeResult(session.id);
        NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
        markRoundDone(session.id);
      } catch (error) {
        console.warn('Не удалось сформировать разбор:', error);
      }
    }
    markRoundDone(session.id);
    location.href = tcFinishUrl(session.id);
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
        <p>${turnsCount() ? 'Записанные реплики останутся только в этом браузере.' : 'Вы ещё не ответили собеседнику — попытку всё равно можно завершить.'}</p>
        <div class="session-exit-modal__actions">
          <button class="btn btn--primary" data-exit-action="results" type="button">Завершить и открыть результат</button>
          <button class="btn btn--secondary" data-exit-action="home" type="button">Завершить и на главную</button>
          <button class="btn btn--ghost" data-exit-action="resume" type="button">На главную, продолжить позже</button>
          <button class="btn btn--ghost" data-exit-action="cancel" type="button">Остаться в разговоре</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('[data-exit-action="cancel"]').onclick = close;
    modal.querySelector('.session-exit-modal__backdrop').onclick = close;
    modal.querySelector('[data-exit-action="resume"]').onclick = () => { location.href = 'index.html'; };
    modal.querySelectorAll('[data-exit-action="results"],[data-exit-action="home"]').forEach((button) => {
      button.onclick = async () => {
        if (sending) { alert('Дождитесь обработки текущей реплики и повторите завершение.'); return; }
        stopCountdown();
        if (rec) { try { rec.abort(); } catch (_) {} }
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        modal.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        try {
          const result = await NTData.abandonSession(session.id);
          session.status = result.status;
          session.end_reason = result.end_reason || 'abandoned';
          session.analysis = result.analysis || null;
          NTData.saveCompletedSession(session, scenario, NTData.twoChairsExtra(TC_PLAN, TC_PLAN && TC_PLAN.round));
          markRoundDone(session.id);
          location.href = button.dataset.exitAction === 'home'
            ? 'index.html'
            : tcFinishUrl(session.id);
        } catch (error) {
          modal.querySelector('p').textContent = error.message;
          modal.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        }
      };
    });
    modal.querySelector('[data-exit-action="results"]').focus();
  }
  exitBtn.addEventListener('click', openExitDialog);

  micBtn.addEventListener('pointerdown', micDown);
  window.addEventListener('pointerup', micUp);
  window.addEventListener('pointercancel', micUp);
  micBtn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); micDown(); }
  });
  micBtn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') micUp();
  });
  micBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  /* --- Старт --- */
  if (!SR) {
    applyDifficultyUI();
    return;
  }
  function scenarioErrorState(message) {
    const wrap = document.querySelector('.chat') || document.body;
    const box = document.createElement('div');
    box.className = 'scenario-error';
    box.style.cssText = 'margin:auto;max-width:420px;text-align:center;padding:32px;display:flex;flex-direction:column;gap:16px;align-items:center';
    box.innerHTML = '<p style="font-size:18px;font-weight:700">Сценарий не удалось загрузить</p>' +
      `<p>${esc(message || 'Сценарий не найден. Возможно, он был удалён или недоступен.')}</p>` +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">' +
      (TC_PLAN ? '<a class="btn btn--primary" style="min-height:44px" href="two-chairs-pause.html?pair=' + encodeURIComponent(TC_PLAN.pairId) + '">Вернуться к паузе</a>' : '') +
      '<a class="btn" style="min-height:44px" href="index.html">На главную</a></div>';
    if (wrap && wrap.parentNode) wrap.replaceWith(box); else document.body.appendChild(box);
  }
  NTData.getScenario(scenarioId).then((sc) => {
    if (!sc) throw Object.assign(new Error('Сценарий не найден. Он мог быть создан в другой сессии сервера — вернитесь к паузе режима «Два стула» и начните диалог заново.'), { scenarioMissing: true });
    return Promise.all([
      sc,
      NTData.resumeOrCreateSession(scenarioId,'audio',DIFFICULTY,TARGET_TURNS,ENGINE_MODE),
      NTData.knowledgeStatus().catch(() => ({ enabled: false, chunks: 0 }))
    ]);
  }).then(([sc, sess, rag]) => {
    if (!sess) throw new Error('Не удалось начать сессию.');
    scenario = sc;
    session=sess;NTSecretary.idle();runtimeStatus.textContent=ENGINE_MODE==='expert'?'Экспертная система выбрана':ENGINE_MODE==='cloud'?'Только облачный ИИ':'Авто: ИИ → эксперт';

    document.title = sc.title + ' — голосовая тренировка';
    titleEl.textContent = sc.title;

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
    updateProgress();
    renderStatsPanel();
    setTimeout(() => startTour(false), 900);

    if (!rec) {
      micBtn.disabled = true;
      captionEl.textContent = 'Браузер не поддерживает распознавание речи — выберите текстовый режим.';
      return;
    }

    /* Приветствие: последняя реплика оппонента из созданной сессии */
    const greeting = [...(session.messages || [])].reverse().find((m) => m.role === 'opponent');
    botSpeak(greeting ? greeting.content : 'Здравствуйте, я на связи. Слушаю вас.');
  }).catch((error) => {
    if (error && error.scenarioMissing) scenarioErrorState(error.message);
    else captionEl.textContent = error.message;
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
