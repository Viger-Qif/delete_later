/* ============================================================
   СЛОЙ ДАННЫХ: единственное окно в бэкенд. Без заглушек:
   все методы ходят в /api и отдают страницам данные в тех
   форматах, к которым они привыкли (view-модели).
   ============================================================ */
window.NTData = (function () {
  'use strict';

  const API = '/api';

  function errorMessage(error, status = 0) {
    if (error && error.name === 'AbortError') return 'Запрос занял слишком много времени. Проверьте соединение и повторите действие.';
    if (!navigator.onLine) return 'Нет подключения к интернету. Проверьте сеть и повторите действие.';
    if (status === 401) return 'Сессия входа завершилась. Войдите снова.';
    if (status === 403) return 'Для этого действия недостаточно прав.';
    if (status === 429) return 'Слишком много запросов. Подождите немного и повторите.';
    if (status >= 500) return 'Сервис временно недоступен. Ваши локальные данные сохранены; попробуйте ещё раз.';
    if (error instanceof TypeError) return 'Не удалось связаться с сервером. Проверьте сеть и повторите действие.';
    return String((error && error.message) || 'Не удалось выполнить запрос.');
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch(API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error(data.detail || errorMessage(null, response.status));
        failure.status = response.status;
        throw failure;
      }
      return data;
    } catch (error) {
      throw new Error(errorMessage(error, error.status || 0));
    } finally {
      clearTimeout(timer);
    }
  }

  /* --- Словари подписей (контент фронтенда, как в app.js напарника) --- */
  const LABELS = {
    difficulty: { easy: 'Лёгкий', mid: 'Средний', hard: 'Сложный' },
    topics: { sales: 'Продажи', procurement: 'Закупки', hr: 'Найм и HR', conflict: 'Конфликты', general: 'Общая тема' }
  };

  const TOPIC_PATHS = {
    sales: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    procurement: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    hr: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    conflict: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    general: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'
  };

  const INTENT_LABELS = {
    ask_about_needs: 'Выяснить потребности', pitch_immediately: 'Сразу презентовать решение', discuss_price: 'Обсудить цену',
    present_solution: 'Представить решение', give_big_discount: 'Предложить чрезмерную скидку', propose_pilot: 'Предложить пилот',
    agree_terms: 'Согласовать условия', push_too_hard: 'Оказать чрезмерное давление', present_achievements: 'Привести достижения и цифры',
    demand_raise: 'Потребовать повышение без аргументов', mention_market: 'Сослаться на рынок', ask_decision: 'Спросить о решении',
    propose_compromise: 'Предложить компромисс', threaten_quit: 'Угрожать увольнением', ultimatum: 'Поставить ультиматум',
    ask_cost_drivers: 'Уточнить причины роста цены', reject_immediately: 'Сразу отвергнуть повышение',
    ask_supplier_interests: 'Выяснить интересы поставщика', demand_old_price: 'Требовать старую цену', present_package: 'Предложить пакетный обмен',
    discuss_price_only: 'Торговаться только о цене', threaten_supplier: 'Угрожать поставщику', propose_terms: 'Предложить конкретные условия',
    give_unconditional_concession: 'Уступить без встречного условия', acknowledge_risk: 'Признать общий риск', blame_sales: 'Обвинить отдел продаж',
    ask_client_priority: 'Уточнить приоритет клиента', defend_team: 'Защищаться вместо решения', propose_mvp: 'Предложить поэтапный MVP',
    argue_estimate: 'Спорить об оценке', escalate_conflict: 'Усилить конфликт', promise_impossible: 'Пообещать нереальный срок',
    set_agenda: 'Обозначить тему и цель встречи', explain_scope: 'Показать расширение ответственности',
    make_specific_request: 'Назвать конкретный диапазон повышения', use_vague_claims: 'Использовать общие заявления без фактов',
    compare_with_colleagues: 'Сравнивать себя с коллегами', rely_only_on_market: 'Ссылаться только на рынок',
    discuss_budget: 'Уточнить бюджетные ограничения', ask_timeline: 'Уточнить сроки решения', propose_options: 'Предложить несколько вариантов',
    reinforce_value: 'Ещё раз связать вклад с ценностью для бизнеса', provide_metrics: 'Привести личные метрики и факты',
    propose_kpi_plan: 'Предложить план с KPI', ask_for_concrete_date: 'Попросить конкретную дату пересмотра',
    propose_package: 'Собрать пакет условий', reject_alternatives: 'Отвергнуть все альтернативы', negotiate_terms: 'Обсудить встречные условия',
    reject_conditions: 'Отказаться от условий', confirm_raise: 'Подтвердить повышение сейчас', confirm_review_plan: 'Зафиксировать план пересмотра',
    clarify_terms: 'Уточнить сумму, дату и ответственных'
  };
  const SKILL_FOCUS_LABELS = {
    'факты': 'Работа с фактами',
    'контекст': 'Сбор контекста',
    'интересы': 'Выяснение интересов',
    'вопросы': 'Качество вопросов',
    'критерии': 'Критерии решения',
    'последствия': 'Анализ последствий',
    'варианты': 'Разработка вариантов',
    'взаимная выгода': 'Взаимная выгода',
    'возражение': 'Работа с возражениями',
    'обмен условиями': 'Обмен условиями',
    'закрытие': 'Фиксация договорённости',
    'следующий шаг': 'Следующий шаг'
  };

  const ADVICE = {
    sc_seed_salary: [
      'Начните с результатов: цифры, проекты и эффект.',
      'Свяжите повышение с новой ответственностью.',
      'Если бюджета нет, предложите дату пересмотра или KPI-бонус.',
      'Не ставьте ультиматум.'
    ],
    generic: [
      'Сначала выясните потребности и критерии решения.',
      'Говорите через измеримый эффект.',
      'На возражение отвечайте уточняющим вопросом.',
      'Предлагайте конкретный следующий шаг.'
    ]
  };

  /* --- Маппинг серверного сценария на view-модель --- */
  const DIFF_MAP = { easy: 'easy', medium: 'mid', mid: 'mid', hard: 'hard' };
  const STARS = { easy: 2, mid: 3, hard: 4 };

  function topicFromIndustry(industry) {
    const s = String(industry || '').toLowerCase();
    if (/продаж|sales|клиент|сбыт/.test(s)) return 'sales';
    if (/закуп|постав|логист|procure/.test(s)) return 'procurement';
    if (/найм|hr|зарплат|карьер|персонал/.test(s)) return 'hr';
    if (/конфликт|спор|претенз|суд|team|команд/.test(s)) return 'conflict';
    return 'general';
  }

  function intentLabel(value) {
    return INTENT_LABELS[value] || String(value).split('_').join(' ');
  }

  function mapScenario(s) {
    const nodes = (s.graph && s.graph.nodes) || [];
    const edges = (s.graph && s.graph.edges) || [];
    const difficulty = DIFF_MAP[s.difficulty] || 'mid';
    const focusSkills = nodes.flatMap((node) => node.coach_focus || [])
      .map((value) => SKILL_FOCUS_LABELS[String(value).toLowerCase()] || '');
    const endIds = new Set(nodes.filter((node) => node.type === 'end').map((node) => node.id));
    const transitionSkills = edges
      .filter((edge) => edge.trigger?.type === 'intent' && !endIds.has(edge.to) && INTENT_LABELS[edge.trigger.value])
      .map((edge) => intentLabel(edge.trigger.value));
    const skills = [...new Set([...focusSkills, ...transitionSkills].filter(Boolean))].slice(0, 4);
    const scenarioHints = [...new Set(nodes.map((node) => String(node.coach_hint || '').trim()).filter(Boolean))].slice(0, 4);

    return {
      id: s.id,
      title: s.title,
      desc: s.description || '',
      difficulty,
      topic: topicFromIndustry(s.industry),
      minutes: Math.max(10, nodes.filter((n) => n.type !== 'end').length * 3),
      stars: STARS[difficulty],
      situation: s.description || '',
      counterpart: s.opponent?.role || 'Собеседник по ситуации',
      goal: s.goal || '',
      userRole: s.user_role || 'Участник переговоров',
      skills: skills.length ? skills : ['Выяснение потребностей', 'Аргументация цифрами', 'Обмен уступками'],
      methods: ADVICE[s.id] || (scenarioHints.length ? scenarioHints : ADVICE.generic),
      knowledgeRefs: (s.knowledge_refs || []).filter((id) => String(id).startsWith('spin-')),
      tags: s.tags || [],
      coachProfile: s.coach_profile || {},
      graph: s.graph || null,
      interestRange: s.interest || { min: 0, max: 100 },
      modes: s.modes || ['text'],
      twoChairsPair: s.two_chairs_pair || null,
      invertedOf: s.inverted_of || null
    };
  }

  /* --- Маппинг серверной сессии на view-модель --- */
  function percent(interest, range) {
    const min = range.min ?? 0, max = range.max ?? 100;
    return Math.max(0, Math.min(100, Math.round(((interest - min) / Math.max(1, max - min)) * 100)));
  }

  function mapSession(item, scenarioById) {
    const range = (scenarioById[item.scenario_id] || {}).interestRange || { min: 0, max: 100 };
    const rawMessages = item.messages || [];
    const messages = rawMessages
      .filter((m) => m.role === 'user' || m.role === 'opponent')
      .map((m) => ({ who: m.role === 'user' ? 'user' : 'bot', text: m.content, nodeId: m.node_id || '', interestAfter: m.interest_after ?? null, violation: Boolean(m.violation) }));
    const turns = Number.isFinite(Number(item.turns)) ? Number(item.turns) : messages.filter((m) => m.who === 'user').length;
    const interestHistory = rawMessages
      .filter((m) => m.role === 'opponent' && Number.isFinite(Number(m.interest_after)))
      .map((m) => percent(Number(m.interest_after), range));
    const a = item.analysis;

    return {
      id: item.id,
      scenario: item.scenario_id,
      title: item.scenario_title || 'Сценарий',
      mode: item.mode === 'voice' ? 'audio' : (item.mode || 'text'),
      date: item.created_at,
      turns,
      score: a ? a.score : null,
      interest: percent(item.interest, range),
      // Estimate only: active speaking and coach pauses are not timed.
      minutes: turns ? Math.round(turns * 1.2) : 0,
      ended: item.status === 'active' ? 'active' : item.status === 'abandoned' ? 'exit' : 'finished',
      interestHistory,
      messages,
      violationCount: Number.isFinite(Number(item.violation_count)) ? Number(item.violation_count) : messages.filter((m) => m.who === 'user' && m.violation).length,
      endReason: item.end_reason || '',
      analysis: a ? { good: a.praise || [], bad: a.improvements || [], moments: [], recommend: a.summary || '', skills: a.skills || {}, evidence: a.evidence || [], knowledge_refs: (a.knowledge_refs || []).filter((id) => String(id).startsWith('spin-')), id: a.analysis_id || '', turnsAnalyzed: a.turns_analyzed || turns, source: a.source || '', runtime: a.runtime || null } : null,
      status: item.status
    };
  }

  /* --- Чтения: только сервер --- */
  let scenarioCache = null;

  function fetchScenarios() {
    if (scenarioCache) return Promise.resolve(scenarioCache);
    return api('/scenarios').then((data) => {
      scenarioCache = (data.items || []).map(mapScenario);
      return scenarioCache;
    });
  }

  function listScenarios() { return fetchScenarios(); }

  function getScenario(id) {
    return fetchScenarios().then((list) => {
      const found = list.find((s) => s.id === id);
      if (found || !id) return found || null;
      // Own unpublished scenarios are intentionally absent from the public
      // catalog.  Ask the protected detail endpoint as a fallback so a user
      // can still open a draft from the profile page.
      return api(`/scenarios/${encodeURIComponent(id)}`).then(mapScenario).catch(() => null);
    });
  }

  const HISTORY_KEY = 'nt_completed_sessions_v1';
  const LATEST_KEY = 'nt_latest_completed_session_v1';
  const LOCAL_HISTORY_DAYS = 30;
  function readHistory() {
    try {
      const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const cutoff = Date.now() - LOCAL_HISTORY_DAYS * 24 * 60 * 60 * 1000;
      const kept = Array.isArray(rows) ? rows.filter((item) => !item.date || new Date(item.date).getTime() >= cutoff) : [];
      if (kept.length !== rows.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
      return kept;
    } catch {
      return [];
    }
  }
  function writeHistory(rows) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, 50)));
  }
  function saveCompletedSession(raw, scenario, extra = {}) {
    const record = mapSession(raw, { [scenario.id]: scenario });
    record.ended = raw.status === 'abandoned' ? 'exit' : 'finished';
    Object.assign(record, extra);
    const rows = readHistory().filter((item) => item.id !== record.id);
    // Одна запись на режим «Два стула»: при сохранении второго раунда
    // обновляем существующую запись пары, а не плодим дубликаты.
    if (record.pairId) {
      const existing = rows.find((item) => item.pairId === record.pairId);
      if (existing) {
        const merged = { ...existing, ...record, id: existing.id, date: existing.date,
          firstRound: existing.firstRound || record.firstRound,
          secondRound: record.secondRound || existing.secondRound };
        rows.splice(rows.indexOf(existing), 1, merged);
        writeHistory(rows);
        localStorage.setItem(LATEST_KEY, merged.id);
        return merged;
      }
    }
    rows.unshift(record);
    writeHistory(rows);
    localStorage.setItem(LATEST_KEY, record.id);
    return record;
  }
  function fetchSessions() {
    return Promise.all([api('/sessions'), api('/sessions/results').catch(() => ({items:[]})), fetchScenarios(), authMe().catch(() => ({authenticated:false,user:null}))]).then(([sess, results, scens, auth]) => {
      const byId = Object.fromEntries(scens.map((item) => [item.id, item]));
      const active = (sess.items || []).map((item) => mapSession(item, byId));
      const local = readHistory();
      const server = [...active, ...(results.items || []).map((item) => mapSession(item, byId))];
      const merged = new Map(server.map((item) => [item.id, item]));
      local.forEach((item) => {
        const remote = merged.get(item.id);
        merged.set(item.id, remote ? {
          ...remote,
          messages: item.messages || [],
          interestHistory: item.interestHistory || [],
          analysis: item.analysis || remote.analysis,
          score: item.score ?? remote.score,
          twoChairs: item.twoChairs || undefined,
          pairId: item.pairId || undefined,
          firstRound: item.firstRound || undefined,
          secondRound: item.secondRound || undefined
        } : item);
      });
      return [...merged.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    });
  }
  function listSessions() { return fetchSessions(); }
  function listResults() { return api('/sessions/results').then((data) => data.items || []); }
  async function getSession(id) {
    const all = await fetchSessions();
    const item = all.find((row) => row.id === id);
    if (!item) return null;
    const path = item.ended === 'active' ? `/sessions/${id}` : `/sessions/results/${id}`;
    const local = readHistory().find((row) => row.id === id);
    try {
      const raw = await api(path);
      const scenario = await getScenario(raw.scenario_id);
      const remote = mapSession(raw, { [raw.scenario_id]: scenario || {} });
      return local ? {
        ...remote,
        messages: local.messages || [],
        interestHistory: local.interestHistory || [],
        analysis: local.analysis || remote.analysis,
        score: local.score ?? remote.score,
        twoChairs: local.twoChairs || undefined,
        pairId: local.pairId || undefined,
        firstRound: local.firstRound || undefined,
        secondRound: local.secondRound || undefined
      } : remote;
    } catch (error) {
      if (local) return local;
      throw error;
    }
  }
  async function getSessionResult(id = '') {
    const latest = localStorage.getItem(LATEST_KEY);
    const rows = await fetchSessions();
    const selected = rows.find((r) => r.id === id) || rows.find((r) => r.id === latest) || rows.find((r) => r.ended !== 'active');
    return selected ? getSession(selected.id) : null;
  }

  /* --- Сессии: сырой серверный формат для страниц тренировки --- */
  function openSession(scenarioId, mode, difficultyMode = 'medium', targetTurns = 10, engineMode = 'auto') {
    const apiMode = mode === 'audio' ? 'voice' : mode;
    return api('/sessions', { method: 'POST', body: JSON.stringify({ scenario_id: scenarioId, mode: apiMode, difficulty_mode: difficultyMode, target_turns: targetTurns, engine_mode: engineMode }) });
  }

  function loadSession(id) { return api(`/sessions/${id}`); }

  /* Если по сценарию уже есть активная сессия — возвращаемся в неё,
     иначе создаём новую: перезагрузка страницы не плодит дубликаты */
  function resumeOrCreateSession(scenarioId, mode, difficultyMode = 'medium', targetTurns = 10, engineMode = 'auto') {
    return api('/sessions').then((data) => {
      const apiMode = mode === 'audio' ? 'voice' : mode;
      const active = (data.items || []).find((item) => item.status === 'active' && item.scenario_id === scenarioId && item.mode === apiMode && (item.difficulty_mode || 'medium') === difficultyMode && (item.target_turns || 10) === targetTurns && (item.engine_mode || 'auto') === engineMode);
      return active ? api(`/sessions/${active.id}`) : openSession(scenarioId, mode, difficultyMode, targetTurns, engineMode);
    });
  }

  function playTurn(sessionId, message, version, requestId) {
    return api(`/sessions/${sessionId}/turn`, { method: 'POST', body: JSON.stringify({ message, version, request_id: requestId }) });
  }
  function analyzeResult(sessionId) {
    return api(`/sessions/results/${sessionId}/analyze`, { method: 'POST' }).then((analysis) => {
      const rows = readHistory();
      const row = rows.find((item) => item.id === sessionId);
      if (row) {
        row.analysis = {
          good: analysis.praise || [], bad: analysis.improvements || [], moments: [],
          recommend: analysis.summary || '', skills: analysis.skills || {},
          evidence: analysis.evidence || [], knowledge_refs: analysis.knowledge_refs || [],
          id: analysis.analysis_id || '', turnsAnalyzed: analysis.turns_analyzed || row.turns,
          source: analysis.source || '', runtime: analysis.runtime || null
        };
        row.score = analysis.score;
        writeHistory(rows);
      }
      return analysis;
    });
  }

  function exportLocalHistory() {
    return {
      exported_at: new Date().toISOString(),
      retention_days: LOCAL_HISTORY_DAYS,
      storage: 'browser-local',
      sessions: readHistory()
    };
  }
  function clearLocalHistory() {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LATEST_KEY);
  }
  function localPrivacyInfo() {
    return { count: readHistory().length, retentionDays: LOCAL_HISTORY_DAYS };
  }

  const LOCAL_REPLAY_KEY = 'nt_local_replay_v1';
  function prepareLocalReplay(record) {
    const messages = Array.isArray(record && record.messages) ? record.messages : [];
    const userIndexes = messages.map((item, index) => [item, index]).filter(([item]) => item.who === 'user');
    if (!userIndexes.length) return null;
    const evidence = record.analysis?.evidence || [];
    const evidenceTurn = Number(evidence[0]?.turn_index || 0);
    const markers = ['хочу повышение', 'повышение на', 'мне нужно', 'предлагаю сразу', 'скидк'];
    let selected = userIndexes.find(([item]) => markers.some((marker) => String(item.text || '').toLowerCase().includes(marker))) || userIndexes[0];
    if (evidenceTurn >= 1 && evidenceTurn <= userIndexes.length) selected = userIndexes[evidenceTurn - 1];
    const [message, index] = selected;
    const prefixRows = messages.slice(0, index);
    const previousOpponent = [...prefixRows].reverse().find((item) => item.who === 'bot' && Number.isFinite(Number(item.interestAfter)));
    const skills = record.analysis?.skills || {};
    const evidenceSkill = String(evidence[0]?.skill_id || '');
    const exerciseId = evidenceSkill === 'spin.problem' || Number(skills.questions ?? 100) < 60
      ? 'drill-spin-01'
      : evidenceSkill === 'spin.need_payoff' || Number(skills.value ?? 100) < 60
        ? 'drill-spin-03' : 'drill-spin-02';
    const reasons = {
      'drill-spin-01': 'Переиграйте ход через открытый проблемный вопрос, не переходя сразу к решению.',
      'drill-spin-03': 'Переиграйте ход через вопрос о ценности изменения для собеседника.',
      'drill-spin-02': 'Переиграйте ход через вопрос о последствиях проблемы.'
    };
    const replay = {
      local: true, session_id: record.id, scenario_id: record.scenario,
      message_index: index, original: message.text, node_id: message.nodeId || '',
      interest_before: Number(previousOpponent?.interestAfter ?? 50),
      exercise_id: exerciseId, reason: reasons[exerciseId],
      prefix: prefixRows.map((item) => ({
        role: item.who === 'user' ? 'user' : 'opponent',
        content: item.text, node_id: item.nodeId || null, interest_after: item.interestAfter
      }))
    };
    sessionStorage.setItem(LOCAL_REPLAY_KEY, JSON.stringify(replay));
    return replay;
  }
  function getLocalReplay(sessionId) {
    try {
      const value = JSON.parse(sessionStorage.getItem(LOCAL_REPLAY_KEY) || 'null');
      return value && value.session_id === sessionId ? value : null;
    } catch (_) { return null; }
  }

  function askHint(sessionId, question) {
    return api(`/sessions/${sessionId}/hint`, { method: 'POST', body: JSON.stringify({ question: question || '' }) });
  }

  function abandonSession(sessionId) {
    return api(`/sessions/${sessionId}/abandon`, { method: 'POST' });
  }

  function generateScenario(description, options = {}) {
    scenarioCache = null;
    return api('/scenarios/generate-preview', { method: 'POST', body: JSON.stringify({ description, engine_mode: 'auto' }), signal: options.signal });
  }
  function refineScenario(scenario, instruction, options = {}) {
    return api('/scenarios/refine-preview', {
      method: 'POST',
      body: JSON.stringify({ scenario, instruction, engine_mode: 'auto' }),
      signal: options.signal
    });
  }

  function listEditableScenarios() { return api('/scenarios?include_unpublished=true').then((data) => data.items || []); }
  function createScenario(payload) { scenarioCache = null; return api('/scenarios', { method: 'POST', body: JSON.stringify(payload) }); }
  function updateScenario(id, payload) { scenarioCache = null; return api(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }
  function validateScenario(payload) { return api('/scenarios/validate', { method: 'POST', body: JSON.stringify(payload) }); }
  function publishScenario(id) {
    scenarioCache = null;
    return api(`/scenarios/${id}/publish`, { method: 'POST', body: JSON.stringify({ published: true }) });
  }

  /* --- Режим «Два стула» --- */
  const TWO_CHAIRS_PLAN_KEY = 'nt_two_chairs_plan_v1';
  function createTwoChairsPair(scenarioId) {
    scenarioCache = null;
    return api(`/scenarios/${encodeURIComponent(scenarioId)}/two-chairs`, { method: 'POST' })
      .then((data) => ({ scenario: mapScenario(data.scenario), inverted: mapScenario(data.inverted), created: data.created }));
  }
  function saveTwoChairsPlan(plan) {
    try { localStorage.setItem(TWO_CHAIRS_PLAN_KEY, JSON.stringify(plan)); } catch (_) {}
    return plan;
  }
  function getTwoChairsPlan() {
    try {
      const plan = JSON.parse(localStorage.getItem(TWO_CHAIRS_PLAN_KEY) || 'null');
      return plan && plan.pairId ? plan : null;
    } catch (_) { return null; }
  }
  function clearTwoChairsPlan() { localStorage.removeItem(TWO_CHAIRS_PLAN_KEY); }
  function findTwoChairsRecord(id) {
    return readHistory().find((item) => item.twoChairs && (item.pairId === id || item.id === id)) || null;
  }

  function health() { return api('/health'); }
  function modelsStatus(probe=false) {
    const key='nt_models_status_v1', maxAge=5*60*1000;
    if (probe) { try { const cached=JSON.parse(sessionStorage.getItem(key)||'null'); if(cached&&Date.now()-cached.savedAt<maxAge)return Promise.resolve(cached.value); } catch {} }
    return api('/models/status?probe='+String(Boolean(probe))).then((value)=>{ if(probe){try{sessionStorage.setItem(key,JSON.stringify({savedAt:Date.now(),value}));}catch{}} return value; });
  }
  function knowledgeStatus() { return api('/knowledge/status'); }
  function authMe() { return api('/auth/me'); }
  function logout() { return api('/auth/logout', { method: 'POST' }); }
  function deleteAccount() { return api('/auth/account', { method: 'DELETE' }); }
  // Model-generated references may arrive as **salary-opening-frame**.
  // Render known IDs as readable handbook links instead of exposing markup.
  function formatKnowledgeText(text, cards = []) {
    const titles = Object.fromEntries((cards || []).map((card) => [String(card.id), String(card.title || 'Карточка справочника')]));
    const safe = String(text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return safe.replace(/\*\*([a-z0-9][a-z0-9_-]*)\*\*/gi, (match, id) => {
      const title = titles[id];
      if (!title) return 'карточку справочника';
      const label = title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      return `<a class="knowledge-link" href="${methodHref(id)}">${label}</a>`;
    });
  }

  // The character bubble is deliberately text-only. Replace grounded IDs
  // with readable card titles there; the full coach panel keeps them clickable.
  function formatKnowledgePlainText(text, cards = []) {
    const titles = Object.fromEntries((cards || []).map((card) => [String(card.id), String(card.title || 'Карточка справочника')]));
    return String(text || '').replace(/\*\*([a-z0-9][a-z0-9_-]*)\*\*/gi, (match, id) => (
      titles[id] ? `карточка «${titles[id]}»` : 'карточка справочника'
    ));
  }

  /* --- Справочник: 7 связных методик вместо технических карточек ---
     Атомарные RAG-чанки (spin-question-sequence и т.п.) остаются для моделей,
     но человек всегда попадает на страницу методики и видит её название, а не ID. */
  const METHODS = {
    harvard: 'Гарвардский метод',
    spin: 'SPIN',
    batna: 'BATNA',
    'active-listening': 'Активное слушание',
    anchoring: 'Якорение',
    'hard-tactics': 'Жёсткие тактики',
    closing: 'Закрытие договорённостей'
  };
  const METHOD_KEYS = Object.keys(METHODS).sort((a, b) => b.length - a.length);
  function methodForRef(ref) {
    const key = String(ref || '').trim().toLowerCase().replace(/_/g, '-');
    return METHOD_KEYS.find((id) => key === id || key.startsWith(id + '-')) || '';
  }
  function methodHref(ref) {
    const id = methodForRef(ref);
    return id ? `method.html?id=${encodeURIComponent(id)}` : 'handbook.html';
  }
  /* Список ID чанков -> уникальные ссылки на методики { id, title, href }. */
  function methodLinks(refs) {
    const seen = new Set();
    return (refs || []).map(methodForRef).filter((id) => id && !seen.has(id) && seen.add(id))
      .map((id) => ({ id, title: METHODS[id], href: `method.html?id=${encodeURIComponent(id)}` }));
  }

  function topicIcon(topic, size = 20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TOPIC_PATHS[topic] || TOPIC_PATHS.general}</svg>`;
  }

  return {
    listScenarios, getScenario,
    listSessions, listResults, getSession, getSessionResult,
    openSession, loadSession, resumeOrCreateSession, playTurn, analyzeResult, askHint, abandonSession,
    generateScenario, refineScenario, listEditableScenarios, createScenario, updateScenario, validateScenario,
    publishScenario, createTwoChairsPair, saveTwoChairsPlan, getTwoChairsPlan, clearTwoChairsPlan,
    findTwoChairsRecord, TWO_CHAIRS_PLAN_KEY,
    health, modelsStatus, knowledgeStatus, authMe, logout, deleteAccount, saveCompletedSession,
    exportLocalHistory, clearLocalHistory, localPrivacyInfo, prepareLocalReplay, getLocalReplay,
    topicIcon, labels: LABELS, formatKnowledgeText, formatKnowledgePlainText,
    methods: METHODS, methodForRef, methodHref, methodLinks, errorMessage
  };
})();