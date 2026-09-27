/* Неблокирующее обучение интерфейсу. Прогресс хранится отдельно для каждой страницы. */
window.NTTour = (function () {
  'use strict';
  let overlay = null;
  let card = null;
  let current = 0;
  let activeSteps = [];
  let storageKey = '';
  let highlighted = null;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function start(steps, key, force = false) {
    if (!force && storageGet(key) === 'done') return false;
    activeSteps = (steps || []).filter((step) => {
      const el = document.querySelector(step.target);
      return el && !el.hidden && getComputedStyle(el).display !== 'none';
    });
    if (!activeSteps.length) return false;
    storageKey = key;
    current = 0;
    create();
    show();
    return true;
  }

  function create() {
    // Do not emit nt:tour-close while replacing an older instance: page
    // controllers would treat the new first-run tour as already finished.
    teardown();
    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.innerHTML = `
      <div class="tour-guide">
        <img src="/static/assets/secretary/talk.webp" alt="" width="56" height="88" aria-hidden="true">
        <div><b>Фиделина</b><p class="tour-step" id="tour-step"></p></div>
      </div>
      <h2 id="tour-title"></h2>
      <p id="tour-text"></p>
      <div class="tour-actions"><button class="tour-skip" type="button">Пропустить</button><button class="btn btn--primary tour-next" type="button">Далее</button></div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(card);
    card.querySelector('.tour-skip').addEventListener('click', () => close(true));
    card.querySelector('.tour-next').addEventListener('click', next);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(true); });
    window.addEventListener('resize', position, { passive: true });
    window.addEventListener('scroll', position, { passive: true, capture: true });
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => card.querySelector('.tour-next').focus());
  }

  function show() {
    const step = activeSteps[current];
    highlighted = document.querySelector(step.target);
    if (!highlighted) { next(); return; }
    highlighted.classList.add('tour-highlight');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    highlighted.scrollIntoView({ block: innerWidth <= 640 ? 'center' : 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    card.querySelector('#tour-step').textContent = `Шаг ${current + 1} из ${activeSteps.length}`;
    card.querySelector('#tour-title').textContent = step.title;
    card.querySelector('#tour-text').textContent = step.text;
    card.querySelector('.tour-next').textContent = current === activeSteps.length - 1 ? 'Понятно' : 'Далее';
    requestAnimationFrame(position);
  }

  function position() {
    if (!overlay || !card || !highlighted) return;
    const rect = highlighted.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const gap = 16;
    card.style.bottom = 'auto';
    if (innerWidth <= 640) {
      const center = rect.top + rect.height / 2;
      if (center < innerHeight / 2) {
        card.style.top = 'auto';
        card.style.bottom = '12px';
      } else {
        card.style.top = '12px';
      }
      card.style.left = '12px';
      return;
    }
    let top = rect.bottom + gap;
    if (top + cardRect.height > innerHeight - 12) top = Math.max(12, rect.top - cardRect.height - gap);
    let left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardRect.width / 2), innerWidth - cardRect.width - 12);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function next() {
    if (highlighted) highlighted.classList.remove('tour-highlight');
    highlighted = null;
    current += 1;
    if (current >= activeSteps.length) { close(true); return; }
    show();
  }

  function onKey(event) {
    if (!overlay) return;
    if (event.key === 'Escape') close(true);
    if (event.key === 'ArrowRight') next();
  }

  function close(markDone) {
    const closedKey = storageKey;
    teardown();
    if (markDone && closedKey) storageSet(closedKey, 'done');
    document.dispatchEvent(new CustomEvent('nt:tour-close', { detail: { key: closedKey, completed: markDone } }));
  }

  function teardown() {
    if (highlighted) highlighted.classList.remove('tour-highlight');
    highlighted = null;
    if (overlay) overlay.remove();
    if (card) card.remove();
    overlay = null;
    card = null;
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    document.removeEventListener('keydown', onKey);
  }

  return {
    start,
    reset: storageRemove,
    isDone: (key) => storageGet(key) === 'done'
  };
})();
