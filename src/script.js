const chatLog = document.querySelector('#chat-log');
const input = document.querySelector('#user-input');
let history = []; // Chat history memory

async function handleChat() {
  const userText = input.value.trim();
  if (!userText) return;

  // 1. Add user message
  appendMessage('user', userText);
  history.push({ role: 'user', content: userText });
  input.value = '';

  // 2. Prepare AI placeholder
  const aiDiv = appendMessage('assistant', '...');
  let fullContent = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: history }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      // Clean Vercel AI SDK stream metadata (e.g., 0:"text")
      const text = chunk.replace(/^\d+:"|"$|\\n/g, (m) => m === '\\n' ? '\n' : '');
      
      fullContent += text;
      aiDiv.innerText = fullContent; // Update UI live
    }
    
    history.push({ role: 'assistant', content: fullContent });
  } catch (err) {
    aiDiv.innerText = "Error connecting to AI.";
  }
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerText = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

document.querySelector('#send-btn').onclick = handleChat;
