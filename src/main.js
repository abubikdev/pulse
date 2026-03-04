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
  sendEl.textContent = loading ? "Sending..." : "Send";
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
