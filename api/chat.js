import { createGateway } from "@ai-sdk/gateway";
import { streamText } from "ai";

// API runtime configuration for consistent streaming support on serverless Node.
// Edit example: switch to edge only after verifying your AI SDK features are edge-compatible.
export const config = { runtime: "nodejs" };

// Normalizes env vars by trimming whitespace and accidental quote wrapping.
// Edit example: add `.replace(/\r?\n/g, "")` if deployment tooling injects newline artifacts.
function sanitizeEnv(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

// Creates framework-neutral JSON responses when running in Fetch-style runtimes.
// Edit example: append CORS headers here if this endpoint is called cross-origin.
function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Parses body payload for Node-style handlers where `req.json()` is unavailable.
// Edit example: support URL-encoded forms by detecting content-type and decoding accordingly.
function parseNodeBody(req) {
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

// Main chat streaming handler that validates input, calls the gateway model, and streams tokens.
// Edit example: add per-request model overrides from `body.model` with a safe allowlist check.
export default async function handler(req, res) {
  const isNodeRuntime = typeof res !== "undefined";
  const method = req?.method;

  if (method !== "POST") {
    if (isNodeRuntime) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = sanitizeEnv(process.env.AI_GATEWAY_API_KEY);
  if (!apiKey) {
    const payload = { error: "Server misconfiguration: Missing AI_GATEWAY_API_KEY" };
    if (isNodeRuntime) {
      res.status(500).json(payload);
      return;
    }
    return jsonResponse(500, payload);
  }

  let body;
  if (typeof req?.json === "function") {
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }
  } else {
    body = parseNodeBody(req);
    if (!body) {
      if (isNodeRuntime) {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }
      return jsonResponse(400, { error: "Invalid JSON body" });
    }
  }

  const { messages } = body ?? {};
  if (!Array.isArray(messages)) {
    if (isNodeRuntime) {
      res.status(400).json({ error: "`messages` must be an array" });
      return;
    }
    return jsonResponse(400, { error: "`messages` must be an array" });
  }

  const gateway = createGateway({ apiKey });
  const model = sanitizeEnv(process.env.AI_GATEWAY_MODEL) || "openai/gpt-4.1";

  try {
    const result = streamText({
      model: gateway(model),
      messages,
    });

    if (isNodeRuntime) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");

      for await (const textPart of result.textStream) {
        res.write(textPart);
      }
      res.end();
      return;
    }

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat handler failed:", error);
    if (isNodeRuntime) {
      res.status(500).json({ error: "Failed to stream chat response" });
      return;
    }
    return jsonResponse(500, { error: "Failed to stream chat response" });
  }
}
