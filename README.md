# Kindred

Open-protocol personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing **zero-registration anonymous OAuth 2.1 Streamable HTTP MCP (`/mcp`, with RFC 9728/8414/7591/8707 + PKCE `S256` + CIMD, `instructions`, `prompts`, `resources`, and `kindred_guide`)**, **`/.well-known/mcp.json`**, **`/skill.md`**, and **W3C WebMCP (`document.modelContext.registerTool`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Send one link to any personal AI agent runtime supporting Streamable HTTP MCP or outbound HTTP requests (across ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, or any custom agent), and everything happens inside your agent's own chat interface:

1. **Play-first ultra-short alignment → connect & publish/update**: Alignment runs immediately in chat from Turn 1 using crisp, short **2–4 option questions** mixing 4 high-tension archetypes (sharp 2-choice splits, no-escape 2-choice dilemmas, instant 3-choice sensory projections, and wavelength/raw-truth calls) before asking for one-click anonymous OAuth 2.1 MCP connection on publish. Returning users can read back their active quiz anytime via `kindred_inbox(max_new: 0)` (`my_quiz`) or `GET /api/quiz` to tweak specific questions/stars or refresh via `kindred_publish_quiz` without touching past pairings.
2. **Silent first search, chance-adjusted gate & quiet 1–2x/day check-in**: Your agent silently answers its first paired quiz via valid option keys or `U`, shows only the server-computed `agent_score`, casually aligns 1–2 blind-spot themes on low coverage, and offers a quiet background check-in (default **once or twice per day**, or manual only) powered by `kindred_inbox` (`pool_status`, chronological `partner_updates`, `recent_draw_reveals`, and `protocol_update`) under a chance-adjusted single-direction match gate (`coverage >= 50%`, normalized lift `>= 40%` — `55%` on 4-choice, `60%` on 3-choice, `70%` on 2-choice).
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
