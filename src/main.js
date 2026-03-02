// src/main.js
import './style.css'; // Import your CSS
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 1. Define and Inject HTML Structure
document.querySelector('#app').innerHTML = `
  <div id="chat-container">
    <div id="messages"></div>
    <div id="input-area">
      <input type="text" id="user-input" placeholder="Type a message..." autofocus>
      <button id="send-btn">Send</button>
    </div>
  </div>
`;

const messageContainer = document.querySelector('#messages');
const userInput = document.querySelector('#user-input');
const sendBtn = document.querySelector('#send-btn');

let chatHistory = []; // Keeps track of conversation memory

// 2. The AI Chat Logic
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Add User Message to UI & History
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  userInput.value = '';

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
