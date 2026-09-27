/* ============================================================
   ОБЩАЯ логика всех 9 страниц: меню профиля, появление блоков.
   Специфика страниц — в js/<страница>.js, не здесь.
   ============================================================ */
document.documentElement.classList.add('js');

window.App = (function () {
  'use strict';

  function initAbout() {
    const brand = document.querySelector('.brand');
    if (!brand || document.getElementById('about-app-button')) return;

    const button = document.createElement('button');
    button.id = 'about-app-button';
    button.className = 'about-app-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'О приложении');
    button.title = 'О приложении';
    button.textContent = 'i';
    brand.insertAdjacentElement('afterend', button);

    const modal = document.createElement('div');
    modal.className = 'about-modal';
    modal.id = 'about-app-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="about-modal__backdrop" data-about-close></div>
      <section class="about-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="about-app-title">
        <button class="about-modal__close" type="button" data-about-close aria-label="Закрыть окно">×</button>
        <p class="page-eyebrow">О приложении</p>
        <h2 id="about-app-title">Negotiation Lab</h2>
        <p>Тренажёр деловых переговоров с настраиваемыми сценариями и персональным разбором.</p>
        <div class="about-modal__team">
          <b>Команда «Случайно залетевшие»</b>
          <span>Нашли баг или хотите оставить отзыв?</span>
          <a href="mailto:dima.aleksytkin@gmail.com">dima.aleksytkin@gmail.com</a>
        </div>
        <details class="about-modal__technical">
          <summary>Техническая информация</summary>
          <div id="about-technical-status">Статус систем загружается по запросу.</div>
        </details>
      </section>`;
    document.body.appendChild(modal);

    const setOpen = (open) => {
      modal.hidden = !open;
      document.body.classList.toggle('has-modal', open);
      if (open) {
        modal.querySelector('.about-modal__close').focus();
        const status = document.getElementById('about-technical-status');
        if (window.NTData && NTData.modelsStatus) {
          NTData.modelsStatus(false).then((models) => {
            const cloud = models.cloud || {};
            const expert = models.expert || {};
            const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
              { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
            ));
            const candidates = (models.candidates && [
              ...(models.candidates.dialog || []),
              ...(models.candidates.smart || [])
            ]) || [];
            const role = { dialog: 'Диалог и подсказки', smart: 'Генерация и анализ' };
            const stateLabel = (item) => item.available === true
              ? 'Доступна'
              : item.available === false ? 'Недоступна' : 'Ещё не проверена';
            status.innerHTML = `<div class="technical-summary">
              <p><b>Облачная цепочка:</b> ${cloud.available === true ? 'работает' : cloud.available === false ? 'не работает' : 'проверяется'}.</p>
              <div class="technical-models">${candidates.length ? candidates.map((item) => `
                <div class="technical-model ${item.available === true ? 'is-up' : item.available === false ? 'is-down' : 'is-pending'}">
                  <span><b>${safe(item.model)}</b><small>${safe(role[item.kind] || item.kind)}${item.active ? ' · используется сейчас' : ' · резерв'}</small></span>
                  <strong>${stateLabel(item)}${item.latency_ms ? ` · ${item.latency_ms} мс` : ''}</strong>
                  ${item.error ? `<em>${safe(item.error)}</em>` : ''}
                </div>`).join('') : '<p>Список облачных моделей пока не получен.</p>'}</div>
              <div class="technical-model ${expert.available === false ? 'is-down' : 'is-up'}"><span><b>Экспертная система</b><small>Локальный резерв для диалога, анализа и генерации</small></span><strong>${expert.available === false ? 'Недоступна' : 'Готова'}</strong></div>
            </div>`;
          }).catch(() => { status.textContent = 'Не удалось получить состояние систем.'; });
        }
      }
    };
    button.addEventListener('click', () => setOpen(true));
    modal.querySelectorAll('[data-about-close]').forEach((item) => item.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) setOpen(false);
    });
  }

  function initContactFooter() {
    if (document.body.classList.contains('session-page') || document.querySelector('.site-contact')) return;
    const footer = document.createElement('footer');
    footer.className = 'site-contact';
    footer.innerHTML = '<span>Команда «Случайно залетевшие»</span><span>Нашли баг? <a href="mailto:dima.aleksytkin@gmail.com">dima.aleksytkin@gmail.com</a></span>';
    document.body.appendChild(footer);
  }

  /* Keep the full current section highlighted even on pages nested inside it.
     Markup may omit the active class; the route is the source of truth. */
  function initActiveNavigation() {
    const nav = document.querySelector('.handbook-nav');
    if (!nav) return;
    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const sections = {
      'catalog.html': ['catalog.html', 'scenario.html', 'session.html', 'session-audio.html', 'session-view.html', 'results.html', 'stats.html'],
      'handbook.html': ['handbook.html', 'method.html', 'learning.html'],
      'scenario-studio.html': ['scenario-studio.html'],
      'profile.html': ['profile.html', 'login.html', 'register.html']
    };
    nav.querySelectorAll('a[href]').forEach((link) => {
      const target = new URL(link.href, window.location.href).pathname.split('/').pop().toLowerCase();
      const active = (sections[target] || [target]).includes(page);
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  /* --- Меню профиля: открытие, клик вне, Esc --- */
  const toggle = document.querySelector('[data-profile-toggle]');
  const menu = document.querySelector('[data-profile-menu]');

  if (toggle && menu) {
    const setOpen = (open) => {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', () => setOpen(menu.hidden));

    document.addEventListener('click', (event) => {
      const inside = menu.contains(event.target) || toggle.contains(event.target);
      if (!inside && !menu.hidden) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* --- Плавное появление элементов с data-reveal ---
     Стаггер по индексу, уважает prefers-reduced-motion. */
  function initReveal(selector = '[data-reveal]') {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    nodes.forEach((node, i) => {
      node.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
    });

    // Двойной rAF, чтобы переход гарантированно сыграл
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        nodes.forEach((node) => node.classList.add('is-visible'))
      )
    );
  }

  function initPageTransitions() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a[href]');
      if (!anchor || event.defaultPrevented || anchor.target === '_blank' ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          anchor.hasAttribute('download') || anchor.hasAttribute('data-back-button')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.hash ||
          url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      document.body.classList.add('is-leaving');
      window.setTimeout(() => { window.location.href = url.href; }, 140);
    });
  }

  /* Back arrows use browser history immediately, without page-exit animation.
     The href remains a safe fallback for a directly opened page. */
  function initBackButtons() {
    document.querySelectorAll('[data-back-button]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else window.location.replace(button.href);
      });
    });
  }

  /* Buttons that describe popovers must work by click as well as hover.
     This is especially important on touch screens where hover does not exist. */
  function initPopoverButtons() {
    document.querySelectorAll('button[aria-describedby]').forEach((button) => {
      const popover = document.getElementById(button.getAttribute('aria-describedby'));
      if (!popover) return;
      const root = button.parentElement;
      button.setAttribute('aria-expanded', 'false');
      const setOpen = (open) => {
        root.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
      };
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!root.classList.contains('is-open'));
      });
      document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) setOpen(false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && root.classList.contains('is-open')) {
          setOpen(false);
          button.focus();
        }
      });
    });
  }

  initPopoverButtons();
  initBackButtons();
  initPageTransitions();
  initActiveNavigation();
  initAbout();
  initContactFooter();
  return { initReveal };
})();