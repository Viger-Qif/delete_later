/* Карточка сценария: карта веток, понятная сложность интерфейса и запуск. */
(function () {
  'use strict';

  const id = new URLSearchParams(location.search).get('scenario');
  const $ = (id) => document.getElementById(id);
  const pageTitle = $('page-title');
  const cardEl = $('scenario-card');
  const iconEl = $('s-icon');
  const nameEl = $('s-title');
  const metaEl = $('s-meta');
  const briefEl = $('s-brief');
  const difficultyEl = $('ui-difficulty');
  const difficultyHint = $('difficulty-hint');
  const modeEl = $('mode');
  const modeHint = $('mode-hint');
  const startBtn = $('start-btn');
  const lenInput = $('opt-len');
  const lenOut = $('len-out');
  const turnsOut = $('turns-out');
  const engineEl=$('engine-mode'),engineHint=$('engine-hint');

  const DIFFICULTIES = {
    easy: {
      title: 'Лёгкий интерфейс',
      hint: 'Показывает точный процент заинтересованности, примерный остаток ходов и советы коуча.'
    },
    medium: {
      title: 'Средний интерфейс',
      hint: 'Показывает состояние заинтересованности словами и примерный остаток ходов. Точные проценты скрыты.'
    },
    hard: {
      title: 'Сложный интерфейс',
      hint: 'Без шкал, прогресса, этапов и подсказок. Ориентируйтесь только на слова и тон собеседника.'
    }
  };

  const state = { difficultyMode: 'easy', mode: 'text', engineMode: 'auto' };
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) && 'speechSynthesis' in window;
  let current = null;
  let graphRendered = false;
  let graphLayout = null;
  let graphCamera = null;
  let graphDragging = null;
  let graphPointers = new Map();
  let graphPinch = null;
  let mobileGraphView = 'outline';
  const isNarrowGraph = () => window.matchMedia('(max-width: 900px)').matches;

  NTData.getScenario(id).then((row) => {
    if (!row) { renderNotFound(); return; }
    current = row;
    render(row);
  });

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(s) {
    document.title = s.title + ' — тренажёр переговоров';
    pageTitle.textContent = s.title;
    iconEl.innerHTML = NTData.topicIcon(s.topic, 24);
    nameEl.textContent = s.title;
    metaEl.innerHTML = `
      <span class="pill pill--${s.difficulty}">${NTData.labels.difficulty[s.difficulty]}</span>
      <span class="chip">${esc(NTData.labels.topics[s.topic])}</span>
      <span class="chip">~${s.minutes} мин</span>`;

    briefEl.innerHTML = `
      <div class="brief__section"><p class="brief__label">Ситуация</p><p class="brief__text">${esc(s.situation)}</p></div>
      <div class="brief__section"><p class="brief__label">Ваша роль</p><p class="brief__text">${esc(s.userRole)}</p></div><div class="brief__section"><p class="brief__label">Собеседник</p><p class="brief__text">${esc(s.counterpart)}</p></div>
      <div class="brief__section"><p class="brief__label">Ваша цель</p><p class="brief__text">${esc(s.goal)}</p></div>
      <div class="brief__section"><p class="brief__label">Ключевые навыки</p><div class="chips">${s.skills.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div></div>
      <div class="brief__section"><p class="brief__label">Рекомендованные методики</p><ul class="brief__list">${s.methods.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>
      ${NTData.methodLinks(s.knowledgeRefs).length ? `<div class="brief__section"><p class="brief__label">Методики из справочника</p><div class="chips">${NTData.methodLinks(s.knowledgeRefs).map((m) => `<a class="chip chip--link" href="${m.href}">${esc(m.title)}</a>`).join('')}</div></div>` : ''}`;

    // The technical map is lazy: the launch action stays visible until the
    // learner explicitly asks to inspect branches.
    if ($('graph-disclosure')?.open && !graphRendered) {
      renderGraph(s.graph);
      graphRendered = true;
    }
    updateDifficulty();
    updateStartHref();
  }

  function renderNotFound() {
    pageTitle.textContent = 'Сценарий не найден';
    cardEl.innerHTML = '<div class="empty"><p class="empty__title">Такого сценария нет</p><p>Выберите сценарий из каталога.</p><a class="btn btn--primary" href="catalog.html">В каталог</a></div>';
  }

  $('graph-disclosure')?.addEventListener('toggle', (event) => {
    const disclosure = event.currentTarget;
    disclosure.querySelector('summary').textContent = disclosure.open ? 'Скрыть граф сценария' : 'Показать граф сценария';
    if (disclosure.open && current && !graphRendered) {
      renderGraph(current.graph);
      graphRendered = true;
    } else if (disclosure.open && graphRendered) {
      requestAnimationFrame(() => fitGraph(false));
    }
  });

  const SALARY_LAYOUT = {
    start:[825,80],
    agenda:[420,300], evidence:[825,300], objection_performance:[1230,300],
    scope:[300,520], market:[660,520], request:[1020,520], objection_budget:[1380,520],
    objection_timing:[330,760], options:[760,760], tradeoffs:[1190,760],
    commitment:[825,1020],
    success_raise:[380,1280], success_plan:[825,1280], failure:[1270,1280]
  };

  function automaticLayout(nodes, edges) {
    const start = nodes.find((node) => node.type === 'start') || nodes[0];
    const depth = { [start.id]: 0 };
    const queue = [start.id];
    while (queue.length) {
      const from = queue.shift();
      for (const edge of edges.filter((item) => item.from === from)) {
        if (depth[edge.to] === undefined && edge.to !== start.id) {
          depth[edge.to] = depth[from] + 1;
          queue.push(edge.to);
        }
      }
    }
    let maxDepth = Math.max(0, ...Object.values(depth));
    nodes.forEach((node) => { if (depth[node.id] === undefined) depth[node.id] = node.type === 'end' ? maxDepth + 1 : maxDepth; });
    maxDepth = Math.max(...Object.values(depth));
    const levels = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((node) => levels[depth[node.id]].push(node));
    const width = Math.max(1250, Math.max(...levels.map((level) => level.length), 1) * 310 + 180);
    const height = Math.max(760, (maxDepth + 1) * 210 + 150);
    const positions = {};
    levels.forEach((level, row) => level.forEach((node, index) => {
      const gap = width / (level.length + 1);
      positions[node.id] = { x: gap * (index + 1) - 120, y: 70 + row * 210 };
    }));
    return { positions, width, height };
  }

  function graphPositions(nodes, edges) {
    const isSalary = nodes.every((node) => SALARY_LAYOUT[node.id]);
    if (!isSalary) return automaticLayout(nodes, edges);
    return { positions: Object.fromEntries(nodes.map((node) => [node.id, { x: SALARY_LAYOUT[node.id][0], y: SALARY_LAYOUT[node.id][1] }])), width: 1650, height: 1460 };
  }

  function splitNodeLabel(label, max = 27) {
    const words = String(label).split(/\s+/), lines = [''];
    words.forEach((word) => {
      const value = lines[lines.length - 1];
      if (value && `${value} ${word}`.length > max && lines.length < 2) lines.push(word);
      else lines[lines.length - 1] = value ? `${value} ${word}` : word;
    });
    return lines;
  }

  function graphNodeClass(node) {
    if (node.type === 'start') return 'start';
    if (node.type === 'end' && (node.outcome === 'failure' || node.id === 'failure')) return 'failure';
    if (node.type === 'end') return 'success';
    return 'phase';
  }

  function edgeCurve(from, to, edgeIndex, total, nodeWidth, nodeHeight) {
    const startX = from.x + (edgeIndex + 1) * nodeWidth / (total + 1);
    const startY = from.y + nodeHeight;
    const endX = to.x + nodeWidth / 2;
    const endY = to.y;
    const back = endY <= startY;
    if (back) {
      const side = Math.max(startX, endX) + 130 + (edgeIndex % 3) * 28;
      return { path: `M ${startX} ${startY - 8} C ${side} ${startY}, ${side} ${endY}, ${endX} ${endY + 8}`, back };
    }
    const middle = startY + (endY - startY) / 2;
    return { path: `M ${startX} ${startY} C ${startX} ${middle}, ${endX} ${middle}, ${endX} ${endY}`, back };
  }

  function renderGraph(graph) {
    const host = $('scenario-graph');
    if (!graph || !graph.nodes || !graph.nodes.length) {
      host.innerHTML = '<p class="graph-empty">Карта переходов для этого сценария пока не задана.</p>';
      return;
    }
    const { nodes, edges = [] } = graph;
    const layout = graphPositions(nodes, edges);
    const nodeWidth = 240, nodeHeight = 96;
    graphLayout = { ...layout, nodeWidth, nodeHeight, nodes, edges };
    const outgoing = Object.fromEntries(nodes.map((node) => [node.id, edges.filter((edge) => edge.from === node.id)]));
    const edgeSvg = edges.map((edge) => {
      const from = layout.positions[edge.from], to = layout.positions[edge.to];
      if (!from || !to) return '';
      const list = outgoing[edge.from], index = list.indexOf(edge);
      const curve = edgeCurve(from, to, index, list.length, nodeWidth, nodeHeight);
      return `<path class="graph-edge${curve.back ? ' graph-edge--back' : ''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="${curve.path}" marker-end="url(#graph-arrow)"/>`;
    }).join('');
    const nodeSvg = nodes.map((node) => {
      const pos = layout.positions[node.id], kind = graphNodeClass(node), lines = splitNodeLabel(node.label);
      return `<g class="graph-node graph-node--${kind}" data-node="${esc(node.id)}" tabindex="0" role="button" transform="translate(${pos.x} ${pos.y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="15"/>
        <text class="graph-node__kind" x="18" y="24">${node.type === 'start' ? 'СТАРТ' : node.type === 'end' ? 'ФИНАЛ' : 'ЭТАП'}</text>
        <text class="graph-node__title" x="18" y="54">${lines.map((line, index) => `<tspan x="18" dy="${index ? 21 : 0}">${esc(line)}</tspan>`).join('')}</text>
      </g>`;
    }).join('');
    host.innerHTML = `<svg id="scenario-graph-svg" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="xMidYMid meet" aria-label="Интерактивная карта переговоров">
      <defs><marker id="graph-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z"/></marker></defs>
      <g>${edgeSvg}</g><g>${nodeSvg}</g>
    </svg>`;
    renderGraphOutline();
    bindGraphInteraction();
    bindGraphViewMode();
    fitGraph(false);
    host.querySelectorAll('.graph-node').forEach((element) => {
      const show = () => showGraphInspector(element.dataset.node);
      element.addEventListener('mouseenter', show);
      element.addEventListener('mouseleave', hideGraphInspector);
      element.addEventListener('focus', show);
      element.addEventListener('blur', hideGraphInspector);
      element.addEventListener('click', () => focusGraphNode(element.dataset.node));
      element.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusGraphNode(element.dataset.node); showGraphInspector(element.dataset.node); } });
    });
    $('graph-zoom-in').onclick = () => zoomGraph(.8);
    $('graph-zoom-out').onclick = () => zoomGraph(1.25);
    $('graph-fit').onclick = () => fitGraph();
    const closeBtn = $('graph-inspector-close');
    if (closeBtn) closeBtn.onclick = hideGraphInspector;
    selectGraphNode(nodes.find((node) => node.type === 'start')?.id || nodes[0].id);
    hideGraphInspector();
  }

  function renderGraphOutline() {
    const ordered = [...graphLayout.nodes].sort((a, b) => graphLayout.positions[a.id].y - graphLayout.positions[b.id].y || graphLayout.positions[a.id].x - graphLayout.positions[b.id].x);
    let lastY = null, step = 0;
    $('graph-outline-list').innerHTML = ordered.map((node) => {
      if (node.type !== 'end' && graphLayout.positions[node.id].y !== lastY) { step += 1; lastY = graphLayout.positions[node.id].y; }
      return `<button class="outline-item outline-item--${graphNodeClass(node)}" data-outline-node="${esc(node.id)}"><b>${node.type === 'end' ? 'Ф' : step}</b><span>${esc(node.label)}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-outline-node]').forEach((button) => {
      button.addEventListener('mouseenter', () => showGraphInspector(button.dataset.outlineNode));
      button.addEventListener('mouseleave', hideGraphInspector);
      button.addEventListener('focus', () => showGraphInspector(button.dataset.outlineNode));
      button.addEventListener('blur', hideGraphInspector);
      button.addEventListener('click', () => {
        if (isNarrowGraph()) { selectGraphNode(button.dataset.outlineNode); $('graph-inspector').classList.add('is-visible'); return; }
        focusGraphNode(button.dataset.outlineNode);
      });
    });
  }

  function showGraphInspector(nodeId) {
    selectGraphNode(nodeId);
    $('graph-inspector').classList.add('is-visible');
  }
  function hideGraphInspector() { $('graph-inspector').classList.remove('is-visible'); }

  function selectGraphNode(nodeId) {
    document.querySelectorAll('.graph-node').forEach((node) => node.classList.toggle('is-selected', node.dataset.node === nodeId));
    document.querySelectorAll('.graph-edge').forEach((edge) => {
      edge.classList.toggle('is-selected', edge.dataset.from === nodeId);
      edge.classList.toggle('is-muted', edge.dataset.from !== nodeId && edge.dataset.to !== nodeId);
    });
    document.querySelectorAll('.outline-item').forEach((item) => item.classList.toggle('is-selected', item.dataset.outlineNode === nodeId));
    const pos = graphLayout.positions[nodeId], inspector = $('graph-inspector');
    inspector.classList.toggle('graph-inspector--left', pos.x > graphLayout.width * .56);
    inspector.classList.toggle('graph-inspector--right', pos.x <= graphLayout.width * .56);
    const node = graphLayout.nodes.find((item) => item.id === nodeId);
    const outgoing = graphLayout.edges.filter((edge) => edge.from === nodeId);
    const type = node.type === 'start' ? 'Начало разговора' : node.type === 'end' ? (graphNodeClass(node) === 'failure' ? 'Негативный финал' : 'Позитивный финал') : 'Этап переговоров';
    const refs = NTData.methodLinks(node.knowledge_refs).map((m) => `<a href="${m.href}">${esc(m.title)}</a>`).join(', ');
    const coach = node.coach_hint ? `<p class="graph-detail__coach"><b>Заготовка коуча:</b> ${esc(node.coach_hint)}</p>` : '';
    const focus = node.coach_focus?.length ? `<p class="graph-detail__coach"><b>Фокус:</b> ${esc(node.coach_focus.join(', '))}</p>` : '';
    const cards = refs ? `<p class="graph-detail__coach"><b>Методики:</b> ${refs}</p>` : '';
    $('graph-node-details').innerHTML = `<p class="graph-detail__eyebrow">${type}</p><h3>${esc(node.label)}</h3><p>${esc(node.description || 'Описание не задано.')}</p>${coach}${focus}${cards}${outgoing.length ? '<p class="inspector-caption">Условия перехода</p>' : '<div class="graph-node-result">Конечная точка сценария</div>'}`;
    $('graph-transition-list').innerHTML = outgoing.map((edge) => {
      const target = graphLayout.nodes.find((item) => item.id === edge.to);
      return `<article><p>${esc(intentLabel(edge.trigger && edge.trigger.value))}</p><span>→ ${esc(target?.label || edge.to)}</span></article>`;
    }).join('');
  }

  function applyGraphCamera() {
    const svg = $('scenario-graph-svg');
    if (!svg || !graphCamera) return;
    svg.setAttribute('viewBox', `${graphCamera.x} ${graphCamera.y} ${graphCamera.width} ${graphCamera.height}`);
    $('graph-zoom-label').textContent = `${Math.round(graphLayout.width / graphCamera.width * 100)}%`;
  }
  function fitGraph(animated = true) {
    if (isNarrowGraph()) {
      // На узком экране полный фит делает подписи нечитаемыми: стартуем с читаемого масштаба.
      const width = Math.min(graphLayout.width, 720);
      const height = width * (graphLayout.height / graphLayout.width);
      const start = graphLayout.nodes.find((node) => node.type === 'start') || graphLayout.nodes[0];
      const pos = graphLayout.positions[start.id];
      graphCamera = { x: pos.x + graphLayout.nodeWidth / 2 - width / 2, y: Math.max(0, pos.y - 60), width, height };
      clampCamera();
      applyGraphCamera();
      return;
    }
    graphCamera = { x: 0, y: 0, width: graphLayout.width, height: graphLayout.height };
    applyGraphCamera();
    if (animated) { $('graph-viewport').classList.add('is-flashing'); setTimeout(() => $('graph-viewport').classList.remove('is-flashing'), 250); }
  }
  function clampCamera() {
    graphCamera.x = Math.max(-80, Math.min(graphLayout.width - graphCamera.width + 80, graphCamera.x));
    graphCamera.y = Math.max(-80, Math.min(graphLayout.height - graphCamera.height + 80, graphCamera.y));
  }
  function zoomGraph(factor, clientX = null, clientY = null) {
    const viewport = $('graph-viewport'), rect = viewport.getBoundingClientRect();
    const minWidth = 420, maxWidth = graphLayout.width * 1.25;
    const width = Math.max(minWidth, Math.min(maxWidth, graphCamera.width * factor));
    const height = width * (graphLayout.height / graphLayout.width);
    const px = clientX === null ? .5 : Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const py = clientY === null ? .5 : Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    graphCamera.x += (graphCamera.width - width) * px; graphCamera.y += (graphCamera.height - height) * py;
    graphCamera.width = width; graphCamera.height = height; clampCamera(); applyGraphCamera();
  }
  function focusGraphNode(nodeId) {
    const pos = graphLayout.positions[nodeId], width = Math.min(graphCamera.width, 760), height = width * (graphLayout.height / graphLayout.width);
    graphCamera.width = width; graphCamera.height = height;
    graphCamera.x = pos.x + graphLayout.nodeWidth / 2 - width / 2;
    graphCamera.y = pos.y + graphLayout.nodeHeight / 2 - height / 2;
    clampCamera(); applyGraphCamera(); selectGraphNode(nodeId);
  }
  function bindGraphInteraction() {
    const viewport = $('graph-viewport');
    viewport.onwheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomGraph(event.deltaY > 0 ? 1.13 : .88, event.clientX, event.clientY);
    };
    viewport.onpointerdown = (event) => {
      if (event.target.closest('.graph-inspector')) return;
      graphPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (graphPointers.size === 2) {
        // Два пальца — pinch-zoom вместо перетаскивания.
        graphDragging = null;
        viewport.classList.remove('is-dragging');
        graphPinch = { distance: pointerDistance(), width: graphCamera.width };
        return;
      }
      if (event.target.closest('.graph-node')) return;
      graphDragging = { x: event.clientX, y: event.clientY, cameraX: graphCamera.x, cameraY: graphCamera.y };
      try { viewport.setPointerCapture(event.pointerId); } catch (error) { /* жест уже прерван */ }
      viewport.classList.add('is-dragging');
    };
    viewport.onpointermove = (event) => {
      if (graphPointers.has(event.pointerId)) graphPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (graphPinch && graphPointers.size >= 2) {
        const distance = pointerDistance();
        if (!distance || !graphPinch.distance) return;
        const center = pointerCenter();
        const target = graphPinch.width * (graphPinch.distance / distance);
        zoomGraph(target / graphCamera.width, center.x, center.y);
        return;
      }
      if (!graphDragging) return;
      const rect = viewport.getBoundingClientRect(), scaleX = graphCamera.width / rect.width, scaleY = graphCamera.height / rect.height;
      graphCamera.x = graphDragging.cameraX - (event.clientX - graphDragging.x) * scaleX;
      graphCamera.y = graphDragging.cameraY - (event.clientY - graphDragging.y) * scaleY;
      clampCamera(); applyGraphCamera();
    };
    const release = (event) => {
      if (event && graphPointers.has(event.pointerId)) graphPointers.delete(event.pointerId);
      if (graphPointers.size < 2) graphPinch = null;
      graphDragging = null;
      viewport.classList.remove('is-dragging');
    };
    viewport.onpointerup = release;
    viewport.onpointercancel = release;
    viewport.onpointerleave = (event) => { if (graphPointers.size <= 1) release(event); };
  }

  function pointerList() { return Array.from(graphPointers.values()); }
  function pointerDistance() {
    const [a, b] = pointerList();
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pointerCenter() {
    const [a, b] = pointerList();
    if (!a || !b) return { x: null, y: null };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* --- v16: на узких экранах список этапов — основной вид, карта открывается по кнопке --- */
  function applyMobileGraphView(view) {
    mobileGraphView = view === 'map' ? 'map' : 'outline';
    const workspace = document.querySelector('.graph-workspace');
    if (workspace) workspace.dataset.mobileView = mobileGraphView;
    document.querySelectorAll('[data-graph-view]').forEach((button) => {
      const active = button.dataset.graphView === mobileGraphView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    hideGraphInspector();
    if (mobileGraphView === 'map' && graphLayout) requestAnimationFrame(() => fitGraph(false));
  }

  function bindGraphViewMode() {
    document.querySelectorAll('[data-graph-view]').forEach((button) => {
      button.onclick = () => applyMobileGraphView(button.dataset.graphView);
    });
    applyMobileGraphView(isNarrowGraph() ? 'outline' : 'map');
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!graphLayout) return;
        if (!isNarrowGraph()) applyMobileGraphView('map');
        else if (mobileGraphView === 'map') fitGraph(false);
      }, 180);
    });
  }

  function intentLabel(value) {
    const labels = {
      set_agenda: 'обозначить цель', present_achievements: 'привести результаты', demand_raise: 'потребовать без аргументов',
      explain_scope: 'показать рост ответственности', mention_market: 'дать рыночный ориентир', make_specific_request: 'назвать диапазон',
      use_vague_claims: 'говорить без фактов', compare_with_colleagues: 'сравнивать с коллегами', ask_decision: 'спросить решение',
      rely_only_on_market: 'опираться только на рынок', discuss_budget: 'обсудить бюджет', ask_timeline: 'уточнить сроки',
      propose_options: 'предложить варианты', reinforce_value: 'усилить ценность', propose_compromise: 'найти компромисс',
      threaten_quit: 'угрожать уходом', provide_metrics: 'дать личные метрики', propose_kpi_plan: 'предложить KPI-план',
      ultimatum: 'поставить ультиматум', ask_for_concrete_date: 'зафиксировать дату', propose_package: 'собрать пакет',
      reject_alternatives: 'отвергнуть альтернативы', negotiate_terms: 'обсудить условия', agree_terms: 'согласовать условия',
      reject_conditions: 'отказаться от условий', confirm_raise: 'подтвердить повышение', confirm_review_plan: 'подтвердить план',
      clarify_terms: 'уточнить договорённость'
    };
    return labels[value] || String(value || 'переход').split('_').join(' ');
  }

  difficultyEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-difficulty]');
    if (!btn) return;
    state.difficultyMode = btn.dataset.difficulty;
    updateDifficulty();
  });

  function updateDifficulty() {
    difficultyEl.querySelectorAll('[data-difficulty]').forEach((btn) => {
      const active = btn.dataset.difficulty === state.difficultyMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
    difficultyHint.textContent = DIFFICULTIES[state.difficultyMode].hint;
  }

  function updateStartHref() {
    if (!current) return;
    const page = state.mode === 'audio' ? 'session-audio.html' : 'session.html';
    startBtn.href = page + '?scenario=' + encodeURIComponent(current.id);
  }

  engineEl.addEventListener('click',(event)=>{const btn=event.target.closest('.engine-card');if(!btn||btn.disabled)return;state.engineMode=btn.dataset.engine;engineEl.querySelectorAll('.engine-card').forEach((x)=>{const active=x===btn;x.classList.toggle('is-active',active);x.setAttribute('aria-checked',String(active));});const d={auto:'Облачный ИИ используется первым; при ошибке явно подключится эксперт.',cloud:'Только облачная модель: без скрытого локального ответа.',expert:'Быстрая локальная экспертная система без внешнего API.'};engineHint.textContent=d[state.engineMode];});
  NTData.modelsStatus(false).then((status)=>{const c=status.cloud||{},btn=engineEl.querySelector('[data-engine="cloud"]');if(c.available===true)$('cloud-engine-state').textContent=`Доступен · ${c.latency_ms||0} мс`;else if(c.configured&&c.available==null){$('cloud-engine-state').textContent='Проверяется при запуске';}else{btn.disabled=true;btn.classList.add('has-error');$('cloud-engine-state').textContent=c.error||'Недоступен';}$('expert-engine-state').textContent=`Готова · ${(status.expert||{}).latency_ms||0} мс`;}).catch(()=>{$('cloud-engine-state').textContent='Проверка недоступна';});

  const audioModeButton = modeEl.querySelector('[data-mode="audio"]');
  if (!speechSupported && audioModeButton) {
    audioModeButton.disabled = true;
    audioModeButton.title = 'Голосовой режим не поддерживается этим браузером';
    modeHint.hidden = false;
    modeHint.textContent = 'В этом браузере недоступно распознавание или озвучивание речи. Используйте текстовый режим.';
  }

  modeEl.addEventListener('click', (event) => {
    const btn = event.target.closest('.segmented__btn');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    updateStartHref();
    modeEl.querySelectorAll('.segmented__btn').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', String(active));
    });
    modeHint.hidden = state.mode !== 'audio';
  });

  function updateLength() {
    lenOut.value = lenInput.value;
    turnsOut.value = Math.max(4, Math.min(20, Math.round(Number(lenInput.value) * 2 / 3)));
  }
  lenInput.addEventListener('input', updateLength);
  updateLength();
  startBtn.addEventListener('click', () => {
    localStorage.setItem('nt_session_config', JSON.stringify({
      scenario: current.id,
      difficultyMode: state.difficultyMode,
      mode: state.mode,
      hints: state.difficultyMode !== 'hard',
      timer: $('opt-timer').checked,
      minutes: Number(lenInput.value),
      targetTurns: Math.max(4, Math.min(20, Math.round(Number(lenInput.value) * 2 / 3))),
      engineMode: state.engineMode
    }));
  });

  App.initReveal();
})();
