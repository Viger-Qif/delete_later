(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { exercises: [], catalog: null, progress: null, current: null, dialogue: null, dialogueStep: 0, recommendation: null, replay: null, showAll: false };

  if (window.App && App.initReveal) App.initReveal();

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function api(path, options = {}) {
    try {
      const response = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error(data.detail || 'Не удалось загрузить учебный режим.');
        failure.status = response.status;
        throw failure;
      }
      return data;
    } catch (error) {
      throw new Error(window.NTData ? NTData.errorMessage(error, error.status || 0) : 'Не удалось связаться с сервером.');
    }
  }

  function masteryFor(exercise) {
    const rows = (state.progress && state.progress.skills) || [];
    const rubricIds = exercise.rubric_ids || [];
    const relevant = rubricIds.length
      ? rows.filter((row) => rubricIds.includes(row.skill_id))
      : rows.filter((row) => row.method_id === exercise.method_id);
    if (!relevant.length) return null;
    return Math.round(relevant.reduce((sum, row) => sum + row.mastery, 0) / relevant.length);
  }

  function renderSummary() {
    const rows = (state.progress && state.progress.skills) || [];
    const total = state.exercises.length;
    const completed = Number((state.progress && state.progress.completed_exercises) || 0);
    const mastery = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.mastery, 0) / rows.length) : 0;
    $('completed-count').textContent = Math.min(total, completed);
    $('total-count').textContent = total;
    $('mastery-value').textContent = mastery + '%';
    const completion = total ? Math.min(100, Math.round((Math.min(total, completed) / total) * 100)) : 0;
    $('learning-progress-fill').style.width = `${completion}%`;
    document.querySelector('.learning-progress').setAttribute('aria-valuenow', String(completion));
    const next = state.progress && state.progress.next_exercise;
    if (next) {
      $('today-card').hidden = false;
      $('today-title').textContent = next.title || 'Следующий шаг';
      $('today-reason').textContent = next.reason || '';
      $('today-open').textContent = next.kind === 'review' ? 'Повторить' : 'Начать';
      $('today-open').onclick = () => openExercise(next.exercise_id);
    } else {
      $('today-card').hidden = true;
    }
    const checkpoint = state.catalog && state.catalog.tracks && state.catalog.tracks[0] && state.catalog.tracks[0].checkpoint;
    const required = Number((checkpoint && checkpoint.required_exercises) || 8);
    $('checkpoint-card').hidden = completed < required;
  }

  function renderLevels() {
    const units = (state.catalog && state.catalog.tracks && state.catalog.tracks[0] && state.catalog.tracks[0].units) || [];
    const list = $('level-list');
    if (!units.length || !list) return;
    const rows = units.map((unit, index) => {
      const done = state.exercises.filter((item) => item.unit_id === unit.id).every((item) =>
        (state.progress && state.progress.completed_exercises_ids || []).includes(item.id)
      );
      const active = !done && units.slice(0, index).every((previous) => {
        const items = state.exercises.filter((item) => item.unit_id === previous.id);
        return items.length === 0 || items.some((item) => (state.progress && state.progress.completed_exercises_ids || []).includes(item.id));
      });
      return `<div class="level-item ${done ? 'is-done' : active ? 'is-active' : 'is-next'}">
        <span class="level-item__number">${done ? '✓' : index + 1}</span>
        <span><b>${esc(unit.title)}</b><small>${esc(unit.description)}</small></span>
      </div>`;
    }).join('');
    list.innerHTML = rows;
  }

  function renderList() {
    const list = $('exercise-list');
    const units = (state.catalog && state.catalog.tracks && state.catalog.tracks[0] && state.catalog.tracks[0].units) || [];
    const unitTitle = Object.fromEntries(units.map((unit) => [unit.id, unit.title]));
    const completed = (state.progress && state.progress.completed_exercises_ids) || [];
    const suggestedId = state.progress && state.progress.next_exercise && state.progress.next_exercise.exercise_id;
    const suggested = state.exercises.find((item) => item.id === suggestedId)
      || state.exercises.find((item) => !completed.includes(item.id))
      || state.exercises[0];
    const visibleExercises = state.showAll || !suggested
      ? state.exercises
      : state.exercises.filter((item) => item.unit_id === suggested.unit_id);
    let previousUnit = null;
    list.innerHTML = visibleExercises.map((exercise) => {
      const index = state.exercises.findIndex((item) => item.id === exercise.id);
      const mastery = masteryFor(exercise);
      const status = mastery == null ? 'Не начато' : `${mastery}% освоения`;
      const unit = units.find((item) => item.id === exercise.unit_id);
      const heading = previousUnit !== exercise.unit_id
        ? `<div class="unit-heading"><div><span>${esc(unitTitle[exercise.unit_id] || 'Практика')}</span><small>${esc(unit && unit.description || 'Следующий шаг траектории')}</small></div><b>этап ${units.findIndex((item) => item.id === exercise.unit_id) + 1}</b></div>`
        : '';
      previousUnit = exercise.unit_id;
      return `${heading}<article class="exercise-card" style="--card-index:${index}">
        <span class="exercise-card__number">${index + 1}</span>
        <div>
          <h3 class="exercise-card__title">${esc(exercise.title)}</h3>
          <p class="exercise-card__instruction">${esc(exercise.instruction || exercise.prompt)}</p>
          <p class="exercise-card__signal"><span>Цель</span> ${esc(exercise.success_signal || 'Сделать один точный ход по задаче.')}</p>
          <div class="exercise-card__meta"><span>${esc(exercise.level === 'advanced' ? 'Перенос' : exercise.level === 'intermediate' ? 'Применение' : 'Основа')}</span><span>~${exercise.estimated_seconds || 60} сек</span><span class="exercise-card__status">${status}</span></div>
        </div>
        <button class="exercise-card__open" type="button" data-open-exercise="${esc(exercise.id)}">Начать</button>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-open-exercise]').forEach((button) => {
      button.addEventListener('click', () => openExercise(button.dataset.openExercise));
    });
    const showAll = $('show-all-exercises');
    showAll.hidden = state.exercises.length === visibleExercises.length;
    $('dialogue-launch').hidden = false;
  }

  function openExercise(id) {
    state.current = state.exercises.find((item) => item.id === id) || null;
    if (!state.current) return;
    $('exercise-list').hidden = true;
    $('exercise-runner').hidden = false;
    $('exercise-runner').classList.remove('is-entering');
    requestAnimationFrame(() => $('exercise-runner').classList.add('is-entering'));
    $('runner-label').textContent = `${state.current.level === 'advanced' ? 'Перенос' : state.current.level === 'intermediate' ? 'Применение' : 'Основа'} · упражнение`;
    $('runner-title').textContent = state.current.title;
    const origin = $('runner-origin');
    if (state.recommendation && state.recommendation.exercise_id === id) {
      const context = state.recommendation.scenario_context || {};
      origin.innerHTML = `<b>Почему это упражнение предложено для сценария «${esc(context.title || 'ваша попытка')}»</b>
        <span>${esc(state.recommendation.reason || '')}${state.recommendation.micro_goal ? ` Фокус: ${esc(state.recommendation.micro_goal)}` : ''}</span>`;
      origin.hidden = false;
    } else {
      origin.hidden = true;
      origin.textContent = '';
    }
    $('runner-context').textContent = state.current.context || state.current.prompt;
    $('runner-instruction').textContent = state.current.instruction || state.current.prompt;
    $('runner-success').textContent = state.current.success_signal ? `Признак хорошего хода: ${state.current.success_signal}` : '';
    $('runner-trap').textContent = state.current.common_trap ? `Не нужно: ${state.current.common_trap}` : '';
    $('runner-why').textContent = state.current.why_it_matters || '';
    if (state.replay && state.replay.exercise_id === id) {
      $('runner-title').textContent = 'Переиграть ключевую реплику';
      $('runner-context').textContent = `Исходная реплика: «${state.replay.original}»`;
      $('runner-instruction').textContent = state.replay.reason;
      $('runner-hint').textContent = 'Сформулируйте новую версию той же реплики по критериям упражнения.';
    } else {
      $('runner-hint').textContent = 'Одна короткая реплика — достаточно.';
    }
    $('answer-input').value = '';
    $('answer-input').disabled = false;
    $('submit-answer').disabled = false;
    $('attempt-result').hidden = true;
    $('next-exercise').hidden = true;
    $('exercise-runner').scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestAnimationFrame(() => $('answer-input').focus({ preventScroll: true }));
  }

  function assessmentTitle(result) {
    if (result.assessment === 'strong') return 'Сильный ход';
    if (result.assessment === 'usable') return 'Рабочая версия';
    return result.passed ? 'Можно использовать, но есть что усилить' : 'Сначала уточним один важный элемент';
  }

  function renderResult(result) {
    const box = $('attempt-result');
    box.hidden = false;
    box.className = `attempt-result ${result.assessment === 'usable' ? 'is-review' : result.passed ? 'is-pass' : 'is-fail'}`;
    const criteria = (result.criteria || []).map((item) => `<li class="${item.passed ? 'is-passed' : ''}">${esc(item.description)}</li>`).join('');
    box.innerHTML = `<div class="attempt-result__top"><b>${result.replay ? (result.passed ? 'Новая версия сработала лучше' : 'Новая версия требует доработки') : assessmentTitle(result)}</b><span class="attempt-result__score">${result.score}/${result.max_score}</span></div>
      <p>${esc(result.feedback)}</p>
      <ul class="criteria-list">${criteria}</ul>
      ${!result.passed && result.improved_answer ? `<p><b>Возможный вариант:</b> ${esc(result.improved_answer)}</p>` : ''}
      ${result.replay && result.opponent_reply ? `<div class="replay-response"><b>Ответ оппонента на новую реплику:</b><p>${esc(result.opponent_reply)}</p><small>Интерес: ${esc(result.interest_before)} → ${esc(result.interest_after)}</small></div>` : ''}`;
    $('next-exercise').hidden = false;
    $('coach-answer').hidden = false;
    $('coach-answer').disabled = false;
    $('coach-answer').textContent = 'Разобрать ответ с ИИ';
    $('coach-result').hidden = true;
    $('runner-hint').textContent = result.replay
      ? 'Замена не изменила исходную сессию — это безопасная проверка альтернативного хода.'
      : result.passed ? 'Навык записан в прогресс.' : 'Попробуйте учесть критерии в следующем задании.';
  }

  async function askCoach() {
    if (!state.current) return;
    const button = $('coach-answer');
    button.disabled = true;
    button.textContent = 'Готовлю разбор…';
    try {
      const result = await api('/learning/coach', {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: state.current.id,
          answer: $('answer-input').value.trim()
        })
      });
      const box = $('coach-result');
      box.hidden = false;
      box.innerHTML = `<b>Разбор ${result.source === 'llm-rag' ? 'ИИ по материалам SPIN' : 'экспертной рубрики'}</b>
        <p>${esc(result.summary || '')}</p>
        ${result.what_worked && result.what_worked.length ? `<p><strong>Что уже работает:</strong> ${esc(result.what_worked.join(' · '))}</p>` : ''}
        ${result.what_to_try && result.what_to_try.length ? `<p><strong>Следующий шаг:</strong> ${esc(result.what_to_try.join(' · '))}</p>` : ''}
        ${result.example ? `<p><strong>Пример:</strong> ${esc(result.example)}</p>` : ''}
        <small>Уверенность: ${Math.round(Number(result.confidence || 0) * 100)}%</small>`;
      button.textContent = 'Разбор обновлён';
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message || 'Не удалось получить разбор';
    }
  }

  async function submitAnswer() {
    const answer = $('answer-input').value.trim();
    if (!answer || !state.current) return;
    $('submit-answer').disabled = true;
    $('submit-answer').textContent = 'Проверяю…';
    try {
      const endpoint = state.replay
        ? (state.replay.local ? '/learning/local-replay/turn' : `/learning/replay/${encodeURIComponent(state.replay.session_id)}/turn`)
        : '/learning/attempt';
      const body = state.replay
        ? (state.replay.local ? {
            scenario_id: state.replay.scenario_id,
            message_index: state.replay.message_index,
            original: state.replay.original,
            message: answer,
            node_id: state.replay.node_id || '',
            interest_before: state.replay.interest_before,
            exercise_id: state.replay.exercise_id,
            prefix: state.replay.prefix || []
          } : { message_index: state.replay.message_index, message: answer })
        : { exercise_id: state.current.id, answer };
      const result = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      renderResult(result);
      state.progress = await api('/learning/progress');
      renderSummary();
    } catch (error) {
      $('runner-hint').textContent = error.message;
    } finally {
      $('submit-answer').disabled = false;
      $('submit-answer').textContent = 'Проверить ответ';
    }
  }

  function nextExercise() {
    const index = state.exercises.findIndex((item) => item.id === (state.current && state.current.id));
    const next = state.exercises[(index + 1) % state.exercises.length];
    if (next) openExercise(next.id);
  }

  function backToList() {
    state.current = null;
    $('exercise-runner').hidden = true;
    $('dialogue-runner').hidden = true;
    $('exercise-list').hidden = false;
    $('dialogue-launch').hidden = false;
    renderList();
  }

  async function startDialogue() {
    try {
      const data = await api('/learning/dialogues');
      state.dialogue = (data.items || [])[0] || null;
      if (!state.dialogue) throw new Error('Мини-диалог пока недоступен.');
      const content = await api('/learning/catalog');
      const full = (content.mini_dialogues || []).find((item) => item.id === state.dialogue.id);
      if (!full) {
        throw new Error('Не удалось загрузить шаги мини-диалога.');
      }
      state.dialogue = full;
      state.dialogueStep = 0;
      $('exercise-list').hidden = true;
      $('dialogue-launch').hidden = true;
      $('dialogue-runner').hidden = false;
      $('dialogue-runner').classList.remove('is-entering');
      requestAnimationFrame(() => $('dialogue-runner').classList.add('is-entering'));
      renderDialogueStep();
    } catch (error) {
      $('dialogue-hint').textContent = error.message;
    }
  }

  function renderDialogueStep() {
    const step = state.dialogue && state.dialogue.steps[state.dialogueStep];
    if (!step) return;
    $('dialogue-step').textContent = `Ход ${state.dialogueStep + 1} из ${state.dialogue.steps.length}`;
    $('dialogue-opponent').textContent = step.opponent;
    $('dialogue-prompt').textContent = step.prompt;
    $('dialogue-input').value = '';
    $('dialogue-input').disabled = false;
    $('submit-dialogue').disabled = false;
    $('dialogue-result').hidden = true;
    $('next-dialogue').hidden = true;
    $('dialogue-hint').textContent = 'Отвечайте одной репликой.';
    requestAnimationFrame(() => $('dialogue-input').focus({ preventScroll: true }));
  }

  function renderDialogueResult(result) {
    const box = $('dialogue-result');
    box.hidden = false;
    box.className = `attempt-result ${result.assessment === 'usable' ? 'is-review' : result.passed ? 'is-pass' : 'is-fail'}`;
    const criteria = (result.criteria || []).map((item) => `<li class="${item.passed ? 'is-passed' : ''}">${esc(item.description)}</li>`).join('');
    box.innerHTML = `<div class="attempt-result__top"><b>${result.passed ? 'Ход засчитан' : 'Ход можно улучшить'}</b><span class="attempt-result__score">${result.score}/${result.max_score}</span></div>
      <p>${esc(result.feedback)}</p><ul class="criteria-list">${criteria}</ul>
      ${!result.passed && result.improved_answer ? `<p><b>Возможный вариант:</b> ${esc(result.improved_answer)}</p>` : ''}`;
    $('next-dialogue').hidden = false;
    $('next-dialogue').textContent = result.finished ? 'Вернуться к упражнениям' : 'Следующий ход →';
    $('dialogue-hint').textContent = result.finished ? 'Мини-диалог завершён. Навык сохранён в прогрессе.' : 'Теперь отреагируйте на новый ответ собеседника.';
    $('reflection-form').hidden = !result.finished;
  }

  async function submitDialogue() {
    const answer = $('dialogue-input').value.trim();
    if (!answer || !state.dialogue) return;
    $('submit-dialogue').disabled = true;
    $('submit-dialogue').textContent = 'Проверяю…';
    try {
      const result = await api(`/learning/dialogues/${encodeURIComponent(state.dialogue.id)}/step`, {
        method: 'POST',
        body: JSON.stringify({ step_index: state.dialogueStep, answer })
      });
      renderDialogueResult(result);
      state.progress = await api('/learning/progress');
      renderSummary();
    } catch (error) {
      $('dialogue-hint').textContent = error.message;
    } finally {
      $('submit-dialogue').disabled = false;
      $('submit-dialogue').textContent = 'Проверить ход';
    }
  }

  function nextDialogue() {
    if (!state.dialogue) return;
    if (state.dialogueStep + 1 >= state.dialogue.steps.length) {
      backToList();
      return;
    }
    state.dialogueStep += 1;
    renderDialogueStep();
  }

  async function init() {
    try {
      const [catalog, progress] = await Promise.all([api('/learning/catalog'), api('/learning/progress')]);
      state.catalog = catalog;
      state.exercises = catalog.exercises || [];
      state.progress = progress || { skills: [], attempts: 0 };
      $('learning-state').hidden = true;
      $('exercise-list').hidden = false;
      renderSummary();
      renderLevels();
      renderList();
      const initialExercise = new URLSearchParams(location.search).get('exercise');
      const sourceSession = new URLSearchParams(location.search).get('session');
      if (sourceSession) {
        try {
          state.recommendation = await api(`/learning/recommendation/${encodeURIComponent(sourceSession)}`);
        } catch (_) {
          state.recommendation = null;
        }
      }
      if (initialExercise && state.exercises.some((item) => item.id === initialExercise)) {
        openExercise(initialExercise);
      }
      const replaySession = new URLSearchParams(location.search).get('replay');
      if (replaySession) {
        try {
          state.replay = window.NTData && NTData.getLocalReplay(replaySession);
          if (!state.replay) state.replay = await api(`/learning/replay/${encodeURIComponent(replaySession)}`);
          if (state.replay && state.exercises.some((item) => item.id === state.replay.exercise_id)) {
            openExercise(state.replay.exercise_id);
          }
        } catch (error) {
          $('runner-hint').textContent = error.message;
        }
      }
    } catch (error) {
      $('learning-state').innerHTML = `<p>${esc(error.message)}</p><a class="back-link" href="index.html">Вернуться на главную</a>`;
    }
  }

  $('submit-answer').addEventListener('click', submitAnswer);
  $('next-exercise').addEventListener('click', nextExercise);
  $('show-all-exercises').addEventListener('click', () => {
    state.showAll = true;
    renderList();
  });
  $('coach-answer').addEventListener('click', askCoach);
  $('runner-back').addEventListener('click', backToList);
  $('start-dialogue').addEventListener('click', startDialogue);
  $('dialogue-back').addEventListener('click', backToList);
  $('submit-dialogue').addEventListener('click', submitDialogue);
  $('next-dialogue').addEventListener('click', nextDialogue);
  $('reflection-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('reflection-status');
    try {
      const result = await api('/learning/reflection', {
        method: 'POST',
        body: JSON.stringify({
          source_type: 'dialogue',
          source_id: state.dialogue ? state.dialogue.id : 'spin-salary-discovery-01',
          answers: {
            tried: $('reflection-tried').value,
            noticed: $('reflection-noticed').value,
            next: $('reflection-next').value
          }
        })
      });
      status.textContent = result.saved ? 'Рефлексия сохранена.' : 'Не удалось сохранить рефлексию.';
    } catch (error) {
      status.textContent = error.message;
    }
  });
  $('answer-input').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submitAnswer();
  });
  const learningTourRestart = $('learning-tour-restart');
  if (learningTourRestart) {
    learningTourRestart.addEventListener('click', () => {
      const replay = document.getElementById('page-tour-replay');
      if (replay) replay.click();
    });
  }
  document.addEventListener('nt:tour-close', (event) => {
    if (event.detail && event.detail.key === 'nt_page_tour_learning_v3' && window.NTSecretary) {
      NTSecretary.say('Начните с короткой теории, затем откройте первое упражнение. После ответа я помогу увидеть ошибку и следующий шаг.', { state: 'talk', open: true, returnToIdleMs: 7000 });
    }
  });
  init();
})();