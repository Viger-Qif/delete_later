(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
  let savedScenarioId = null;
  let graphReady = false;
  let graphState = null;
  let graphHistory = [];
  let dirty = false;
  let generationController = null;
  let selectedNodeId = null;
  let rebuildArmedUntil = 0;
  let generationTicker = null;
  const REQUIRED_FIELDS = [
    ['ai-context', 'описание ситуации'],
    ['goal', 'цель переговоров'],
    ['user-role', 'вашу роль'],
    ['opponent-role', 'роль собеседника']
  ];

  const template = {
    nodes: [
      { id: 'start', type: 'start', label: 'Открытие разговора', description: 'Задайте спокойную рамку и назовите тему.', prompt_hint: 'Что именно вы хотите обсудить?' },
      { id: 'discovery', type: 'phase', label: 'Прояснение интересов', description: 'Стороны выясняют факты, ограничения и критерии.', knowledge_refs: ['spin-question-sequence'], coach_hint: 'Отделите позицию от интереса и задайте один открытый вопрос.', coach_focus: ['интересы', 'вопросы'], watch_for: ['факты', 'критерии'], avoid: ['обвинения'] },
      { id: 'commitment', type: 'phase', label: 'Варианты и фиксация', description: 'Сформулируйте пакет решения и следующий шаг.', knowledge_refs: [], coach_hint: 'Проверьте владельца, срок и критерий успеха.', coach_focus: ['варианты', 'закрытие'], watch_for: ['дата', 'ответственный'], avoid: ['размытая договорённость'] },
      { id: 'success', type: 'end', label: 'Соглашение достигнуто', outcome: 'success' },
      { id: 'failure', type: 'end', label: 'Переговоры сорваны', outcome: 'failure' }
    ],
    edges: [
      { from: 'start', to: 'discovery', trigger: { type: 'intent', value: 'set_agenda' } },
      { from: 'discovery', to: 'commitment', trigger: { type: 'intent', value: 'propose_options' } },
      { from: 'discovery', to: 'failure', trigger: { type: 'intent', value: 'attack' } },
      { from: 'commitment', to: 'success', trigger: { type: 'intent', value: 'confirm_agreement' } },
      { from: 'commitment', to: 'discovery', trigger: { type: 'intent', value: 'clarify_terms' } },
      { from: 'commitment', to: 'failure', trigger: { type: 'intent', value: 'ultimatum' } }
    ]
  };

  $('graph').value = '';
  const csv = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

  function setupCounters() {
    document.querySelectorAll('[data-count][maxlength]').forEach((control) => {
      const wrap = document.createElement('span');
      wrap.className = 'studio-control';
      control.parentNode.insertBefore(wrap, control);
      wrap.appendChild(control);
      const counter = document.createElement('span');
      counter.className = 'studio-counter';
      counter.setAttribute('aria-hidden', 'true');
      wrap.appendChild(counter);
      const update = () => {
        counter.textContent = `${control.value.length} / ${control.maxLength}`;
        counter.classList.toggle('is-near-limit', control.value.length >= control.maxLength * .75);
      };
      control.addEventListener('input', update);
      update();
    });
  }

  function validateRequiredFields() {
    const missing = [];
    REQUIRED_FIELDS.forEach(([id, label]) => {
      const control = $(id);
      const empty = !control.value.trim();
      control.setAttribute('aria-invalid', String(empty));
      control.closest('[data-required-field]')?.classList.toggle('has-error', empty);
      if (empty) missing.push({ control, label });
    });
    const box = $('required-errors');
    if (!missing.length) {
      box.hidden = true;
      box.textContent = '';
      return true;
    }
    box.hidden = false;
    box.textContent = `Заполните обязательные поля: ${missing.map((item) => item.label).join(', ')}.`;
    missing[0].control.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => missing[0].control.focus({ preventScroll: true }), 280);
    return false;
  }

  REQUIRED_FIELDS.forEach(([id]) => {
    $(id).addEventListener('input', () => {
      const control = $(id);
      if (control.value.trim()) {
        control.setAttribute('aria-invalid', 'false');
        control.closest('[data-required-field]')?.classList.remove('has-error');
      }
    });
  });
  setupCounters();

  function payload() {
    return {
      title: $('title').value.trim() || 'Пользовательский сценарий',
      description: $('description').value.trim() || $('ai-context').value.trim(),
      industry: $('industry').value.trim(),
      goal: $('goal').value.trim(),
      user_role: $('user-role').value.trim(),
      constraints: $('constraints').value.split('\n').map((item) => item.trim()).filter(Boolean),
      tags: csv($('tags').value),
      knowledge_refs: csv($('knowledge-refs').value),
      coach_profile: JSON.parse($('coach-profile').value || '{}'),
      difficulty: 'medium',
      modes: ['text', 'voice'],
      opponent: {
        role: $('opponent-role').value.trim() || 'Собеседник сценария',
        style: $('opponent-goal').value.trim() || 'реагирует на факты, интересы и условия',
        tone: 'деловой'
      },
      assistant: {
        role: 'Переговорный коуч Фиделина',
        style: 'даёт один конкретный следующий шаг по реальной реплике пользователя',
        tone: 'спокойный'
      },
      interest: { start: 50, min: 0, max: 100 },
      max_adjust: 15,
      scenario_type: 'user',
      graph: JSON.parse($('graph').value)
    };
  }

  function status(text, error = false) {
    const element = $('status');
    element.textContent = text;
    element.classList.toggle('is-error', error);
  }

  function setReady(ready) {
    graphReady = ready;
    $('save-scenario').disabled = !ready;
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const splitList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const graphInput = $('graph');
  const nodeEditor = $('node-editor');
  const edgeEditor = $('edge-editor');
  const graphCanvas = $('graph-canvas');

  function rememberGraph() {
    if (!graphState) return;
    graphHistory.push(clone(graphState));
    if (graphHistory.length > 20) graphHistory.shift();
    $('undo-graph').disabled = false;
  }

  function writeGraph() {
    graphInput.value = graphState ? JSON.stringify(graphState, null, 2) : '';
  }

  function markDirty() {
    dirty = true;
    status('Есть несохранённые изменения. Проверьте граф и нажмите «Сохранить и открыть».');
  }

  function nodeOptions(selected) {
    return ['start', 'phase', 'end'].map((value) => (
      `<option value="${value}"${selected === value ? ' selected' : ''}>${value === 'start' ? 'Старт' : value === 'phase' ? 'Этап' : 'Финал'}</option>`
    )).join('');
  }

  function nodeSelectOptions(selected) {
    return (graphState?.nodes || []).map((node) => (
      `<option value="${esc(node.id)}"${selected === node.id ? ' selected' : ''}>${esc(node.label || node.id)}</option>`
    )).join('');
  }

  function renderGraphEditor() {
    const nodes = graphState?.nodes || [];
    const edges = graphState?.edges || [];
    $('graph-editor').hidden = !nodes.length;
    if (!nodes.some((node) => node.id === selectedNodeId)) selectedNodeId = nodes[0]?.id || null;
    const selectedIndex = nodes.findIndex((node) => node.id === selectedNodeId);
    const selectedNodes = selectedIndex >= 0 ? [[nodes[selectedIndex], selectedIndex]] : [];
    nodeEditor.innerHTML = selectedNodes.map(([node, index]) => `
      <article class="node-card" data-node-card="${index}">
        <div class="node-card__head"><b>${esc(node.id)}</b><select data-node-field="type" data-node-index="${index}">${nodeOptions(node.type)}</select><button type="button" data-delete-node="${index}" aria-label="Удалить этап">Удалить</button></div>
        <label>Название этапа<input maxlength="120" data-node-field="label" data-node-index="${index}" value="${esc(node.label || '')}"></label>
        <label>Описание<textarea maxlength="600" rows="2" data-node-field="description" data-node-index="${index}">${esc(node.description || '')}</textarea></label>
        <div class="node-card__grid">
          <label>Реплика оппонента<textarea maxlength="600" rows="2" data-node-field="prompt_hint" data-node-index="${index}">${esc(node.prompt_hint || '')}</textarea></label>
          <label>Подсказка Фиделины<textarea maxlength="600" rows="2" data-node-field="coach_hint" data-node-index="${index}">${esc(node.coach_hint || '')}</textarea></label>
          <label>Почему этот этап нужен<textarea maxlength="600" rows="2" data-node-field="why_needed" data-node-index="${index}">${esc(node.why_needed || '')}</textarea></label>
          <label>Источник объяснения<select data-node-field="rationale_source" data-node-index="${index}">
            ${['user_context','method','manual','model'].map((value) => `<option value="${value}"${(node.rationale_source || 'model') === value ? ' selected' : ''}>${({user_context:'Контекст пользователя',method:'Правило методики',manual:'Ручная правка',model:'Вывод модели'})[value]}</option>`).join('')}
          </select></label>
          <label>Что отслеживать<input maxlength="500" data-node-field="watch_for" data-node-index="${index}" value="${esc((node.watch_for || []).join(', '))}"></label>
          <label>Чего избегать<input maxlength="500" data-node-field="avoid" data-node-index="${index}" value="${esc((node.avoid || []).join(', '))}"></label>
        </div>
        ${node.type === 'end' ? `<label>Результат<select data-node-field="outcome" data-node-index="${index}"><option value="success"${node.outcome === 'success' ? ' selected' : ''}>Успех</option><option value="failure"${node.outcome === 'failure' ? ' selected' : ''}>Неуспех</option><option value="neutral"${node.outcome === 'neutral' ? ' selected' : ''}>Нейтральный</option></select></label>` : ''}
        <div class="node-refine">
          <label>Изменить только этот этап<textarea data-node-refine-input="${index}" maxlength="500" placeholder="Например: добавь проверку документа и сделай подсказку конкретнее"></textarea></label>
          <button class="btn btn--secondary" type="button" data-node-refine="${index}">Применить к этапу</button>
        </div>
      </article>`).join('');
    edgeEditor.innerHTML = edges.map((edge, index) => {
      const value = Array.isArray(edge.trigger?.value) ? edge.trigger.value.join(', ') : (edge.trigger?.value || '');
      return `<article class="edge-row">
        <select data-edge-field="from" data-edge-index="${index}" aria-label="Откуда">${nodeSelectOptions(edge.from)}</select>
        <span aria-hidden="true">→</span>
        <select data-edge-field="to" data-edge-index="${index}" aria-label="Куда">${nodeSelectOptions(edge.to)}</select>
        <select data-edge-field="trigger_type" data-edge-index="${index}" aria-label="Тип условия"><option value="intent"${edge.trigger?.type === 'intent' ? ' selected' : ''}>Намерение</option><option value="keyword"${edge.trigger?.type === 'keyword' ? ' selected' : ''}>Ключевые слова</option></select>
        <input maxlength="500" data-edge-field="trigger_value" data-edge-index="${index}" value="${esc(value)}" aria-label="Правило перехода">
        <button type="button" data-delete-edge="${index}" aria-label="Удалить переход">Удалить</button>
      </article>`;
    }).join('') || '<p class="studio-help">Переходов пока нет.</p>';
    renderGraphCanvas();
  }

  function graphLayout(nodes) {
    const positions = new Map();
    let phaseIndex = 0;
    nodes.forEach((node) => {
      if (node.type === 'start') positions.set(node.id, { x: 28, y: 132 });
      else if (node.type === 'end') {
        const endIndex = nodes.filter((item) => item.type === 'end').findIndex((item) => item.id === node.id);
        const phaseCount = nodes.filter((item) => item.type === 'phase').length;
        positions.set(node.id, { x: 280 + Math.max(1, phaseCount) * 210, y: 54 + endIndex * 128 });
      } else {
        positions.set(node.id, { x: 238 + phaseIndex * 210, y: 70 + (phaseIndex % 2) * 150 });
        phaseIndex += 1;
      }
    });
    return positions;
  }

  function curve(from, to) {
    const x1 = from.x + 168, y1 = from.y + 42, x2 = to.x, y2 = to.y + 42;
    const bend = Math.max(45, Math.abs(x2 - x1) * .45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }

  function renderGraphCanvas() {
    if (!graphCanvas || !graphState) return;
    const nodes = graphState.nodes || [];
    const edges = graphState.edges || [];
    const positions = graphLayout(nodes);
    const width = Math.max(900, ...[...positions.values()].map((item) => item.x + 205));
    const height = 360;
    graphCanvas.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="Этапы и переходы сценария">
      <defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#789588"></path></marker></defs>
      <g class="graph-edges">${edges.map((edge, index) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return '';
        const path = curve(from, to);
        return `<path class="graph-edge" d="${path}" marker-end="url(#graph-arrow)"></path><path class="graph-edge-hit" d="${path}" data-edge-select="${index}"></path><circle class="graph-edge-end" data-edge-end="${index}" cx="${to.x}" cy="${to.y + 42}" r="7"><title>Перетащить конец стрелки</title></circle>`;
      }).join('')}</g>
      <path class="graph-drag-line" id="graph-drag-line" hidden></path>
      <g class="graph-nodes">${nodes.map((node) => {
        const pos = positions.get(node.id);
        const label = String(node.label || node.id);
        const short = label.length > 24 ? `${label.slice(0, 23)}…` : label;
        const type = node.type === 'start' ? 'Старт' : node.type === 'end' ? 'Финал' : 'Этап';
        return `<g class="graph-node${node.id === selectedNodeId ? ' is-selected' : ''}" data-node-visual="${esc(node.id)}" transform="translate(${pos.x} ${pos.y})" tabindex="0" role="button" aria-label="${esc(type + ': ' + label)}">
          <rect width="168" height="84" rx="10"></rect><text x="14" y="29">${esc(short)}</text><text class="graph-node__type" x="14" y="55">${type}</text>
          ${node.type !== 'end' ? `<circle class="graph-connect-handle" data-connect-from="${esc(node.id)}" cx="168" cy="42" r="8"><title>Потянуть переход</title></circle>` : ''}
        </g>`;
      }).join('')}</g>
    </svg>`;
  }

  function setGraph(graph, { remember = false, changed = true } = {}) {
    if (remember) rememberGraph();
    graphState = clone(graph);
    if (!graphState.nodes.some((node) => node.id === selectedNodeId)) selectedNodeId = graphState.nodes[0]?.id || null;
    writeGraph();
    renderPreview(graphState);
    renderGraphEditor();
    if (changed) markDirty();
  }

  function syncGraphWithoutRerender() {
    writeGraph();
    renderPreview(graphState);
    renderGraphCanvas();
    markDirty();
  }

  nodeEditor.addEventListener('focusin', (event) => {
    const control = event.target.closest('[data-node-field]');
    if (control && control.dataset.historyCaptured !== '1') {
      rememberGraph();
      control.dataset.historyCaptured = '1';
    }
  });
  nodeEditor.addEventListener('focusout', (event) => {
    const control = event.target.closest('[data-node-field]');
    if (control) delete control.dataset.historyCaptured;
  });
  nodeEditor.addEventListener('input', (event) => {
    const control = event.target.closest('[data-node-field]');
    if (!control) return;
    const node = graphState.nodes[Number(control.dataset.nodeIndex)];
    const field = control.dataset.nodeField;
    node[field] = ['watch_for', 'avoid'].includes(field) ? splitList(control.value) : control.value;
    syncGraphWithoutRerender();
  });
  nodeEditor.addEventListener('change', (event) => {
    const control = event.target.closest('[data-node-field]');
    if (!control) return;
    const node = graphState.nodes[Number(control.dataset.nodeIndex)];
    node[control.dataset.nodeField] = control.value;
    writeGraph();
    renderPreview(graphState);
    if (control.dataset.nodeField === 'type') renderGraphEditor();
    markDirty();
  });
  nodeEditor.addEventListener('click', (event) => {
    const refineButton = event.target.closest('[data-node-refine]');
    if (refineButton) {
      const index = Number(refineButton.dataset.nodeRefine);
      const node = graphState.nodes[index];
      const input = nodeEditor.querySelector(`[data-node-refine-input="${index}"]`);
      const request = input?.value.trim();
      if (!request) { input?.focus(); return; }
      $('refine-instruction').value = `Измени только этап «${node.label}» (id=${node.id}): ${request}. Остальные этапы, роли и предметную область не меняй.`;
      runRefinement();
      return;
    }
    const button = event.target.closest('[data-delete-node]');
    if (!button) return;
    const index = Number(button.dataset.deleteNode);
    const id = graphState.nodes[index].id;
    rememberGraph();
    graphState.nodes.splice(index, 1);
    selectedNodeId = graphState.nodes[0]?.id || null;
    graphState.edges = graphState.edges.filter((edge) => edge.from !== id && edge.to !== id);
    setGraph(graphState);
  });

  edgeEditor.addEventListener('focusin', (event) => {
    const control = event.target.closest('[data-edge-field]');
    if (control && control.dataset.historyCaptured !== '1') {
      rememberGraph();
      control.dataset.historyCaptured = '1';
    }
  });
  edgeEditor.addEventListener('focusout', (event) => {
    const control = event.target.closest('[data-edge-field]');
    if (control) delete control.dataset.historyCaptured;
  });
  function updateEdge(control) {
    const edge = graphState.edges[Number(control.dataset.edgeIndex)];
    const field = control.dataset.edgeField;
    if (field === 'trigger_type') edge.trigger.type = control.value;
    else if (field === 'trigger_value') edge.trigger.value = edge.trigger.type === 'keyword' ? splitList(control.value) : control.value.trim();
    else edge[field] = control.value;
    syncGraphWithoutRerender();
  }
  edgeEditor.addEventListener('input', (event) => {
    const control = event.target.closest('[data-edge-field]');
    if (control) updateEdge(control);
  });
  edgeEditor.addEventListener('change', (event) => {
    const control = event.target.closest('[data-edge-field]');
    if (control) updateEdge(control);
  });
  edgeEditor.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-edge]');
    if (!button) return;
    rememberGraph();
    graphState.edges.splice(Number(button.dataset.deleteEdge), 1);
    setGraph(graphState);
  });

  $('add-node').addEventListener('click', () => {
    rememberGraph();
    let number = graphState.nodes.length + 1;
    while (graphState.nodes.some((node) => node.id === `stage_${number}`)) number += 1;
    const node = { id: `stage_${number}`, type: 'phase', label: 'Новый этап', description: '', coach_hint: '', prompt_hint: '', watch_for: [], avoid: [] };
    graphState.nodes.push(node);
    selectedNodeId = node.id;
    setGraph(graphState);
  });
  $('add-edge').addEventListener('click', () => {
    if (graphState.nodes.length < 2) return;
    rememberGraph();
    graphState.edges.push({ from: graphState.nodes[0].id, to: graphState.nodes[1].id, trigger: { type: 'intent', value: 'continue_dialogue' } });
    setGraph(graphState);
  });
  $('undo-graph').addEventListener('click', () => {
    const previous = graphHistory.pop();
    if (!previous) return;
    graphState = previous;
    writeGraph();
    renderPreview(graphState);
    renderGraphEditor();
    $('undo-graph').disabled = graphHistory.length === 0;
    markDirty();
  });

  graphInput.addEventListener('change', () => {
    try {
      const parsed = JSON.parse(graphInput.value);
      setGraph(parsed, { remember: true });
    } catch (error) {
      status('JSON графа не разобран: ' + error.message, true);
    }
  });

  graphCanvas.addEventListener('click', (event) => {
    const node = event.target.closest('[data-node-visual]');
    if (!node || event.target.closest('[data-connect-from]')) return;
    selectedNodeId = node.dataset.nodeVisual;
    renderGraphEditor();
  });
  graphCanvas.addEventListener('keydown', (event) => {
    const node = event.target.closest('[data-node-visual]');
    if (node && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectedNodeId = node.dataset.nodeVisual;
      renderGraphEditor();
    }
  });
  graphCanvas.addEventListener('pointerdown', (event) => {
    const connector = event.target.closest('[data-connect-from], [data-edge-end]');
    if (!connector) return;
    event.preventDefault();
    const edgeIndex = connector.hasAttribute('data-edge-end') ? Number(connector.dataset.edgeEnd) : null;
    const fromId = edgeIndex == null ? connector.dataset.connectFrom : graphState.edges[edgeIndex].from;
    const source = graphLayout(graphState.nodes).get(fromId);
    const svg = graphCanvas.querySelector('svg');
    const line = $('graph-drag-line');
    const point = svg.createSVGPoint();
    const move = (moveEvent) => {
      point.x = moveEvent.clientX; point.y = moveEvent.clientY;
      const target = point.matrixTransform(svg.getScreenCTM().inverse());
      line.hidden = false;
      line.setAttribute('d', `M ${source.x + 168} ${source.y + 42} L ${target.x} ${target.y}`);
    };
    const up = (upEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      line.hidden = true;
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest('[data-node-visual]');
      if (!target || target.dataset.nodeVisual === fromId) return;
      rememberGraph();
      if (edgeIndex == null) {
        graphState.edges.push({ from: fromId, to: target.dataset.nodeVisual, trigger: { type: 'intent', value: 'continue_dialogue' } });
      } else {
        graphState.edges[edgeIndex].to = target.dataset.nodeVisual;
      }
      setGraph(graphState);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  });

  function renderPreview(graph) {
    const host = $('studio-preview');
    const nodes = (graph && graph.nodes) || [];
    if (!nodes.length) {
      host.innerHTML = '<p>Этапы ещё не собраны.</p>';
      setReady(false);
      return;
    }
    const phases = nodes.filter((node) => node.type !== 'end');
    const endings = nodes.filter((node) => node.type === 'end');
    host.innerHTML = `
      <ol class="studio-preview__steps">
        ${phases.map((node) => `<li><b>${esc(node.label)}</b><span>${esc(node.description || '')}</span></li>`).join('')}
      </ol>
      <div class="studio-preview__endings">
        ${endings.map((node) => `<span class="studio-ending studio-ending--${node.outcome === 'failure' ? 'failure' : 'success'}">${esc(node.label)}</span>`).join('')}
      </div>`;
    setReady(true);
  }

  $('load-template').onclick = () => {
    setGraph(template, { remember: Boolean(graphState) });
    status('Ручной шаблон загружен. Отредактируйте JSON или сохраните как основу.');
  };

  function applyScenario(scenario, context) {
    savedScenarioId = null;
    const values = {
      title: scenario.title,
      description: scenario.description || context,
      goal: scenario.goal,
      'user-role': scenario.user_role,
      'opponent-role': scenario.opponent?.role,
      'opponent-goal': scenario.opponent?.style,
      'knowledge-refs': (scenario.knowledge_refs || []).join(', '),
      'coach-profile': JSON.stringify(scenario.coach_profile || {}, null, 2)
    };
    Object.entries(values).forEach(([id, value]) => {
      if (value == null) return;
      $(id).value = value;
      $(id).dispatchEvent(new Event('input'));
    });
    setGraph(scenario.graph, { remember: Boolean(graphState) });
  }

  function graphDiff(before, after) {
    if (!before) return `Создано ${after?.nodes?.length || 0} нод и ${after?.edges?.length || 0} переходов.`;
    const oldNodes = new Map((before.nodes || []).map((node) => [node.id, node]));
    const newNodes = new Map((after.nodes || []).map((node) => [node.id, node]));
    const added = [...newNodes.keys()].filter((id) => !oldNodes.has(id)).length;
    const removed = [...oldNodes.keys()].filter((id) => !newNodes.has(id)).length;
    const changed = [...newNodes.entries()].filter(([id, node]) => {
      const old = oldNodes.get(id);
      return old && JSON.stringify(old) !== JSON.stringify(node);
    }).length;
    const edgeDelta = (after.edges || []).length - (before.edges || []).length;
    return `Изменения: добавлено нод — ${added}, удалено — ${removed}, обновлено — ${changed}, переходов ${edgeDelta >= 0 ? '+' : ''}${edgeDelta}.`;
  }

  function startGeneration(promise, button, context, cancelButton = $('cancel-generation'), mode = 'build') {
    if (generationController) return;
    const before = graphState ? clone(graphState) : null;
    generationController = new AbortController();
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = mode === 'refine' ? 'Применяю изменения…' : 'Собираю сценарий…';
    cancelButton.hidden = false;
    $('generation-progress').hidden = false;
    $('generation-progress-title').textContent = mode === 'refine' ? 'Изменяю текущий граф…' : 'Проектирую сценарий…';
    const progressMessages = mode === 'refine'
      ? ['Сохраняю текущую версию для отмены.', 'Проверяю, что роли и контекст не подменились.', 'Сверяю ноды и переходы перед показом.']
      : ['Сверяю роли, цель и ограничения.', 'Проектирую этапы и содержательные развилки.', 'Проверяю связность и финалы графа.'];
    let progressIndex = 0;
    $('generation-progress-text').textContent = progressMessages[0];
    generationTicker = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, progressMessages.length - 1);
      $('generation-progress-text').textContent = progressMessages[progressIndex];
    }, 2200);
    promise(generationController.signal).then((scenario) => {
      applyScenario(scenario, context);
      status(`${graphDiff(before, scenario.graph)} Проверьте выделенные изменения и сохраните сценарий.`);
      rebuildArmedUntil = 0;
      $('generate-ai').textContent = 'Пересобрать с нуля';
    }).catch((error) => {
      if (error.name !== 'AbortError') status('Не удалось изменить сценарий: ' + error.message, true);
      else status('Запрос отменён. Текущий граф сохранён.');
    }).finally(() => {
      window.clearInterval(generationTicker);
      generationTicker = null;
      generationController = null;
      button.disabled = false;
      button.textContent = button.id === 'generate-ai' && graphReady ? 'Пересобрать с нуля' : originalLabel;
      cancelButton.hidden = true;
      $('generation-progress').hidden = true;
      setReady(Boolean(graphState?.nodes?.length));
    });
  }

  $('generate-ai').onclick = () => {
    if (graphReady && Date.now() > rebuildArmedUntil) {
      rebuildArmedUntil = Date.now() + 6000;
      $('generate-ai').textContent = 'Подтвердить пересборку';
      status('Текущий граф будет заменён. Нажмите ещё раз в течение 6 секунд или используйте поле изменения ниже.');
      window.setTimeout(() => {
        if (Date.now() > rebuildArmedUntil && graphReady && !generationController) $('generate-ai').textContent = 'Пересобрать с нуля';
      }, 6100);
      return;
    }
    if (!validateRequiredFields()) return;
    const context = $('ai-context').value.trim();
    if (context.length < 30) {
      status('Опишите ситуацию чуть подробнее: кто с кем говорит, что произошло и какой результат нужен.', true);
      $('ai-context').focus();
      return;
    }
    const details = [
      `Название: ${$('title').value.trim() || 'сформулируй по контексту'}`,
      `Тема: ${$('industry').value.trim() || 'общая'}`,
      context,
      `Роль пользователя: ${$('user-role').value.trim() || 'определи по описанию'}`,
      `Роль собеседника: ${$('opponent-role').value.trim() || 'определи по описанию'}`,
      `Его интерес или цель: ${$('opponent-goal').value.trim() || 'не задано'}`,
      `Цель пользователя: ${$('goal').value.trim() || 'определи по описанию'}`,
      `Ограничения: ${$('constraints').value.trim() || 'не заданы'}`
    ].join('\n');
    status('Система проектирует отдельные этапы для вашей ситуации…');
    setReady(false);
    startGeneration((signal) => NTData.generateScenario(details, { signal }), $('generate-ai'), context, $('cancel-build'), 'build');
  };

  function runRefinement() {
    const instruction = $('refine-instruction').value.trim();
    if (!graphState) { status('Сначала соберите граф.', true); return; }
    if (instruction.length < 3) { status('Коротко опишите, что нужно изменить.', true); $('refine-instruction').focus(); return; }
    let current;
    try { current = payload(); }
    catch (error) { status('Проверьте расширенные настройки: ' + error.message, true); return; }
    status('Применяю запрос к текущему графу, не меняя остальные детали…');
    startGeneration((signal) => NTData.refineScenario(current, instruction, { signal }), $('refine-graph'), $('ai-context').value.trim(), $('cancel-generation'), 'refine');
  }
  $('refine-graph').addEventListener('click', runRefinement);
  $('cancel-generation').addEventListener('click', () => generationController?.abort());
  $('cancel-build').addEventListener('click', () => generationController?.abort());

  $('validate').onclick = () => {
    if (!graphReady) {
      status('Сначала соберите этапы или загрузите ручной шаблон.', true);
      return;
    }
    let body;
    try { body = payload(); }
    catch (error) { status('Проверьте JSON расширенных настроек: ' + error.message, true); return; }
    NTData.validateScenario(body).then((report) => {
      const text = report.valid
        ? `Структура готова к запуску: ${report.stats.nodes} узлов, ${report.stats.edges} переходов.${report.warnings.length ? '\nЗамечания: ' + report.warnings.join(' ') : ''}`
        : 'Нужно исправить: ' + report.errors.join(' ');
      status(text, !report.valid);
    }).catch((error) => status(error.message, true));
  };

  $('studio-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateRequiredFields()) return;
    if (!graphReady) {
      status('Сначала нажмите «Собрать этапы». Общий шаблон не будет сохранён вместо вашего сценария.', true);
      return;
    }
    let body;
    try { body = payload(); }
    catch (error) { status('Не удалось подготовить сценарий: ' + error.message, true); return; }
    const saveButton = $('save-scenario');
    saveButton.disabled = true;
    saveButton.textContent = 'Сохраняю…';
    try {
      const scenario = savedScenarioId
        ? await NTData.updateScenario(savedScenarioId, body)
        : await NTData.createScenario(body);
      savedScenarioId = scenario.id;
      dirty = false;
      if ($('publish-scenario').checked) await NTData.publishScenario(savedScenarioId, true);
      status('Сценарий сохранён. Открываю экран запуска…');
      $('studio-result-actions').hidden = false;
      $('studio-result-actions').innerHTML = `<a class="btn btn--primary" href="scenario.html?scenario=${encodeURIComponent(savedScenarioId)}">Открыть сценарий</a>`;
      setTimeout(() => { location.href = `scenario.html?scenario=${encodeURIComponent(savedScenarioId)}`; }, 450);
    } catch (error) {
      status('Не удалось сохранить сценарий: ' + error.message, true);
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить и открыть';
    }
  });

  App.initReveal();
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
