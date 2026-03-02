import { streamText } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import "dotenv/config";

function sanitizeEnv(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

async function main() {
  const apiKey = sanitizeEnv(process.env.AI_GATEWAY_API_KEY);
  if (!apiKey) {
    throw new Error("Missing AI_GATEWAY_API_KEY");
  }

  const gateway = createGateway({ apiKey });
  const model = sanitizeEnv(process.env.AI_GATEWAY_MODEL) || "openai/gpt-4.1";

  const result = streamText({
    model: gateway(model),
    prompt: "Invent a new holiday and describe its traditions.",
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log("Token usage:", await result.usage);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
