/* Unified secretary controller: one state machine for every screen. */
window.NTSecretary = (function () {
  'use strict';

  const ASSET = '/static/assets/secretary/';
  const SOURCES = {
    idle: ASSET + 'idle.webp',
    talk: ASSET + 'talk.webp',
    thinking: ASSET + 'thinking.webp',
    success: ASSET + 'success.webp',
    warning: ASSET + 'warning.webp'
  };
  const LABELS = {
    idle: 'Фиделина готова помочь',
    talk: 'Фиделина подсказывает',
    thinking: 'Фиделина ожидает ответ системы',
    success: 'Операция выполнена успешно',
    warning: 'Требуется внимание'
  };
  const HIDDEN_KEY = 'nt_secretary_hidden_v1';
  let state = 'idle';
  let returnTimer = null;

  function images() { return document.querySelectorAll('[data-secretary-image]'); }
  function roots() { return document.querySelectorAll('[data-secretary-root]'); }

  function sync() {
    images().forEach((image) => {
      const changed = image.dataset.state && image.dataset.state !== state;
      image.src = SOURCES[state];
      image.alt = LABELS[state];
      image.dataset.state = state;
      if (changed && image.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        image.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
      }
    });
    roots().forEach((root) => { root.dataset.secretaryState = state; });
  }

  function setState(next, options = {}) {
    if (!SOURCES[next]) next = 'idle';
    clearTimeout(returnTimer);
    state = next;
    sync();
    const delay = Number(options.returnToIdleMs || 0);
    if (delay > 0) returnTimer = setTimeout(() => setState('idle'), delay);
  }

  function setText(text) {
    document.querySelectorAll('[data-secretary-text]').forEach((element) => {
      element.textContent = String(text || '');
    });
  }

  function say(text, options = {}) {
    setText(text);
    setState(options.state || 'talk', { returnToIdleMs: options.returnToIdleMs || 4200 });
    if (options.open !== false) {
      document.querySelectorAll('[data-secretary-bubble]').forEach((bubble) => { bubble.hidden = false; });
    }
  }

  function setHidden(hidden) {
    localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0');
    roots().forEach((root) => { root.hidden = hidden; });
    document.querySelectorAll('[data-secretary-launcher]').forEach((launcher) => {
      launcher.hidden = !hidden;
    });
    document.dispatchEvent(new CustomEvent('nt:secretary-visibility', { detail: { hidden } }));
  }

  function init() {
    Object.values(SOURCES).forEach((src) => { const image = new Image(); image.src = src; });
    const hidden = localStorage.getItem(HIDDEN_KEY) === '1';
    roots().forEach((root) => { root.hidden = hidden; });
    document.querySelectorAll('[data-secretary-launcher]').forEach((launcher) => {
      launcher.hidden = !hidden;
    });
    document.querySelectorAll('[data-secretary-show]').forEach((button) => {
      button.addEventListener('click', () => setHidden(false));
    });
    document.querySelectorAll('[data-secretary-toggle]').forEach((button) => button.addEventListener('click', () => {
      const root = button.closest('[data-secretary-root]');
      const bubble = root && root.querySelector('[data-secretary-bubble]');
      if (bubble) bubble.hidden = !bubble.hidden;
      document.dispatchEvent(new CustomEvent('nt:secretary-toggle'));
    }));
    document.querySelectorAll('[data-secretary-close]').forEach((button) => button.addEventListener('click', () => {
      const root = button.closest('[data-secretary-root]');
      const bubble = root && root.querySelector('[data-secretary-bubble]');
      if (bubble) bubble.hidden = true;
    }));
    document.querySelectorAll('[data-secretary-hide]').forEach((button) => button.addEventListener('click', () => setHidden(true)));
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  return {
    init, sync, setState, setText, say, setHidden,
    getState: () => state,
    isHidden: () => localStorage.getItem(HIDDEN_KEY) === '1',
    success: (text) => say(text, { state: 'success', returnToIdleMs: 3200 }),
    warning: (text) => say(text, { state: 'warning', returnToIdleMs: 5200 }),
    thinking: (text) => { setText(text || 'Подождите, обрабатываю запрос…'); setState('thinking'); },
    idle: () => setState('idle')
  };
})();
