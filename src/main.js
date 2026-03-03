import './style.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const STORAGE_KEY = 'pulse-app-state-v2';
const STATE_VERSION = 2;
// Model constants used by selectors and prompt builders.
// Edit example: add a new mode like `review` in `MODES`, then add a matching label in
// `modeLabels` and prompt text in `modePrompt()` so it appears in the UI and behaves consistently.
const MODES = ['work', 'study', 'planning', 'creative'];
const PRESETS = ['ultra concise', 'balanced', 'detailed', 'technical', 'for client'];
const MEMORY_TYPES = ['preference', 'project', 'task', 'fact', 'note'];
const MEMORY_PRIORITY = { preference: 1, project: 2, task: 3, fact: 4, note: 5 };
const modeLabels = { work: 'Work', study: 'Study', planning: 'Planning', creative: 'Creative' };

// Generates short stable-ish client ids for conversations/messages.
// Edit example: replace the date/random strategy with `crypto.randomUUID()` if you prefer
// UUIDs and do not rely on the current readable prefix format.
function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Creates the full persisted application model for a brand-new user/session.
// Edit example: change `monthlyLimitTokens` to adjust usage defaults or add new keys under
// `global` and initialize them here so old/new sessions both have predictable values.
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
      deepThink: true,
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

// Backfills older saved states into the current model shape (v2) without losing user data.
// Edit example: when adding `global.theme`, set `parsed.global.theme = parsed.global.theme || 'dark'`
// here to safely migrate existing localStorage entries.
function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return defaultState();
  if (!parsed.version) return { ...defaultState(), ...parsed, version: STATE_VERSION };
  parsed.version = STATE_VERSION;
  parsed.global = parsed.global || defaultState().global;
  parsed.global.memoryItems = parsed.global.memoryItems || [];
  parsed.global.deepThink = parsed.global.deepThink ?? true;
  parsed.global.pinnedContexts = parsed.global.pinnedContexts || [];
  parsed.global.drafts = parsed.global.drafts || [];
  parsed.conversations = Array.isArray(parsed.conversations) && parsed.conversations.length ? parsed.conversations : defaultState().conversations;
  parsed.currentConversationId = parsed.currentConversationId || parsed.conversations[0].id;
  return parsed;
}

// Loads the model from localStorage and falls back to defaults when storage is missing/corrupt.
// Edit example: swap `localStorage` with another storage adapter by changing this function and
// `saveState()` together.
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

// Persists the current in-memory model after user actions.
// Edit example: debounce this call if you add high-frequency updates (e.g., per-keystroke drafts)
// to reduce storage writes while keeping UX smooth.
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

// Resolves derived conversation settings using conversation overrides first, then global defaults.
// Edit example: add a third fallback source (like team settings) by extending these helpers only.
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
  <!-- Primary UI shell: sidebar, chat workspace, utility panels, and modal hosts.
       Edit example: to add a "Templates" button, place it in `.menu-actions` and wire it in
       event listeners near the bottom of this file for behavior + state updates. -->
  <div id="layout">
    <aside id="sidebar" aria-label="Sidebar">
      <div class="sidebar-header"><h1>pulse</h1><p>Minimal AI workspace</p></div>
      <nav class="sidebar-nav" aria-label="Primary">
        <button type="button" class="nav-item active">New chat</button>
        <button type="button" class="nav-item">Settings</button>
      </nav>
    </aside>
    <div id="mobile-overlay" aria-hidden="true"></div>
    <main id="chat-shell">
      <header id="chat-header">
        <div class="chat-header-spacer"></div>
        <div class="overflow-menu" data-overflow-menu>
          <button id="menu-toggle" type="button" class="menu-toggle" aria-label="Open chat controls" aria-expanded="false">…</button>
          <div id="overflow-menu-panel" class="overflow-menu-panel hidden">
            <div id="mode-dropdown"></div>
            <div id="preset-dropdown"></div>
            <div id="usage-indicator"></div>
            <button type="button" id="toggle-deepthink" class="ui-button ui-button-secondary"></button>
            <div class="menu-actions">
              <button type="button" id="new-chat-btn" class="ui-button ui-button-secondary">New chat</button>
              <button type="button" id="open-drafts" class="ui-button ui-button-secondary">Drafts</button>
              <button type="button" id="settings-btn" class="ui-button ui-button-secondary">Settings</button>
            </div>
          </div>
        </div>
      </header>
      <div id="chat-container">
        <div id="messages"></div>
        <div id="input-area">
          <button id="attach-btn" type="button" class="composer-icon" aria-label="Add attachment">＋</button>
          <input type="text" id="user-input" placeholder="Ask anything…" autofocus>
          <button id="send-btn" class="ui-button ui-button-primary" aria-label="Send">↑</button>
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
const menuToggle = document.querySelector('#menu-toggle');
const overflowMenuPanel = document.querySelector('#overflow-menu-panel');
let openDropdown = null;
let overflowMenuOpen = false;

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Reusable dropdown UI primitive used for mode/preset selectors.
// Edit example: add icons by extending option objects with `icon` and rendering it in each item.
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

function syncSidebarA11y() {}

// Compiles structured memory snippets into a compact context block for prompting.
// Edit example: reduce `maxChars` when latency/token cost is more important than recall depth.
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

// Prompt style presets: each returns instruction text tuned for a response mode.
// Edit example: change the "technical" preset to require numbered steps for implementation guides.
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

// Parses assistant output into semantic sections (summary, steps, checks, etc.) for richer UI.
// Edit example: add a new section marker like `Risks:` to show risk blocks in their own container.
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

// Heuristic defaults for section collapse state based on mode/preset.
// Edit example: keep `checks` expanded in `work` mode by returning `false` for that combination.
function sectionCollapsedDefault(kind, mode, preset) {
  if (kind === 'summary') return false;
  if (preset === 'ultra concise') return kind !== 'actionSteps';
  if (mode === 'planning') return kind !== 'actionSteps';
  if (preset === 'detailed' || preset === 'technical') return false;
  return true;
}

// Suggests quick follow-up actions shown under assistant messages.
// Edit example: append a suggestion like "Convert to checklist" for planning-heavy conversations.
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

// Lightweight token estimation used for monthly budget feedback in the header.
// Edit example: replace the 4-char heuristic with a tokenizer library if you need tighter accuracy.
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
  renderDeepThinkToggle();
}

// Builds system/developer context sent with each request (mode, preset, memory, pinning, toggles).
// Edit example: prepend compliance instructions here if you need responses to follow stricter policy.
function buildSystemMessages(conv) {
  const mode = effectiveMode(conv);
  const preset = effectivePreset(conv);
  const memoryLines = compileMemory();
  const pinnedLines = compiledPinnedContext();
  const instructions = [
    'Give direct, natural responses unless the user asks for a specific format.',
    'Use Markdown when useful, including fenced code blocks for code.',
    appState.global.deepThink ? 'For difficult questions, spend extra time reasoning before answering. Optionally include a brief <thinking>...</thinking> block.' : 'Keep reasoning brief and answer quickly.',
    modePrompt(mode),
    presetPrompt(preset),
  ].join(' ');
  const messages = [{ role: 'system', content: instructions }];
  if (pinnedLines.length) messages.push({ role: 'system', content: `Pinned context:\n${pinnedLines.join('\n')}` });
  if (memoryLines.length) messages.push({ role: 'system', content: `Memory:\n${memoryLines.join('\n')}` });
  return messages;
}

// Adapts local conversation model into API payload shape consumed by `/api/chat`.
// Edit example: include multimodal attachments by mapping them into extra message parts here.
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

// Modal factory used by quick actions (save memory, rewrite snippets, etc.).
// Edit example: inject custom validation before `onConfirm` to block empty or malformed submissions.
function openModal({ title, body, onConfirm }) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>${title}</h3>${body}<div class="modal-actions"><button id="modal-cancel">Cancel</button><button id="modal-ok">Save</button></div></div></div>`;
  document.querySelector('#modal-cancel').onclick = () => (modalRoot.innerHTML = '');
  document.querySelector('#modal-ok').onclick = () => {
    onConfirm?.();
    modalRoot.innerHTML = '';
  };
}

// Applies editing operations to selected text with optional AI-assisted transformations.
// Edit example: add an `action === 'shorten'` path that trims verbosity while preserving key facts.
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

  const assistantMsg = { id: uid('msg'), role: 'assistant', content: '', editedSnippets: [], createdAt: new Date().toISOString() };
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
    conv.title = conv.messages.find((m) => m.role === 'user')?.content.slice(0, 32) || conv.title;
    updateUsage(payload.map((p) => p.content).join('\n'), full);
  } catch (error) {
    assistantMsg.content = `Error: ${error.message}`;
  }
  saveState();
  renderMessages();
}

// Renders trusted markdown safely by sanitizing HTML first.
// Edit example: allow additional safe tags by tuning DOMPurify config if formatting needs expand.
function renderMarkdown(element, markdown) {
  element.innerHTML = DOMPurify.sanitize(marked.parse(markdown || ''));
}

// Extracts collapsible "thinking" blocks from markdown for optional reveal in the UI.
// Edit example: support custom delimiters like `:::thinking` if your prompt format changes.
function parseThinkingBlocks(markdown = '') {
  const blocks = [];
  const cleaned = markdown.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, thought) => {
    if (thought?.trim()) blocks.push(thought.trim());
    return '';
  }).trim();
  return { cleaned, blocks };
}

function renderAssistantContent(element, markdown) {
  const { cleaned, blocks } = parseThinkingBlocks(markdown);
  renderMarkdown(element, cleaned || markdown);
  blocks.forEach((thought) => {
    const details = document.createElement('details');
    details.className = 'thinking-block';
    details.innerHTML = `<summary>Thinking</summary><div class="thinking-content"></div>`;
    renderMarkdown(details.querySelector('.thinking-content'), thought);
    element.appendChild(details);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text || '');
}

// Main message list renderer: paints user/assistant entries and action controls.
// Edit example: show timestamps by adding a small metadata row using each message's `createdAt`.
function renderMessages() {
  const conv = currentConversation();
  messageContainer.innerHTML = '';
  conv.messages.forEach((m) => {
    const wrap = document.createElement('div');
    wrap.className = `message ${m.role}`;
    wrap.dataset.messageId = m.id;
    const content = document.createElement('div');
    content.className = 'message-content';
    if (m.role === 'assistant') {
      renderAssistantContent(content, m.content);
    } else {
      content.textContent = m.content;
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = m.role === 'assistant'
      ? `<button data-copyfull="${m.id}">Copy</button><button data-save="${m.id}">Save</button>`
      : '';

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
    messageContainer.appendChild(wrap);
  });
}

// Side-panel renderers for long-lived context state.
// Edit example: reorder memory chips by recency instead of `MEMORY_PRIORITY` for active projects.
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

function renderDeepThinkToggle() {
  const button = document.querySelector('#toggle-deepthink');
  if (!button) return;
  button.textContent = `Deep think: ${appState.global.deepThink ? 'On' : 'Off'}`;
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
    closeOverflowMenu();
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
  if (t.matches('#new-chat-btn')) {
    const convId = uid('conv');
    appState.conversations.unshift({ id: convId, title: 'New chat', mode: null, outputPreset: null, messages: [] });
    appState.currentConversationId = convId;
    saveState();
    renderAll();
    closeOverflowMenu();
  }
  if (t.matches('#toggle-deepthink')) {
    appState.global.deepThink = !appState.global.deepThink;
    saveState();
    renderDeepThinkToggle();
  }
  if (t.matches('#settings-btn')) {
    const u = appState.global.usage;
    openModal({ title: 'Settings', body: `<label>Monthly limit<input id="usage-limit" type="number" value="${u.monthlyLimitTokens}"></label><label>Reset date<input id="usage-reset" type="date" value="${u.resetDateISO.slice(0,10)}"></label><label><input id="usage-visible" type="checkbox" ${appState.global.showUsage ? 'checked' : ''}> Show usage indicator</label>`, onConfirm: () => {
      u.monthlyLimitTokens = Number(document.querySelector('#usage-limit').value) || u.monthlyLimitTokens;
      u.resetDateISO = new Date(document.querySelector('#usage-reset').value).toISOString();
      appState.global.showUsage = document.querySelector('#usage-visible').checked;
      saveState(); renderUsage();
    } });
    closeOverflowMenu();
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

function closeOverflowMenu() {
  overflowMenuOpen = false;
  overflowMenuPanel.classList.add('hidden');
  menuToggle.setAttribute('aria-expanded', 'false');
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

document.addEventListener('click', (e) => {
  if (!overflowMenuOpen) return;
  if (!e.target.closest('[data-overflow-menu]')) closeOverflowMenu();
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
menuToggle.addEventListener('click', () => {
  overflowMenuOpen = !overflowMenuOpen;
  overflowMenuPanel.classList.toggle('hidden', !overflowMenuOpen);
  menuToggle.setAttribute('aria-expanded', String(overflowMenuOpen));
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

// Renders all interactive surfaces after state changes.
// Edit example: split this into targeted render calls if performance tuning is needed later.
function renderAll() {
  renderSelectors();
  renderMessages();
  renderMemory();
  renderPinned();
  renderUsage();
  renderDeepThinkToggle();
}

renderAll();
