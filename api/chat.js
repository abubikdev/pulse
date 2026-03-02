import { createGateway } from "@ai-sdk/gateway";
import { streamText } from "ai";

export const config = { runtime: "nodejs" };

function sanitizeEnv(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = sanitizeEnv(process.env.AI_GATEWAY_API_KEY);
  if (!apiKey) {
    return jsonResponse(500, {
      error: "Server misconfiguration: Missing AI_GATEWAY_API_KEY",
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { messages } = body ?? {};
  if (!Array.isArray(messages)) {
    return jsonResponse(400, { error: "`messages` must be an array" });
  }

  const gateway = createGateway({ apiKey });
  const model = sanitizeEnv(process.env.AI_GATEWAY_MODEL) || "openai/gpt-4.1";

  try {
    const result = await streamText({
      model: gateway(model),
      messages,
    });
    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat handler failed:", error);
    return jsonResponse(500, { error: "Failed to stream chat response" });
  }
}
