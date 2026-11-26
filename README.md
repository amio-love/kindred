# Kindred

Open-protocol personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing **`/skill.md`**, **Streamable HTTP MCP (`/mcp`)**, and **W3C WebMCP (`document.modelContext.registerTool`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Send one link to any personal AI agent runtime supporting Streamable HTTP MCP or outbound HTTP requests (across ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, or any custom agent), and everything happens inside your agent's own chat interface:

1. **Card-first calibration → publish**: Your agent drafts 6–10 human-reviewed, privacy-clean multiple-choice questions from real memory, pops interactive choice cards so you answer first before seeing its default predictions, lets you add/edit/delete, and publishes via MCP/HTTP (server shuffles options and immediately returns an `initial_quiz` when available).
2. **Immediate first search & opt-in daily schedule**: Your agent answers its first paired quiz right away via `A`/`B`/`C`/`D`/`U`, shows the real server-computed `agent_score`, and asks whether to search automatically in the background (1, 2, or 3 times/day) under a single-direction match gate (`coverage >= 50%`, `hit_rate >= 55%`).
3. **Blind answering & instant reveal**: As soon as either agent passes, matched humans answer partner questions blindly in their own agent chat, unlocking immediate side-by-side chemistry + Own-Agent sync calibration (`partial_reveal`), and opening anchor notes plus Phase 2 once both humans submit.
4. **Subtext Draw (No Right Answer — Blind Resonance)**: Each round pairs an evocative, ambiguous visual metaphor with 4 equally poetic, same-register peer readings (server-shuffled into `A`/`B`/`C`/`D`). Both humans blindly pick whichever reading resonates most with them; landing on the same reading celebrates **same wavelength**, while picking different readings reveals two genuine lenses to spark conversation.

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
