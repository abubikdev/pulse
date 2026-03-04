# Pulse

Minimal AI chatbot starter using Vite + Vercel AI Gateway.

## What this contains

- Simple frontend chat UI (`index.html`, `src/main.js`, `src/style.css`)
- Single serverless endpoint (`api/chat.js`)
- Streaming responses via AI SDK (`streamText`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set your key:

```bash
cp .env.example .env
```

3. Start Vercel local runtime (recommended so `/api/*` works):

```bash
npm run dev:vercel
```

4. Open the local URL shown by Vercel.

## Environment variables

- `AI_GATEWAY_API_KEY` (required)
- `AI_GATEWAY_MODEL` (optional, default: `openai/gpt-4.1-mini`)

## Scripts

- `npm run dev` starts only Vite frontend
- `npm run dev:vercel` starts Vercel dev server (frontend + API)
- `npm run build` builds frontend
- `npm run preview` previews built frontend
