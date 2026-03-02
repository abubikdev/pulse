// src/main.js
import './style.css'; // Import your CSS
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 1. Define and Inject HTML Structure
document.querySelector('#app').innerHTML = `
  <div id="layout" class="sidebar-open">
    <aside id="sidebar" aria-label="Sidebar">
      <div class="sidebar-header">
        <h1>Pulse</h1>
      </div>
      <nav class="sidebar-nav" aria-label="Primary">
        <button type="button" class="nav-item active">New chat</button>
        <button type="button" class="nav-item">Recent chats</button>
        <button type="button" class="nav-item">Settings</button>
      </nav>
    </aside>

    <div id="mobile-overlay" aria-hidden="true"></div>

    <main id="chat-shell">
      <header id="chat-header">
        <button id="sidebar-toggle" type="button" aria-label="Toggle sidebar" aria-expanded="false">☰</button>
        <span class="chat-title">Pulse Assistant</span>
      </header>

      <div id="chat-container">
        <div id="messages"></div>
        <div id="input-area">
          <input type="text" id="user-input" placeholder="Type a message..." autofocus>
          <button id="send-btn">Send</button>
        </div>
      </div>
    </main>
  </div>
`;

const layout = document.querySelector('#layout');
const sidebarToggle = document.querySelector('#sidebar-toggle');
const mobileOverlay = document.querySelector('#mobile-overlay');
const messageContainer = document.querySelector('#messages');
const userInput = document.querySelector('#user-input');
const sendBtn = document.querySelector('#send-btn');

let chatHistory = []; // Keeps track of conversation memory

function syncSidebarA11y() {
  const isOpen = layout.classList.contains('sidebar-open');
  sidebarToggle.setAttribute('aria-expanded', String(isOpen));
}

function closeSidebarOnMobile() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    layout.classList.remove('sidebar-open');
    syncSidebarA11y();
  }
}

// 2. The AI Chat Logic
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Add User Message to UI & History
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  userInput.value = '';
  closeSidebarOnMobile();

  // Create placeholder for AI response
  const aiMessageDiv = appendMessage('assistant', '');
  let fullAiResponse = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorPayload = await response.json().catch(() => null);
        if (errorPayload?.error) message = errorPayload.error;
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('Empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fullAiResponse += decoder.decode(value, { stream: true });
      renderMarkdown(aiMessageDiv, fullAiResponse);
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    chatHistory.push({ role: 'assistant', content: fullAiResponse });
  } catch (error) {
    aiMessageDiv.textContent = `Error: ${error.message || 'Could not connect to the AI function.'}`;
  }
}

function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  if (role === 'assistant') {
    renderMarkdown(msgDiv, text);
  } else {
    msgDiv.textContent = text;
  }

  messageContainer.appendChild(msgDiv);
  return msgDiv;
}

function renderMarkdown(element, markdown) {
  const rawHtml = marked.parse(markdown || '');
  element.innerHTML = DOMPurify.sanitize(rawHtml);
}

// 3. Event Listeners
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
sidebarToggle.addEventListener('click', () => {
  layout.classList.toggle('sidebar-open');
  syncSidebarA11y();
});
mobileOverlay.addEventListener('click', () => {
  layout.classList.remove('sidebar-open');
  syncSidebarA11y();
});

if (window.matchMedia('(max-width: 900px)').matches) {
  layout.classList.remove('sidebar-open');
}
syncSidebarA11y();
