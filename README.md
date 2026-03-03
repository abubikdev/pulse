# Pulse

Pulse is a client-first AI workspace built with Vite and vanilla JavaScript. It provides a multi-conversation chat experience with structured response formatting, memory and pinned context injection, streaming assistant output, usage tracking, and lightweight drafting tools.

## Product overview

Pulse is designed for day-to-day knowledge work where prompt context, continuity, and output control matter more than a bare chat box.

Core product goals:
- Keep chat fast and simple for daily use.
- Preserve important context between sessions in local storage.
- Give users practical controls for output style (mode + preset).
- Make post-processing easy (rewrite snippets, save drafts, save memory).
- Stream responses in real time through a minimal backend endpoint.

## Key features

### 1) Conversation workspace
- Multi-conversation sidebar with quick switching.
- Per-conversation overrides for:
  - **Mode** (`work`, `study`, `planning`, `creative`)
  - **Output preset** (`ultra concise`, `balanced`, `detailed`, `technical`, `for client`)
- Markdown-rendered assistant messages with sanitization.
- Real-time streaming responses from `/api/chat`.

### 2) Memory system
- Structured memory records grouped by type:
  - `preference`, `project`, `task`, `fact`, `note`
- Memory can be enabled/disabled, edited, forgotten, or deleted.
- Active memory is compiled and injected into the system prompt for each request.

### 3) Pinned context
- Add named context blocks (label + content) that remain available across chats.
- Toggle each item on/off.
- Active pinned items are compiled and injected as system context.

### 4) Deep-think behavior toggle
- Global `Deep think` control changes assistant guidance in system messages:
  - On: encourages deeper reasoning.
  - Off: biases toward faster concise responses.

### 5) Rewrite + draft tooling
- Selection toolbar lets users run rewrite/edit actions against selected text.
- Generated snippets can be copied, stored to drafts, or promoted to memory.
- Draft drawer supports reordering, copying, deletion, and markdown export.

### 6) Usage tracking
- Local token estimate tracking with:
  - Monthly token limit
  - Used token count
  - Reset date
  - Optional usage indicator visibility
- Usage progress bar shows warning/critical levels based on consumption.

### 7) Persistence and migration
- App state is persisted in `localStorage` under `pulse-app-state-v2`.
- Includes migration logic to normalize older versions into the current schema.

## Technical architecture

## Frontend stack
- **Vite** for dev/build tooling.
- **Vanilla JS** app logic in `src/main.js`.
- **marked** for markdown parsing.
- **DOMPurify** for output sanitization.
- CSS styling in `src/style.css`.

## Backend/API stack
- Serverless endpoint in `api/chat.js`.
- Uses:
  - `@ai-sdk/gateway`
  - `ai` (`streamText`)
- Streams model output back to the browser.

## Runtime model
1. User sends message from client UI.
2. Client builds message payload by combining:
   - System guidance (mode, preset, deep-think)
   - Active pinned context
   - Active memory
   - Conversation messages
3. Client POSTs payload to `/api/chat`.
4. API route calls AI Gateway model and streams plain text chunks.
5. Client appends chunks live to assistant message UI.
6. State is saved to local storage.

## Repository structure

```text
pulse/
├── api/
│   └── chat.js                  # Serverless streaming chat endpoint
├── public/
│   └── vite.svg                 # Vite static asset
├── scripts/
│   └── ai-gateway-test.mjs      # CLI smoke test for AI Gateway credentials/model
├── src/
│   ├── main.js                  # Main Pulse application UI/state logic
│   ├── script.js                # Lightweight demo chat bindings (simple entrypoint)
│   ├── style.css                # Product styling
│   └── javascript.svg           # Static asset
├── index.html                   # App shell + Vite entry
├── package.json                 # Scripts + dependencies
└── README.md                    # Project documentation
```

## Local development

## Prerequisites
- Node.js 18+
- npm
- AI Gateway credentials

## Install

```bash
npm install
```

## Run frontend locally (Vite)

```bash
npm run dev
```

Default Vite URL is typically `http://localhost:5173`.

## Run with Vercel local runtime (for API route parity)

```bash
npm run dev:vercel
```

This is useful when validating serverless route behavior exactly as deployed.

## Build and preview

```bash
npm run build
npm run preview
```

## Environment variables

Set these variables in your environment (or `.env` for local CLI script usage):

- `AI_GATEWAY_API_KEY` (required): API key for `@ai-sdk/gateway`.
- `AI_GATEWAY_MODEL` (optional): gateway model id.
  - Default: `openai/gpt-4.1`

Example:

```bash
export AI_GATEWAY_API_KEY="your_key"
export AI_GATEWAY_MODEL="openai/gpt-4.1"
```

## API documentation

## `POST /api/chat`

Streams text response from configured AI Gateway model.

### Request body

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

### Success behavior
- HTTP 200
- Streaming plain text response chunks

### Error responses
- `405` when method is not `POST`
- `400` when JSON body is invalid or `messages` is not an array
- `500` when `AI_GATEWAY_API_KEY` is missing or generation fails

## App state model

Pulse stores state as JSON under `localStorage` key `pulse-app-state-v2`.

Top-level shape:

```json
{
  "version": 2,
  "global": {
    "defaultMode": "work",
    "outputPreset": "balanced",
    "showUsage": true,
    "deepThink": true,
    "usage": {
      "monthlyLimitTokens": 150000,
      "usedTokens": 0,
      "resetDateISO": "...",
      "lastUpdatedAt": "..."
    },
    "memoryItems": [],
    "pinnedContexts": [],
    "drafts": []
  },
  "conversations": [
    {
      "id": "conv_...",
      "title": "New chat",
      "mode": null,
      "outputPreset": null,
      "messages": []
    }
  ],
  "currentConversationId": "conv_..."
}
```

## Operational notes

- Frontend relies on browser `localStorage`; clearing storage resets user data.
- Markdown output is sanitized before rendering to prevent unsafe HTML.
- Token usage is estimated client-side and should be treated as advisory.
- `src/script.js` is a lightweight/legacy-style chat helper and is separate from the full `src/main.js` app shell.

## Testing and diagnostics

## AI gateway smoke test

```bash
npm run ai:test
```

This runs `scripts/ai-gateway-test.mjs`, performs a streamed generation, and logs token usage.

## Basic manual QA checklist

1. Send a chat message and verify streamed assistant output.
2. Toggle deep-think and confirm behavior changes in responses.
3. Add memory item and confirm "View injected memory" contains it.
4. Add pinned context and confirm "View injected context" contains it.
5. Save a snippet to drafts, reorder drafts, and copy markdown export.
6. Open settings and update usage limit/reset date.
7. Reload page and verify all state persists.

## Deployment notes

- The app is ready for Vercel-style serverless deployment (`api/chat.js`).
- Ensure deployment environment includes `AI_GATEWAY_API_KEY`.
- Optionally pin `AI_GATEWAY_MODEL` per environment (staging vs production).

## Future improvement ideas

- Add authentication and server-side persistence for cross-device sync.
- Add conversation search and tags.
- Add export/import for full workspace backups.
- Add structured observability around API latency and failures.
- Add per-conversation model selection with allowlist validation.

---

If you want, I can also add:
1. A short **quick-start section for contributors**,
2. A **product user guide** with screenshots,
3. An **API contract table** for external integrators.
