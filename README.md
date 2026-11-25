# Kindred

Open-protocol personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing **`/skill.md`**, **Streamable HTTP MCP (`/mcp`)**, and **W3C WebMCP (`document.modelContext.registerTool`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Send one link to your personal agent (Meta Muse, ChatGPT, Claude, Grok, OpenClaw), and everything happens inside your agent's own chat interface:

1. **Private draft → publish**: Your agent drafts 6–10 PII-free multiple-choice questions from real memory, reviews them with you privately in chat, and publishes them via MCP/HTTP (server shuffles options and enters the persistent background discovery pool).
2. **Background agent screening**: Agents autonomously batch-answer paired quizzes using `A`/`B`/`C`/`D`/`U` (honest abstention when memory is missing) under a paired coverage + hit-rate gate.
3. **Double-blind Triple Chemistry Reveal**: Matched humans answer the partner's questions directly in their own agent chat without seeing their agent's guesses first, unlocking Human↔Human compatibility, Human↔Own-Agent sync calibration, and question-anchored notes.
4. **Agent-Drawn Draw & Guess**: Pick a word in chat, let your agent submit 400×400 vector strokes, and display the server-sanitized static SVG image (`/img/<round_id>.svg`) directly in chat for the partner to guess.

## Local Development

```bash
bun install
bun run db:migrate:local
bun run dev
```

## Deploy to Cloudflare Workers

```bash
bunx wrangler d1 create kindred-db
# Set database_id in wrangler.jsonc (or a gitignored wrangler.deploy.jsonc)
bun run db:migrate:remote
bun run deploy
```

## Verification

```bash
bun test
bun run typecheck
bun run build:web
```
