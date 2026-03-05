import "./style.css";

const messagesEl = document.querySelector("#messages");
const composerEl = document.querySelector("#composer");
const promptEl = document.querySelector("#prompt");
const sendEl = document.querySelector("#send");

const messages = [];

function addMessage(role, content = "") {
  const item = document.createElement("article");
  item.className = `message ${role}`;

  const label = document.createElement("span");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "Assistant";

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = content;

  item.append(label, text);
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return { item, text };
}

function setLoading(loading) {
  sendEl.disabled = loading;
  promptEl.disabled = loading;
  sendEl.innerHTML = loading ? "<img src='assets/arrow-up.svg' class='loading'>" : "<img src='assets/arrow-up.svg'>";
}

async function sendMessage(content) {
  messages.push({ role: "user", content });
  addMessage("user", content);

  const assistantMessage = addMessage("assistant", "");

  setLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      full += decoder.decode(value, { stream: true });
      assistantMessage.text.textContent = full;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    messages.push({ role: "assistant", content: full });
  } catch (error) {
    assistantMessage.text.textContent = "Request failed. Check your API route and env vars.";
    console.error(error);
  } finally {
    setLoading(false);
    promptEl.focus();
  }
}

composerEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = promptEl.value.trim();
  if (!content) return;

  promptEl.value = "";
  await sendMessage(content);
});

// Auto-grow only when content would overflow the visible area
const textarea = promptEl;

// Cache the one-line height (includes padding + borders)
let baseHeight = null;
function computeBaseHeight() {
  const cs = getComputedStyle(textarea);
  const lineHeight = parseFloat(cs.lineHeight) || 0;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;

  baseHeight = Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom);
  textarea.style.height = baseHeight + "px";
}

// Ensure we measure after CSS has applied
requestAnimationFrame(computeBaseHeight);
window.addEventListener("resize", computeBaseHeight);

function autosize() {
  if (baseHeight == null) computeBaseHeight();

  // Reset to base so scrollHeight reflects the true needed height (also enables shrinking)
  textarea.style.height = baseHeight + "px";

  // Only grow if the content would overflow the current visible height
  const needed = textarea.scrollHeight;
  if (needed > textarea.clientHeight) {
    textarea.style.height = needed + "px";
  }
}

textarea.addEventListener("input", autosize);