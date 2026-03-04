import { streamText } from "ai";

export const config = { runtime: "nodejs" };

function parseBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;

  if (typeof req?.body === "string" && req.body.length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter((msg) => msg && typeof msg === "object")
    .map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
    }))
    .filter((msg) =>
      (msg.role === "system" || msg.role === "user" || msg.role === "assistant") &&
      msg.content.length > 0,
    );

  return normalized.length > 0 ? normalized : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    res.status(500).json({ error: "Missing AI_GATEWAY_API_KEY" });
    return;
  }

  const body = parseBody(req);
  const messages = normalizeMessages(body?.messages);

  if (!messages) {
    res.status(400).json({ error: "Body must include a non-empty messages array" });
    return;
  }

  const model = process.env.AI_GATEWAY_MODEL || "openai/gpt-4.1-mini";

  try {
    const result = streamText({
      model,
      messages,
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    for await (const textPart of result.textStream) {
      res.write(textPart);
    }

    res.end();
  } catch (error) {
    console.error("Chat request failed", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
}
