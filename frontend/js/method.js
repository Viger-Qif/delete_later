/* ============================================================
   СТРАНИЦА МЕТОДИКИ: единый renderer для content/methods/<id>.json.
   method.html?id=spin | harvard | batna | active-listening |
                  anchoring | hard-tactics | closing
   ============================================================ */
(function () {
  'use strict';
  const CONTENT = '/static/content';
  const root = document.getElementById('method-root');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = (value) => (Array.isArray(value) ? value : []);
  const pad = (n) => String(n).padStart(2, '0');
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };

  const params = new URLSearchParams(location.search);
  const requested = params.get('id') || params.get('entry') || 'spin';
  const id = window.NTData?.methodForRef(requested) || String(requested).toLowerCase();

  function fail(message) {
    root.removeAttribute('aria-busy');
    root.innerHTML = `<div class="handbook-empty"><p class="handbook-empty__title">${esc(message)}</p><p><a class="btn btn--primary" href="handbook.html">К списку методик</a></p></div>`;
  }

  function list(items, cls) {
    return `<ul class="${cls}">${arr(items).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  function checklistMarkup(items, methodId) {
    return `<div class="method-checklist-wrap">
      <p class="method-checklist__progress" id="checklist-progress" aria-live="polite"></p>
      <ul class="method-checklist">
        ${items.map((text, index) => `<li><label>
          <input type="checkbox" data-checklist-index="${index}">
          <span>${esc(text)}</span>
        </label></li>`).join('')}
      </ul>
      <button class="method-checklist__reset" type="button" id="checklist-reset">Сбросить отметки</button>
    </div>`;
  }

  function render(m, catalog) {
    const sections = arr(m.sections);
    const sequence = arr(m.sequence);
    const mistakes = arr(m.common_mistakes);
    const checklist = arr(m.preparation_checklist);
    const sources = arr(m.sources);
    const toc = [
      ['essence', 'Суть'],
      (m.when_to_use?.length || m.when_not_to_use?.length) && ['when', 'Когда применять'],
      sequence.length && ['sequence', 'Последовательность'],
      sections.length && ['techniques', 'Приёмы'],
      mistakes.length && ['mistakes', 'Ошибки'],
      checklist.length && ['checklist', 'Чек-лист'],
      sources.length && ['sources', 'Источники']
    ].filter(Boolean);

    const pos = catalog.findIndex((row) => row.id === m.id);
    const prev = pos > 0 ? catalog[pos - 1] : null;
    const next = pos >= 0 && pos < catalog.length - 1 ? catalog[pos + 1] : null;

    document.title = `${m.title.split(':')[0]} — справочник Negotiation Lab`;
    root.removeAttribute('aria-busy');
    root.innerHTML = `
    <section class="method-hero" aria-labelledby="method-title">
      <p class="page-eyebrow">Методика · ${esc(m.reading_minutes)} минут чтения</p>
      <h1 id="method-title">${esc(m.title)}</h1>
      <p class="method-hero__lead">${esc(m.lead)}</p>
      ${m.promise ? `<p class="method-hero__promise"><b>Результат.</b> ${esc(m.promise)}</p>` : ''}
      <div class="method-hero__foot">
        <a class="btn btn--primary" href="#essence">Начать изучение</a>
        <span class="method-hero__meta">${sequence.length} ${plural(sequence.length, 'шаг', 'шага', 'шагов')} · ${sections.length} ${plural(sections.length, 'приём', 'приёма', 'приёмов')} · ${mistakes.length} ${plural(mistakes.length, 'типичная ошибка', 'типичные ошибки', 'типичных ошибок')}</span>
      </div>
      ${arr(m.audiences).length ? `<div class="chips method-hero__chips">${arr(m.audiences).map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}
    </section>

    <div class="method-layout">
      <nav class="method-toc" aria-label="Содержание">
        <p class="method-toc__title">На странице</p>
        ${toc.map(([href, label]) => `<a href="#${href}">${label}</a>`).join('')}
      </nav>

      <article class="method-article">
        <section id="essence">
          <h2>Суть за минуту</h2>
          ${m.essence?.summary ? `<p class="method-lead">${esc(m.essence.summary)}</p>` : ''}
          ${m.essence?.principle ? `<div class="method-callout">${esc(m.essence.principle)}</div>` : ''}
          ${m.essence?.rule ? `<div class="method-rule"><b>Главное правило</b><span>${esc(m.essence.rule)}</span></div>` : ''}
        </section>

        ${toc.some(([x]) => x === 'when') ? `
        <section id="when">
          <h2>Когда применять</h2>
          <div class="method-twocol">
            <div class="method-panel method-panel--yes"><h3>Подходит, если</h3>${list(m.when_to_use, 'method-bullets')}</div>
            <div class="method-panel method-panel--no"><h3>Не подходит, если</h3>${list(m.when_not_to_use, 'method-bullets')}</div>
          </div>
        </section>` : ''}

        ${sequence.length ? `
        <section id="sequence">
          <h2>Рабочая последовательность</h2>
          <p class="method-lead">Шаги можно сокращать или возвращаться назад, если появились новые данные.</p>
          <ol class="method-steps">
            ${sequence.map((step, i) => `<li class="method-step">
              <span class="method-step__num">${pad(i + 1)}</span>
              <h3>${esc(step.name)}</h3>
              <p>${esc(step.purpose)}</p>
              ${step.example ? `<p class="method-quote">${esc(step.example)}</p>` : ''}
            </li>`).join('')}
          </ol>
        </section>` : ''}

        ${sections.length ? `
        <section id="techniques">
          <h2>Приёмы подробно</h2>
          <p class="method-lead">Открывайте тот приём, который нужен в текущем разговоре.</p>
          <div class="method-details">
            ${sections.map((s, i) => `<details class="method-detail"${i === 0 ? ' open' : ''}>
              <summary>
                <span class="method-detail__num">${pad(i + 1)}</span>
                <span class="method-detail__text"><span class="method-detail__title">${esc(s.title)}</span>${s.purpose ? `<span class="method-detail__purpose">${esc(s.purpose)}</span>` : ''}</span>
                <span class="method-detail__toggle" aria-hidden="true"></span>
              </summary>
              <div class="method-detail__body">
                ${s.how_to ? `<div><h4>Как применять</h4><p>${esc(s.how_to)}</p></div>` : ''}
                <div class="method-examples">
                  ${s.good_example ? `<div class="method-example method-example--good"><span>Хорошо</span>${esc(s.good_example)}</div>` : ''}
                  ${s.bad_example ? `<div class="method-example method-example--bad"><span>Плохо</span>${esc(s.bad_example)}</div>` : ''}
                </div>
                ${s.success_signal ? `<p class="method-signal"><b>Сработало, если:</b> ${esc(s.success_signal)}</p>` : ''}
              </div>
            </details>`).join('')}
          </div>
        </section>` : ''}

        ${mistakes.length ? `
        <section id="mistakes">
          <h2>Распространённые ошибки</h2>
          <div class="method-mistakes">
            ${mistakes.map((x) => `<div class="method-mistake"><b>${esc(x.title)}</b><span>${esc(x.description)}</span></div>`).join('')}
          </div>
        </section>` : ''}

        ${checklist.length ? `
        <section id="checklist">
          <h2>Чек-лист перед разговором</h2>
          ${checklistMarkup(checklist, m.id)}
        </section>` : ''}

        <section class="method-practice">
          <h2>Проверьте навык в тренажёре</h2>
          <p>Выберите сценарий и попробуйте применить методику в разговоре с ИИ-оппонентом. После сессии анализ покажет, что сработало.</p>
          <a class="btn method-practice__btn" href="catalog.html">Перейти к сценариям</a>
        </section>

        ${sources.length ? `
        <section id="sources">
          <details class="method-sources-details">
            <summary>Источники и издания</summary>
            <ol class="method-sources">${sources.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
            <p class="method-footnote">Материал изложен своими словами и адаптирован для деловых переговоров. Внешние ссылки намеренно не используются.</p>
          </details>
        </section>` : ''}

        ${prev || next ? `<nav class="method-pager" aria-label="Другие методики">
          ${prev ? `<a class="method-pager__link" href="method.html?id=${encodeURIComponent(prev.id)}"><small>← Предыдущая</small><span>${esc(prev.title.split(':')[0])}</span></a>` : '<span></span>'}
          ${next ? `<a class="method-pager__link method-pager__link--next" href="method.html?id=${encodeURIComponent(next.id)}"><small>Следующая →</small><span>${esc(next.title.split(':')[0])}</span></a>` : ''}
        </nav>` : ''}
      </article>
    </div>`;

    if (checklist.length) {
      const storageKey = `nt_method_checklist_v1_${m.id}`;
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_) { saved = []; }
      const boxes = [...root.querySelectorAll('[data-checklist-index]')];
      const progress = document.getElementById('checklist-progress');
      const syncProgress = () => {
        const checked = boxes.filter((box) => box.checked).length;
        progress.textContent = checked
          ? `Отмечено: ${checked} из ${boxes.length}`
          : 'Отмечайте пункты по мере подготовки.';
      };
      boxes.forEach((box, index) => {
        box.checked = Boolean(saved[index]);
        box.addEventListener('change', () => {
          localStorage.setItem(storageKey, JSON.stringify(boxes.map((item) => item.checked)));
          syncProgress();
        });
      });
      document.getElementById('checklist-reset').addEventListener('click', () => {
        boxes.forEach((box) => { box.checked = false; });
        localStorage.removeItem(storageKey);
        syncProgress();
        boxes[0]?.focus();
      });
      syncProgress();
    }

    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }

  if (!/^[a-z0-9-]+$/.test(id)) { fail('Методика не найдена'); return; }
  if (requested !== id) history.replaceState(null, '', `method.html?id=${encodeURIComponent(id)}${location.hash}`);

  Promise.all([
    fetch(`${CONTENT}/methods/${id}.json`).then((r) => { if (!r.ok) throw new Error('404'); return r.json(); }),
    fetch(`${CONTENT}/catalog.json`).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  ])
    .then(([method, catalog]) => render(method, Array.isArray(catalog) ? catalog : []))
    .catch(() => fail('Методика не найдена'));
})();
