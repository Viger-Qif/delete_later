/* ============================================================
   Страница 6: итог сессии (results.html).
   Без заглушек: разбор берётся только с сервера. Если анализа
   нет (сессия ещё идёт) — честно показываем заметку.
   ============================================================ */
(function () {
  'use strict';

  const root  = document.getElementById('results-root');
  const empty = document.getElementById('results-empty');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function verdict(result) {
    if (result.ended === 'exit')   return { text: 'Сессия завершена досрочно.', tone: 'muted' };
    if (result.status === 'failure') return { text: 'Попытка завершена: нарушены границы сценария или конструктивного общения.', tone: 'warning' };
    if (result.ended === 'active') return { text: 'Сессия ещё идёт — итог обновится после завершения.', tone: 'accent' };
    if (result.interest >= 70) return { text: 'Отличная сессия: интерес собеседника высокий, договорённость близка.', tone: 'success' };
    if (result.interest >= 50) return { text: 'Хороший темп, но есть над чем работать в следующих раундах.', tone: 'accent' };
    if (result.interest >= 35) return { text: 'Собеседник остался настороже — стоит усилить аргументацию.', tone: 'warning' };
    return { text: 'Собеседник потерял интерес. Пересмотрите структуру аргументов.', tone: 'warning' };
  }

  function toneColor(tone) {
    return {
      success: 'var(--success)',
      accent:  'var(--accent)',
      warning: 'var(--warning)',
      muted:   'var(--text-muted)'
    }[tone] || 'var(--accent)';
  }

  function pillClass(difficulty) {
    return { easy: 'pill--easy', mid: 'pill--mid', hard: 'pill--hard' }[difficulty] || 'pill--mid';
  }

  async function render() {
    let result, scenarios;
    try {
      [result, scenarios] = await Promise.all([
        NTData.getSessionResult(new URLSearchParams(location.search).get('id') || ''),
        NTData.listScenarios()
      ]);
    } catch (error) {
      empty.querySelector('.results-empty__title').textContent = 'Не удалось загрузить результат'; empty.querySelector('p:last-child').textContent = error.message; const loader = empty.querySelector('.results-loader'); if (loader) loader.remove();
      return;
    }

    if (!result) {
      empty.querySelector('.results-empty__title').textContent = 'Нет данных о новой сессии';
      empty.querySelector('p:last-child').textContent = 'Пройдите тренировку — здесь появится её персональный разбор.';
      const loader = empty.querySelector('.results-loader'); if (loader) loader.remove();
      const link = document.createElement('a'); link.className = 'btn btn--primary'; link.href = 'catalog.html'; link.textContent = 'В каталог сценариев'; empty.appendChild(link);
      return;
    }

    const scenario  = scenarios.find((s) => s.id === result.scenario);
    if (result.ended !== 'active' && result.status !== 'abandoned' && !result.analysis) {
      try {
        await NTData.analyzeResult(result.id);
        result = await NTData.getSession(result.id);
      } catch (error) {
        // Transcript remains available even if Cloud analysis fails.
        console.warn('Не удалось сформировать разбор:', error);
      }
    }
    const analysis  = result.analysis;
    const good      = (analysis && (analysis.good || analysis.praise)) || [];
    const bad       = (analysis && (analysis.bad || analysis.improvements)) || [];
    const moments   = (analysis && analysis.moments) || [];
    const recommend = (analysis && (analysis.recommend || analysis.summary)) || '';

    const v = verdict(result);
    const reasonLabels = { misconduct: 'Повторный уход от темы или нарушение профессиональных границ.', agreement: 'Договорённость достигнута.', no_agreement: 'Договорённость не достигнута в пределах попытки.', abandoned: 'Пользователь завершил попытку досрочно.' };
    const endReasonText = reasonLabels[result.endReason] || '';
    const ringPct = Math.max(5, Math.min(100, result.interest || 0));
    const ringColor = toneColor(v.tone);
    const modeLabel = result.mode === 'audio' ? 'Голос' : 'Текст';
    const positiveHeading = (result.violationCount || 0) > 0 || Number(result.score || 0) < 50 ? 'Что зафиксировано' : 'Что получилось';
    const durationLabel = scenario ? `~${scenario.minutes} мин` : '—';
    const dateLabel = result.date
      ? new Date(result.date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';

    empty.remove();

    const card = document.createElement('article');
    card.className = 'results__card';
    card.setAttribute('data-reveal', '');

    card.innerHTML = `
      <section class="result-hero">
        <div class="result-hero__left">
          <h2 class="result-hero__title">${esc(result.title || 'Сценарий')}</h2>
          <div class="result-hero__meta">
            ${scenario ? `<span class="pill ${pillClass(scenario.difficulty)}">${esc(NTData.labels.difficulty[scenario.difficulty])}</span>` : ''}
            <span class="chip">${modeLabel}</span>
            ${scenario ? `<span class="chip">${esc(NTData.labels.topics[scenario.topic])}</span>` : ''}
            <span class="chip">${dateLabel}</span>
          </div>
          <p class="result-hero__verdict">${esc(v.text)}</p>
        </div>
        <div class="score-ring" style="--ring-pct:${ringPct};--ring-color:${ringColor}" aria-label="Интерес собеседника ${ringPct}%">
          <div class="score-ring__value">
            <span class="score-ring__number">${ringPct}</span>
            <span class="score-ring__label">интерес</span>
          </div>
        </div>
      </section>

      ${endReasonText ? `<section class="end-reason"><b>Почему завершилась попытка</b><span>${esc(endReasonText)}</span></section>` : ''}

      <section class="metrics" aria-label="Ключевые метрики">
        <div class="metric">
          <span class="metric__label">Баллы</span>
          <span class="metric__value">${result.score ?? '—'}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Ходов</span>
          <span class="metric__value">${result.turns ?? 0}</span>
        </div>
        <div class="metric">
          <span class="metric__label">Режим</span>
          <span class="metric__value" style="font-size:16px">${modeLabel}</span>
        </div>
        <div class="metric">
          <span class="metric__label" title="Ориентир из карточки сценария, а не измеренная длительность">Ориентир по сценарию</span>
          <span class="metric__value" style="font-size:16px">${durationLabel}</span>
        </div>
      </section>

      ${analysis ? `
      <div class="report-meta">
        <span>Персональный разбор</span>
        <b>${analysis.turnsAnalyzed || result.turns || 0} реплик пользователя</b>
        ${analysis.id ? `<code title="Отпечаток транскрипта">ID ${esc(analysis.id)}</code>` : ''}
      </div>
      <section class="breakdown">
        <div class="breakdown__block breakdown--good">
          <div class="breakdown__head">
            <span class="breakdown__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <h3 class="breakdown__title">${positiveHeading}</h3>
          </div>
          <ul class="breakdown__list">${good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
        </div>
        <div class="breakdown__block breakdown--bad">
          <div class="breakdown__head">
            <span class="breakdown__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="12"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>
            </span>
            <h3 class="breakdown__title">Над чем работать</h3>
          </div>
          <ul class="breakdown__list">${bad.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>
      </section>` : `
      <section class="recommend">
        <h3 class="recommend__title">Разбора пока нет</h3>
        <p class="recommend__text">Сессия ещё не завершена: сервер пришлёт анализ после финала диалога.</p>
      </section>`}

      ${analysis && analysis.evidence && analysis.evidence.length ? `
      <section class="evidence-panel">
        <h3 class="moments__title">Доказательства из диалога</h3>
        <div class="evidence-list">
          ${analysis.evidence.map((item) => `
            <article class="evidence-item evidence-item--${esc(item.severity || 'medium')}">
              <div class="evidence-item__meta"><span>Ход ${esc(item.turn_index)}</span><span>${esc(item.event)}</span><span>уверенность ${Math.round(Number(item.confidence || 0) * 100)}%</span></div>
              <blockquote>«${esc(item.quote)}»</blockquote>
              <p>${esc(item.feedback)}</p>
              ${item.better_reply ? `<div class="evidence-item__better"><b>Можно было сказать:</b> ${esc(item.better_reply)}</div>` : ''}
            </article>`).join('')}
        </div>
      </section>` : ''}


      ${analysis && analysis.skills && Object.keys(analysis.skills).length ? `
      <section class="skill-profile">
        <h3 class="moments__title">Профиль переговорных навыков</h3>
        ${Object.entries(analysis.skills).map(([key, value]) => { const labels={structure:'Структура разговора',evidence:'Аргументация фактами',questions:'Качество вопросов',listening:'Активное слушание',value:'Ценность для другой стороны',objections:'Работа с возражениями',composure:'Самообладание',closing:'Фиксация договорённости'}; return `<div class="skill-row"><div><span>${esc(labels[key] || key)}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`; }).join('')}
      </section>` : ''}

      ${analysis && NTData.methodLinks(analysis.knowledge_refs).length ? `
      <section class="moments">
        <h3 class="moments__title">Методики из справочника</h3>
        <ul class="moments__list">${NTData.methodLinks(analysis.knowledge_refs).map((m) => `<li><a class="chip chip--link" href="${m.href}">${esc(m.title)}</a></li>`).join('')}</ul>
      </section>` : ''}

      ${moments.length ? `
      <section class="moments">
        <h3 class="moments__title">Ключевые моменты диалога</h3>
        <ul class="moments__list">
          ${moments.map((m) => `
            <li>
              <span class="moment__tag">${esc(m.tag)}</span>
              <span class="moment__text">${esc(m.text)}</span>
              <span class="moment__score">+${m.pts ?? 0}</span>
            </li>`).join('')}
        </ul>
      </section>` : ''}

      ${recommend ? `
      <section class="recommend">
        <h3 class="recommend__title">Рекомендация на следующую сессию</h3>
        <p class="recommend__text">${esc(recommend)}</p>
      </section>` : ''}

      <div class="result-actions">
        <a class="btn btn--primary" href="scenario.html?scenario=${encodeURIComponent(result.scenario || '')}">Повторить сценарий</a>
        ${analysis ? `<a class="btn btn--secondary" id="targeted-practice" href="learning.html" hidden>Отработать слабое место</a>` : ''}
        ${analysis ? `<a class="btn btn--ghost" id="replay-practice" href="learning.html" hidden>Переиграть ключевую реплику</a>` : ''}
        <a class="btn btn--secondary" href="catalog.html">Выбрать другой</a>
        <a class="btn btn--ghost" href="stats.html">В статистику</a>
        <button class="btn btn--secondary" id="print-result" type="button">Печать / PDF</button>
        <button class="btn btn--ghost" id="export-result" type="button">Скачать локальный JSON</button>
      </div>
      <section class="recommend">
        <h3 class="recommend__title">Приватность этой попытки</h3>
        <p class="recommend__text">Полный диалог и персональный разбор хранятся локально в этом браузере до 30 дней. Сервер сохраняет только статус, балл и агрегированные метрики без текста реплик.</p>
      </section>
      ${analysis ? `<section id="learning-recommendation" class="recommend recommend--personal" hidden>
        <h3 class="recommend__title">Следующий шаг по вашему разбору</h3>
        <p class="recommend__text" id="learning-recommendation-text"></p>
        <p class="recommend__text" id="learning-recommendation-goal"></p>
      </section>` : ''}
    `;

    root.appendChild(card);
    const targetedPractice = document.getElementById('targeted-practice');
    if (targetedPractice && result.id) {
      fetch(`/api/learning/recommendation/${encodeURIComponent(result.id)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((recommendation) => {
          if (!recommendation) return;
          targetedPractice.href = `learning.html?exercise=${encodeURIComponent(recommendation.exercise_id)}&session=${encodeURIComponent(result.id)}`;
          targetedPractice.title = recommendation.reason || 'Персональная тренировка по результатам сессии';
          targetedPractice.hidden = false;
          targetedPractice.textContent = `Отработать: ${recommendation.title}`;
          const recommendationBox = document.getElementById('learning-recommendation');
          const recommendationText = document.getElementById('learning-recommendation-text');
          const recommendationGoal = document.getElementById('learning-recommendation-goal');
          if (recommendationBox && recommendationText && recommendationGoal) {
            recommendationText.textContent = recommendation.reason || '';
            recommendationGoal.textContent = recommendation.micro_goal ? `Фокус: ${recommendation.micro_goal}` : '';
            recommendationBox.hidden = false;
          }
        })
        .catch(() => {});
    }
    const replayPractice = document.getElementById('replay-practice');
    if (replayPractice && result.id) {
      const replay = NTData.prepareLocalReplay(result);
      if (replay) {
        replayPractice.href = `learning.html?replay=${encodeURIComponent(result.id)}`;
        replayPractice.title = `${replay.reason} Доступно только в этом браузере.`;
        replayPractice.hidden = false;
      }
    }
    document.getElementById('print-result').onclick=()=>window.print();
    document.getElementById('export-result').onclick=()=>{const safe={id:result.id,scenario:result.scenario,title:result.title,date:result.date,mode:result.mode,status:result.status,endReason:result.endReason,score:result.score,interest:result.interest,turns:result.turns,analysis:result.analysis};const b=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`negotiation-result-${result.id||'latest'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
    App.initReveal();
  }

  render();
})();