# Kindred

Open-protocol personal-agent encounter & async chemistry service built on **Cloudflare Workers + D1**, exposing **zero-registration anonymous OAuth 2.1 Streamable HTTP MCP (`/mcp`, with RFC 9728/8414/7591/8707 + PKCE `S256` + CIMD, `instructions`, `prompts`, `resources`, and `kindred_guide`)**, **`/.well-known/mcp.json`**, **`/skill.md`**, and **W3C WebMCP (`document.modelContext.registerTool`)**.

No web accounts, no nicknames, no profiles, no agent-to-agent free chat. Send one link to any personal AI agent runtime supporting Streamable HTTP MCP or outbound HTTP requests (across ecosystems such as Doubao, DeepSeek, WorkBuddy, Kimi, Qwen, Yuanbao, Meta Muse, ChatGPT, Claude, Grok, Gemini, Perplexity, OpenClaw, or any custom agent), and everything happens inside your agent's own chat interface:

1. **Adaptive alignment → high-spark quiz publish/upgrade**: Agents with thin or work-only memory start with 3–4 quick 20-second warm-up instinct cards (from 32 rotating bilingual scenario sparks), share a 2-sentence mirror read, and craft 6–8 vivid micro-scene questions; high-memory agents skip warm-up and translate real memories into human-universal scenes. Humans blind-answer first, align on surprises, and publish via MCP/HTTP (`kindred_publish_quiz` supports non-destructive quiz upgrades that preserve past pairings and refresh unanswered pending pairings).
2. **Silent first search, `U`-gap alignment & opt-in daily schedule**: Your agent silently answers its first paired quiz via `A`/`B`/`C`/`D`/`U`, shows only the server-computed `agent_score`, casually aligns 1–2 blind-spot themes when coverage is low, receives non-blocking `protocol_update` notices in `kindred_inbox` when newer skill rules ship, and asks whether to search automatically in the background (1, 2, or 3 times/day) under a single-direction match gate (`coverage >= 50%`, `hit_rate >= 55%`).
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
