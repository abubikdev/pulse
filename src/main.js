import './style.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const STORAGE_KEY = 'pulse-app-state-v2';
const STATE_VERSION = 2;
const MODES = ['work', 'study', 'planning', 'creative'];
const PRESETS = ['ultra concise', 'balanced', 'detailed', 'technical', 'for client'];
const MEMORY_TYPES = ['preference', 'project', 'task', 'fact', 'note'];
const MEMORY_PRIORITY = { preference: 1, project: 2, task: 3, fact: 4, note: 5 };
const STRUCTURED_KINDS = ['summary', 'details', 'actionSteps', 'risks', 'sources', 'custom'];
const modeLabels = { work: 'Work', study: 'Study', planning: 'Planning', creative: 'Creative' };

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState() {
  const now = new Date();
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const convId = uid('conv');
  return {
    version: STATE_VERSION,
    global: {
      defaultMode: 'work',
      outputPreset: 'balanced',
      showUsage: true,
      usage: {
        monthlyLimitTokens: 150000,
        usedTokens: 0,
        resetDateISO: reset,
        lastUpdatedAt: now.toISOString(),
      },
      memoryItems: [],
      pinnedContexts: [],
      drafts: [],
    },
    conversations: [{ id: convId, title: 'New chat', mode: null, outputPreset: null, messages: [] }],
    currentConversationId: convId,
  };
}

function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return defaultState();
  if (!parsed.version) return { ...defaultState(), ...parsed, version: STATE_VERSION };
  parsed.version = STATE_VERSION;
  parsed.global = parsed.global || defaultState().global;
  parsed.global.memoryItems = parsed.global.memoryItems || [];
  parsed.global.pinnedContexts = parsed.global.pinnedContexts || [];
  parsed.global.drafts = parsed.global.drafts || [];
  parsed.conversations = Array.isArray(parsed.conversations) && parsed.conversations.length ? parsed.conversations : defaultState().conversations;
  parsed.currentConversationId = parsed.currentConversationId || parsed.conversations[0].id;
  return parsed;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrateState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

let appState = loadState();
let selectionContext = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function currentConversation() {
  return appState.conversations.find((c) => c.id === appState.currentConversationId) || appState.conversations[0];
}

function effectiveMode(conv = currentConversation()) {
  return conv.mode || appState.global.defaultMode;
}

function effectivePreset(conv = currentConversation()) {
  return conv.outputPreset || appState.global.outputPreset;
}

document.querySelector('#app').innerHTML = `
  <div id="layout" class="sidebar-open">
    <aside id="sidebar" aria-label="Sidebar">
      <div class="sidebar-header"><h1>Pulse</h1></div>
      <nav class="sidebar-nav" aria-label="Primary">
        <button type="button" class="nav-item active" id="new-chat-btn">New chat</button>
        <button type="button" class="nav-item" id="settings-btn">Settings</button>
      </nav>
    </aside>
    <div id="mobile-overlay" aria-hidden="true"></div>
    <main id="chat-shell">
      <header id="chat-header">
        <button id="sidebar-toggle" type="button" aria-label="Toggle sidebar" aria-expanded="false">☰</button>
        <span class="chat-title">Pulse Assistant</span>
        <div class="top-controls">
          <div id="mode-dropdown"></div>
          <div id="preset-dropdown"></div>
          <div id="usage-indicator"></div>
          <button type="button" id="open-drafts" class="ui-button ui-button-secondary">Drafts</button>
        </div>
      </header>
      <div id="chat-container">
        <div id="messages"></div>
        <div id="input-area">
          <input type="text" id="user-input" placeholder="Type a message..." autofocus>
          <button id="send-btn" class="ui-button ui-button-primary">Send</button>
        </div>
      </div>
    </main>
    <aside id="right-panel">
      <section class="panel-section" id="memory-section"></section>
      <section class="panel-section" id="pinned-section"></section>
    </aside>
  </div>
  <div id="selection-toolbar" class="hidden"></div>
  <div id="modal-root"></div>
  <div id="drafts-drawer" class="drawer"></div>
`;

const layout = document.querySelector('#layout');
const messageContainer = document.querySelector('#messages');
const userInput = document.querySelector('#user-input');
const sendBtn = document.querySelector('#send-btn');
const modeDropdownHost = document.querySelector('#mode-dropdown');
const presetDropdownHost = document.querySelector('#preset-dropdown');
const modalRoot = document.querySelector('#modal-root');
const toolbar = document.querySelector('#selection-toolbar');
let openDropdown = null;

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderDropdown(host, { id, label, selectedLabel, options }) {
  host.innerHTML = `
    <div class="ui-dropdown" data-dropdown="${id}">
      <button type="button" class="ui-button ui-button-secondary ui-dropdown-trigger" data-dropdown-trigger="${id}" aria-haspopup="listbox" aria-expanded="false">
        <span>${escapeHtml(label)}:</span>
        <strong>${escapeHtml(selectedLabel)}</strong>
        <span aria-hidden="true">▾</span>
      </button>
      <div class="ui-dropdown-menu hidden" data-dropdown-menu="${id}" role="listbox" aria-label="${escapeHtml(label)} options">
        ${options.map((option) => `<button type="button" class="ui-dropdown-item ${option.selected ? 'active' : ''}" data-dropdown-value="${id}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}
      </div>
    </div>
  `;
}

function syncSidebarA11y() {
  const sidebarToggle = document.querySelector('#sidebar-toggle');
  const isOpen = layout.classList.contains('sidebar-open');
  sidebarToggle.setAttribute('aria-expanded', String(isOpen));
}

function compileMemory(maxChars = 1800) {
  const enabled = appState.global.memoryItems.filter((m) => m.enabled);
  const sorted = [...enabled].sort((a, b) => (MEMORY_PRIORITY[a.type] || 9) - (MEMORY_PRIORITY[b.type] || 9));
  let lines = sorted.map((m) => `[${m.type}] ${m.key}: ${m.value}`);
  while (lines.join('\n').length > maxChars && lines.length > 1) lines.pop();
  return lines;
}

function compiledPinnedContext(maxChars = 1500) {
  const lines = appState.global.pinnedContexts.filter((c) => c.enabled).map((c) => `${c.label}: ${c.content}`);
  let text = lines.join('\n');
  while (text.length > maxChars && lines.length > 1) {
    lines.pop();
    text = lines.join('\n');
  }
  return lines;
}

function modePrompt(mode) {
  return {
    work: 'Be concise, action-oriented, and practical.',
    study: 'Explain step by step and check understanding with short checks.',
    planning: 'Focus on milestones, tasks, dependencies, and realistic timeline framing.',
    creative: 'Generate multiple variants and keep tone playful but structured.',
  }[mode];
}

function presetPrompt(preset) {
  return {
    'ultra concise': 'Use minimal words, compact bullets.',
    balanced: 'Use moderate detail and practical formatting.',
    detailed: 'Give thorough detail with clear section breakdown.',
    technical: 'Use technical depth, assumptions, and implementation specifics.',
    'for client': 'Use polished language suitable for client-facing communication.',
  }[preset];
}

function parseStructuredSections(content) {
  const sections = [];
  const blocks = content.split(/\n(?=#{0,3}\s*(Summary|Details|Action Steps|Risks|Sources)\s*:?\s*$)/i);
  const mapKind = (title) => {
    const t = title.toLowerCase();
    if (t.includes('summary')) return 'summary';
    if (t.includes('details')) return 'details';
    if (t.includes('action')) return 'actionSteps';
    if (t.includes('risk')) return 'risks';
    if (t.includes('source')) return 'sources';
    return 'custom';
  };
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines[0]) continue;
    const cleanTitle = lines[0].replace(/^#{0,3}\s*/, '').replace(/:$/, '');
    const kind = mapKind(cleanTitle);
    const body = lines.slice(1).join('\n').trim();
    if (STRUCTURED_KINDS.includes(kind) && body) {
      sections.push({ id: uid('sec'), title: cleanTitle, kind, content: body, collapsedByDefault: kind !== 'summary' });
    }
  }
  if (!sections.length) {
    const splitAt = Math.min(300, content.length);
    sections.push({ id: uid('sec'), title: 'Summary', kind: 'summary', content: content.slice(0, splitAt), collapsedByDefault: false });
    if (content.length > splitAt) {
      sections.push({ id: uid('sec'), title: 'Details', kind: 'details', content: content.slice(splitAt), collapsedByDefault: true });
    }
  }
  return sections;
}

function sectionCollapsedDefault(kind, mode, preset) {
  if (kind === 'summary') return false;
  if (preset === 'ultra concise') return kind !== 'actionSteps';
  if (mode === 'planning') return kind !== 'actionSteps';
  if (preset === 'detailed' || preset === 'technical') return false;
  return true;
}

function generateSuggestions(mode, preset, message) {
  const actionSteps = (message.structuredSections || []).find((s) => s.kind === 'actionSteps');
  const len = message.content.length;
  const base = {
    work: ['Turn into tasks', 'Draft email', 'Extract risks'],
    study: ['Quiz me', 'Explain simpler', 'Make flashcards'],
    planning: ['Make timeline', 'Add milestones', 'Estimate effort'],
    creative: ['Give 10 variants', 'Make punchier', 'Different tone'],
  }[mode];
  if (!actionSteps?.content?.trim()) base[0] = 'Turn into tasks';
  if (preset === 'technical') base[1] = 'Add implementation details';
  if (len < 220) base[2] = 'Expand this';
  return base.slice(0, 3).map((label) => ({ label, kind: label === 'Turn into tasks' ? 'edit' : 'prompt' }));
}

function updateUsage(promptText, completionText) {
  const usage = appState.global.usage;
  const now = new Date();
  if (now > new Date(usage.resetDateISO)) {
    usage.usedTokens = 0;
    usage.resetDateISO = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  }
  const estimate = Math.ceil((promptText.length + completionText.length) / 4);
  usage.usedTokens += estimate;
  usage.lastUpdatedAt = now.toISOString();
  saveState();
  renderUsage();
}

function buildSystemMessages(conv) {
  const mode = effectiveMode(conv);
  const preset = effectivePreset(conv);
  const memoryLines = compileMemory();
  const pinnedLines = compiledPinnedContext();
  const instructions = [
    'Respond in structured sections using headings: Summary, Details, Action Steps, Risks, Sources.',
    modePrompt(mode),
    presetPrompt(preset),
  ].join(' ');
  const messages = [{ role: 'system', content: instructions }];
  if (pinnedLines.length) messages.push({ role: 'system', content: `Pinned context:\n${pinnedLines.join('\n')}` });
  if (memoryLines.length) messages.push({ role: 'system', content: `Memory:\n${memoryLines.join('\n')}` });
  return messages;
}

function makeConversationPayload(conv) {
  return [...buildSystemMessages(conv), ...conv.messages.map((m) => ({ role: m.role, content: m.content }))];
}

function renderUsage() {
  const host = document.querySelector('#usage-indicator');
  if (!appState.global.showUsage) {
    host.innerHTML = '';
    return;
  }
  const { usedTokens, monthlyLimitTokens, resetDateISO } = appState.global.usage;
  const pct = Math.min(100, Math.round((usedTokens / monthlyLimitTokens) * 100));
  const warning = pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : '';
  host.innerHTML = `<div class="usage ${warning}"><small>${usedTokens}/${monthlyLimitTokens}</small><div class="bar"><span style="width:${pct}%"></span></div><small>reset ${new Date(resetDateISO).toLocaleDateString()}</small></div>`;
}

function saveMessageToMemory(messageId, initialText = '') {
  openModal({
    title: 'Save to memory',
    body: `
      <label>Type<select id="mem-type">${MEMORY_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select></label>
      <label>Key<input id="mem-key" value="snippet"></label>
      <label>Value<textarea id="mem-value">${initialText || ''}</textarea></label>
    `,
    onConfirm: () => {
      const type = document.querySelector('#mem-type').value;
      const key = document.querySelector('#mem-key').value.trim() || 'entry';
      const value = document.querySelector('#mem-value').value.trim();
      if (!value) return;
      const now = new Date().toISOString();
      appState.global.memoryItems.push({ id: uid('mem'), type, key, value, enabled: true, createdAt: now, updatedAt: now, sourceMessageId: messageId || null });
      saveState();
      renderMemory();
    },
  });
}

function openModal({ title, body, onConfirm }) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>${title}</h3>${body}<div class="modal-actions"><button id="modal-cancel">Cancel</button><button id="modal-ok">Save</button></div></div></div>`;
  document.querySelector('#modal-cancel').onclick = () => (modalRoot.innerHTML = '');
  document.querySelector('#modal-ok').onclick = () => {
    onConfirm?.();
    modalRoot.innerHTML = '';
  };
}

function runEditAction(action, selectedText, message) {
  const conv = currentConversation();
  const prompt = `Action: ${action}. Apply to selected text:\n${selectedText}`;
  sendModelRequest(prompt, conv, (output) => {
    message.editedSnippets = message.editedSnippets || [];
    message.editedSnippets.push({ id: uid('snip'), action, output });
    saveState();
    renderMessages();
  });
}

async function sendModelRequest(userText, conv, onDone) {
  const payload = makeConversationPayload(conv).concat([{ role: 'user', content: userText }]);
  let full = '';
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: payload }),
  });
  if (!response.ok || !response.body) throw new Error('Model request failed');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }
  updateUsage(payload.map((p) => p.content).join('\n'), full);
  onDone(full);
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  const conv = currentConversation();
  const userMsg = { id: uid('msg'), role: 'user', content: text, createdAt: new Date().toISOString() };
  conv.messages.push(userMsg);
  userInput.value = '';
  renderMessages();

  const assistantMsg = { id: uid('msg'), role: 'assistant', content: '', structuredSections: [], editedSnippets: [], suggestions: [], createdAt: new Date().toISOString() };
  conv.messages.push(assistantMsg);
  renderMessages();

  try {
    const payload = makeConversationPayload(conv);
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload }),
    });
    if (!response.ok || !response.body) throw new Error('Request failed');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    const target = document.querySelector(`[data-message-id="${assistantMsg.id}"] .message-content`);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      if (target) renderMarkdown(target, full);
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }
    assistantMsg.content = full;
    assistantMsg.structuredSections = parseStructuredSections(full).map((s) => ({ ...s, collapsedByDefault: sectionCollapsedDefault(s.kind, effectiveMode(conv), effectivePreset(conv)) }));
    assistantMsg.suggestions = generateSuggestions(effectiveMode(conv), effectivePreset(conv), assistantMsg);
    conv.title = conv.messages.find((m) => m.role === 'user')?.content.slice(0, 32) || conv.title;
    updateUsage(payload.map((p) => p.content).join('\n'), full);
  } catch (error) {
    assistantMsg.content = `Error: ${error.message}`;
  }
  saveState();
  renderMessages();
}

function renderMarkdown(element, markdown) {
  element.innerHTML = DOMPurify.sanitize(marked.parse(markdown || ''));
}

function copyText(text) {
  navigator.clipboard.writeText(text || '');
}

function renderMessages() {
  const conv = currentConversation();
  messageContainer.innerHTML = '';
  conv.messages.forEach((m) => {
    const wrap = document.createElement('div');
    wrap.className = `message ${m.role}`;
    wrap.dataset.messageId = m.id;
    const content = document.createElement('div');
    content.className = 'message-content';
    if (m.role === 'assistant' && m.structuredSections?.length) {
      content.innerHTML = m.structuredSections.map((s) => `<details ${s.collapsedByDefault ? '' : 'open'}><summary>${s.title}</summary><div>${DOMPurify.sanitize(marked.parse(s.content || ''))}</div></details>`).join('');
    } else if (m.role === 'assistant') {
      renderMarkdown(content, m.content);
    } else {
      content.textContent = m.content;
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `<button data-save="${m.id}">Save this</button>${m.role === 'assistant' ? `<button data-edit="${m.id}">Edit</button><button data-copyfull="${m.id}">Copy full</button><button data-copysummary="${m.id}">Copy summary</button><button data-copyactions="${m.id}">Copy action steps</button><button data-copymd="${m.id}">Copy as Markdown</button>` : ''}`;

    wrap.append(content, actions);

    if (m.editedSnippets?.length) {
      m.editedSnippets.forEach((snip) => {
        const s = document.createElement('div');
        s.className = 'snippet-block';
        s.innerHTML = `<strong>Edited snippet · ${snip.action}</strong><div class="snippet-content"></div><div class="snippet-actions"><button data-snip-copy="${snip.id}">Copy</button><button data-snip-draft="${snip.id}">Save to Drafts</button><button data-snip-memory="${snip.id}">Save to Memory</button></div>`;
        renderMarkdown(s.querySelector('.snippet-content'), snip.output);
        wrap.appendChild(s);
      });
    }

    if (m.role === 'assistant' && m.suggestions?.length) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      chips.innerHTML = m.suggestions.map((c) => `<button class="chip" data-chip="${m.id}" data-kind="${c.kind}" data-label="${c.label}">${c.label}</button>`).join('');
      wrap.appendChild(chips);
    }

    messageContainer.appendChild(wrap);
  });
}

function renderMemory() {
  const host = document.querySelector('#memory-section');
  const grouped = MEMORY_TYPES.map((type) => {
    const items = appState.global.memoryItems.filter((m) => m.type === type);
    return `<details><summary>${type[0].toUpperCase() + type.slice(1)} (${items.length})</summary>${items.map((m) => `<div class="item-row"><input type="checkbox" data-mem-toggle="${m.id}" ${m.enabled ? 'checked' : ''}><span>${m.key}: ${m.value}</span><button data-mem-edit="${m.id}">Edit</button><button data-mem-forget="${m.id}">Forget</button><button data-mem-del="${m.id}">Delete</button>${m.sourceMessageId ? `<button data-source="${m.sourceMessageId}">Source</button>` : ''}</div>`).join('')}</details>`;
  }).join('');
  host.innerHTML = `<h3>Memory</h3><button id="add-memory">Add memory</button><button id="view-memory-injected">View injected memory</button>${grouped}`;
}

function renderPinned() {
  const host = document.querySelector('#pinned-section');
  host.innerHTML = `<h3>Pinned context</h3><button id="add-pinned">Add pinned context</button><button id="view-pinned-injected">View injected context</button>${appState.global.pinnedContexts.map((c) => `<div class="item-row"><input type="checkbox" data-pin-toggle="${c.id}" ${c.enabled ? 'checked' : ''}><span>${c.label}</span><button data-pin-edit="${c.id}">Edit</button><button data-pin-del="${c.id}">Delete</button></div>`).join('')}`;
}

function renderSelectors() {
  const conv = currentConversation();
  renderDropdown(modeDropdownHost, {
    id: 'mode',
    label: 'Mode',
    selectedLabel: conv.mode ? modeLabels[conv.mode] : `Global (${modeLabels[appState.global.defaultMode]})`,
    options: [{ value: '', label: `Global (${modeLabels[appState.global.defaultMode]})`, selected: !conv.mode }, ...MODES.map((m) => ({ value: m, label: modeLabels[m], selected: conv.mode === m }))],
  });
  renderDropdown(presetDropdownHost, {
    id: 'preset',
    label: 'Preset',
    selectedLabel: conv.outputPreset || `Global (${appState.global.outputPreset})`,
    options: [{ value: '', label: `Global (${appState.global.outputPreset})`, selected: !conv.outputPreset }, ...PRESETS.map((p) => ({ value: p, label: p, selected: conv.outputPreset === p }))],
  });
}

function renderDrafts() {
  const drawer = document.querySelector('#drafts-drawer');
  drawer.innerHTML = `<div class="drawer-head"><h3>Drafts</h3><button id="close-drafts">Close</button></div>${appState.global.drafts.map((d, idx) => `<div class="draft-row"><span>${d.text.slice(0, 80)}</span><div><button data-draft-up="${d.id}" ${idx === 0 ? 'disabled' : ''}>↑</button><button data-draft-down="${d.id}" ${idx === appState.global.drafts.length - 1 ? 'disabled' : ''}>↓</button><button data-draft-copy="${d.id}">Copy</button><button data-draft-del="${d.id}">Delete</button></div></div>`).join('')}<button id="copy-drafts-md">Copy all as Markdown</button>`;
}

function handleGlobalClick(e) {
  const t = e.target;
  if (t.matches('[data-save]')) {
    const msg = currentConversation().messages.find((m) => m.id === t.dataset.save);
    saveMessageToMemory(msg.id, msg.content);
  }
  if (t.matches('[data-edit]')) {
    const msg = currentConversation().messages.find((m) => m.id === t.dataset.edit);
    openModal({
      title: 'Edit message text',
      body: `<textarea id="edit-text">${msg.content}</textarea><div class="quick-actions">${['Improve', 'Shorten', 'Expand', 'Make professional', 'Explain', 'Turn into tasks'].map((a) => `<button type="button" data-edit-run="${a}" data-msg="${msg.id}">${a}</button>`).join('')}</div>`,
    });
  }
  if (t.matches('[data-edit-run]')) {
    const msg = currentConversation().messages.find((m) => m.id === t.dataset.msg);
    const selected = document.querySelector('#edit-text').value;
    runEditAction(t.dataset.editRun, selected, msg);
    modalRoot.innerHTML = '';
  }
  if (t.matches('[data-chip]')) {
    const msg = currentConversation().messages.find((m) => m.id === t.dataset.chip);
    if (t.dataset.kind === 'edit') runEditAction(t.dataset.label, msg.content, msg);
    else {
      userInput.value = t.dataset.label;
      sendMessage();
    }
  }
  if (t.matches('#add-memory')) saveMessageToMemory(null, '');
  if (t.matches('#view-memory-injected')) openModal({ title: 'Injected memory', body: `<pre>${compileMemory().join('\n')}</pre>` });
  if (t.matches('[data-mem-toggle]')) {
    const item = appState.global.memoryItems.find((m) => m.id === t.dataset.memToggle);
    item.enabled = t.checked;
    item.updatedAt = new Date().toISOString();
    saveState();
  }
  if (t.matches('[data-mem-forget]')) {
    const item = appState.global.memoryItems.find((m) => m.id === t.dataset.memForget);
    item.enabled = false;
    item.updatedAt = new Date().toISOString();
    saveState(); renderMemory();
  }
  if (t.matches('[data-mem-del]')) {
    appState.global.memoryItems = appState.global.memoryItems.filter((m) => m.id !== t.dataset.memDel);
    saveState(); renderMemory();
  }
  if (t.matches('[data-mem-edit]')) {
    const item = appState.global.memoryItems.find((m) => m.id === t.dataset.memEdit);
    saveMessageToMemory(item.sourceMessageId, item.value);
  }
  if (t.matches('#add-pinned')) {
    openModal({ title: 'Add pinned context', body: '<label>Label<input id="pin-label"></label><label>Content<textarea id="pin-content"></textarea></label>', onConfirm: () => {
      appState.global.pinnedContexts.push({ id: uid('pin'), label: document.querySelector('#pin-label').value.trim() || 'context', content: document.querySelector('#pin-content').value.trim(), enabled: true });
      saveState(); renderPinned();
    } });
  }
  if (t.matches('[data-pin-toggle]')) {
    const item = appState.global.pinnedContexts.find((p) => p.id === t.dataset.pinToggle);
    item.enabled = t.checked; saveState();
  }
  if (t.matches('[data-pin-del]')) {
    appState.global.pinnedContexts = appState.global.pinnedContexts.filter((p) => p.id !== t.dataset.pinDel);
    saveState(); renderPinned();
  }
  if (t.matches('[data-pin-edit]')) {
    const item = appState.global.pinnedContexts.find((p) => p.id === t.dataset.pinEdit);
    openModal({ title: 'Edit pinned context', body: `<label>Label<input id="pin-label" value="${item.label}"></label><label>Content<textarea id="pin-content">${item.content}</textarea></label>`, onConfirm: () => {
      item.label = document.querySelector('#pin-label').value; item.content = document.querySelector('#pin-content').value; saveState(); renderPinned();
    } });
  }
  if (t.matches('#view-pinned-injected')) openModal({ title: 'Injected context', body: `<pre>${compiledPinnedContext().join('\n')}</pre>` });
  if (t.matches('#open-drafts')) {
    document.querySelector('#drafts-drawer').classList.add('open');
    renderDrafts();
  }
  if (t.matches('#close-drafts')) document.querySelector('#drafts-drawer').classList.remove('open');
  if (t.matches('[data-snip-copy]')) {
    const snip = currentConversation().messages.flatMap((m) => m.editedSnippets || []).find((s) => s.id === t.dataset.snipCopy);
    copyText(snip.output);
  }
  if (t.matches('[data-snip-draft]')) {
    const snip = currentConversation().messages.flatMap((m) => m.editedSnippets || []).find((s) => s.id === t.dataset.snipDraft);
    appState.global.drafts.push({ id: uid('d'), text: snip.output }); saveState(); renderDrafts();
  }
  if (t.matches('[data-snip-memory]')) {
    const snip = currentConversation().messages.flatMap((m) => m.editedSnippets || []).find((s) => s.id === t.dataset.snipMemory);
    saveMessageToMemory(null, snip.output);
  }
  if (t.matches('#copy-drafts-md')) copyText(appState.global.drafts.map((d) => `- ${d.text}`).join('\n'));
  if (t.matches('[data-draft-del]')) {
    appState.global.drafts = appState.global.drafts.filter((d) => d.id !== t.dataset.draftDel); saveState(); renderDrafts();
  }
  if (t.matches('[data-draft-copy]')) {
    const d = appState.global.drafts.find((x) => x.id === t.dataset.draftCopy); copyText(d.text);
  }
  if (t.matches('[data-draft-up], [data-draft-down]')) {
    const id = t.dataset.draftUp || t.dataset.draftDown;
    const idx = appState.global.drafts.findIndex((d) => d.id === id);
    const swap = t.dataset.draftUp ? idx - 1 : idx + 1;
    if (swap >= 0 && swap < appState.global.drafts.length) {
      [appState.global.drafts[idx], appState.global.drafts[swap]] = [appState.global.drafts[swap], appState.global.drafts[idx]];
      saveState(); renderDrafts();
    }
  }
  if (t.matches('[data-copyfull]')) {
    const m = currentConversation().messages.find((x) => x.id === t.dataset.copyfull); copyText(m.content);
  }
  if (t.matches('[data-copysummary]')) {
    const m = currentConversation().messages.find((x) => x.id === t.dataset.copysummary); copyText(m.structuredSections?.find((s) => s.kind === 'summary')?.content || '');
  }
  if (t.matches('[data-copyactions]')) {
    const m = currentConversation().messages.find((x) => x.id === t.dataset.copyactions); copyText(m.structuredSections?.find((s) => s.kind === 'actionSteps')?.content || '');
  }
  if (t.matches('[data-copymd]')) {
    const m = currentConversation().messages.find((x) => x.id === t.dataset.copymd); copyText((m.structuredSections || []).map((s) => `## ${s.title}\n${s.content}`).join('\n\n'));
  }
  if (t.matches('#new-chat-btn')) {
    const convId = uid('conv');
    appState.conversations.unshift({ id: convId, title: 'New chat', mode: null, outputPreset: null, messages: [] });
    appState.currentConversationId = convId;
    saveState();
    renderAll();
  }
  if (t.matches('#settings-btn')) {
    const u = appState.global.usage;
    openModal({ title: 'Settings', body: `<label>Monthly limit<input id="usage-limit" type="number" value="${u.monthlyLimitTokens}"></label><label>Reset date<input id="usage-reset" type="date" value="${u.resetDateISO.slice(0,10)}"></label><label><input id="usage-visible" type="checkbox" ${appState.global.showUsage ? 'checked' : ''}> Show usage indicator</label>`, onConfirm: () => {
      u.monthlyLimitTokens = Number(document.querySelector('#usage-limit').value) || u.monthlyLimitTokens;
      u.resetDateISO = new Date(document.querySelector('#usage-reset').value).toISOString();
      appState.global.showUsage = document.querySelector('#usage-visible').checked;
      saveState(); renderUsage();
    } });
  }
  if (t.matches('[data-dropdown-trigger]')) {
    const id = t.dataset.dropdownTrigger;
    const menu = document.querySelector(`[data-dropdown-menu="${id}"]`);
    const nextOpen = menu.classList.contains('hidden');
    document.querySelectorAll('[data-dropdown-menu]').forEach((m) => m.classList.add('hidden'));
    document.querySelectorAll('[data-dropdown-trigger]').forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    if (nextOpen) {
      menu.classList.remove('hidden');
      t.setAttribute('aria-expanded', 'true');
      openDropdown = id;
    } else openDropdown = null;
  }
  if (t.matches('[data-dropdown-value="mode"]')) {
    currentConversation().mode = t.dataset.value || null;
    saveState();
    renderSelectors();
    openDropdown = null;
  }
  if (t.matches('[data-dropdown-value="preset"]')) {
    currentConversation().outputPreset = t.dataset.value || null;
    saveState();
    renderSelectors();
    openDropdown = null;
  }
}

document.addEventListener('click', handleGlobalClick);
document.addEventListener('click', (e) => {
  if (!openDropdown) return;
  const clickedInside = e.target.closest('[data-dropdown]');
  if (!clickedInside) {
    document.querySelectorAll('[data-dropdown-menu]').forEach((m) => m.classList.add('hidden'));
    document.querySelectorAll('[data-dropdown-trigger]').forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    openDropdown = null;
  }
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.querySelector('#sidebar-toggle').addEventListener('click', () => {
  layout.classList.toggle('sidebar-open');
  syncSidebarA11y();
});
document.querySelector('#mobile-overlay').addEventListener('click', () => {
  layout.classList.remove('sidebar-open');
  syncSidebarA11y();
});

function showSelectionToolbar() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    toolbar.classList.add('hidden');
    return;
  }
  const text = selection.toString().trim();
  if (!text) return;
  const anchorNode = selection.anchorNode?.parentElement;
  const messageEl = anchorNode?.closest('.message.assistant');
  if (!messageEl) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const msg = currentConversation().messages.find((m) => m.id === messageEl.dataset.messageId);
  selectionContext = { text, messageId: msg.id };
  toolbar.innerHTML = ['Improve', 'Shorten', 'Expand', 'Make professional', 'Explain', 'Turn into tasks'].map((a) => `<button data-toolbar-action="${a}">${a}</button>`).join('');
  toolbar.style.left = `${rect.left + window.scrollX}px`;
  toolbar.style.top = `${rect.top + window.scrollY - 44}px`;
  toolbar.classList.remove('hidden');
}

document.addEventListener('selectionchange', () => setTimeout(showSelectionToolbar, 0));
toolbar.addEventListener('click', (e) => {
  const action = e.target.dataset.toolbarAction;
  if (!action || !selectionContext) return;
  const msg = currentConversation().messages.find((m) => m.id === selectionContext.messageId);
  runEditAction(action, selectionContext.text, msg);
  toolbar.classList.add('hidden');
});

function renderAll() {
  renderSelectors();
  renderMessages();
  renderMemory();
  renderPinned();
  renderUsage();
}

if (window.matchMedia('(max-width: 900px)').matches) layout.classList.remove('sidebar-open');
syncSidebarA11y();
renderAll();
