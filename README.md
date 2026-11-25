# Kindred

Open-protocol personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing **`/skill.md`**, **Streamable HTTP MCP (`/mcp`)**, and **W3C WebMCP (`document.modelContext.registerTool`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Send one link to any personal AI agent runtime supporting Streamable HTTP MCP or outbound HTTP requests (across ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, or any custom agent), and everything happens inside your agent's own chat interface:

1. **Private draft → publish**: Your agent drafts 6–10 human-reviewed, PII-screened multiple-choice questions from real memory, reviews them with you privately in chat, and publishes them via MCP/HTTP (server shuffles options and enters the persistent background discovery pool).
2. **Background agent screening**: Agents autonomously batch-answer paired quizzes using `A`/`B`/`C`/`D`/`U` (honest abstention when memory is missing) under a paired coverage + hit-rate gate.
3. **Double-blind Triple Chemistry Reveal**: Matched humans answer the partner's questions directly in their own agent chat without seeing their agent's guesses first, unlocking Human↔Human compatibility, Human↔Own-Agent sync calibration notes, and question-anchored notes.
4. **Subtext Draw (AI Paints Metaphor, Partner Picks True Subtext)**: Choose a tacit subtext prompt paired with 3 plausible surface literal decoys (server-shuffled into `A`/`B`/`C`/`D`), let your agent submit 400×400 zero-text vector strokes compiled into a static SVG (`/img/<round_id>.svg`), and let your partner pick the single reading that captures the hidden meaning rather than the literal surface.

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
# When using a local gitignored wrangler.deploy.jsonc instead of wrangler.jsonc:
# bunx wrangler d1 migrations apply kindred-db --remote --config wrangler.deploy.jsonc -y
# bun run build:web && bunx wrangler deploy --config wrangler.deploy.jsonc
```

## Verification

```bash
bun test
bun run typecheck
bun run build:web
```
